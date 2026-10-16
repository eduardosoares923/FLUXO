// Vercel Serverless Function: cadastro público ("Criar conta") de uma nova família.
// Cria o usuário no Firebase Auth + documento em users/<uid> como administrador da
// própria família (role: 'admin', familyId: uid).
//
// ATENÇÃO: falta rate limit por IP; o próximo passo de proteção é adicionar
// reCAPTCHA / Firebase App Check antes de abrir a tela pública de cadastro.

import type { App } from 'firebase-admin/app';

type AppModule = typeof import('firebase-admin/app');

async function loadFirebaseAdmin() {
  const [appMod, authMod, firestoreMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  return { appMod, getAuth: authMod.getAuth, getFirestore: firestoreMod.getFirestore };
}

function describeError(err: any): string {
  const code = err && err.code ? `[${err.code}] ` : '';
  return `${code}${(err && err.message) || String(err)}`;
}

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

function getAdminApp(appMod: AppModule): App {
  const { initializeApp, getApps, getApp, cert } = appMod;
  if (getApps().length > 0) return getApp();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('A variável FIREBASE_SERVICE_ACCOUNT não está configurada na Vercel (Settings > Environment Variables).');
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('A variável FIREBASE_SERVICE_ACCOUNT existe mas não é um JSON válido. Cole o conteúdo inteiro do arquivo da chave de serviço.');
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

function normalize(str: unknown): string {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPersonKeys(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(arr.map((p) => normalize(p)).filter(Boolean))];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const rawBody = req.body || {};
    if (typeof rawBody !== 'object' || JSON.stringify(rawBody).length > 2048) {
      return res.status(400).json({ error: 'Requisição inválida' });
    }

    const { name, email, password, website } = rawBody;

    // Honeypot contra bots: se "website" vier preenchido, finge sucesso sem criar nada
    if (website && String(website).trim() !== '') {
      return res.status(200).json({ success: true });
    }

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'O nome deve ter entre 2 e 80 caracteres' });
    }
    if (!cleanEmail || cleanEmail.length > 160 || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Informe um e-mail válido' });
    }
    if (cleanPassword.length < 6 || cleanPassword.length > 128) {
      return res.status(400).json({ error: 'A senha deve ter entre 6 e 128 caracteres' });
    }

    const { appMod, getAuth, getFirestore } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const newUser = await auth.createUser({
      email: cleanEmail,
      password: cleanPassword,
      displayName: cleanName,
    });

    const uid = newUser.uid;
    const emailPrefix = cleanEmail.split('@')[0] || '';
    const username = normalize(emailPrefix).replace(/[^a-z0-9._-]/g, '') || uid.slice(0, 8);

    const record = {
      id: uid,
      name: cleanName,
      username,
      email: cleanEmail,
      cpf: '',
      role: 'admin',
      person: cleanName,
      allowedPersons: '',
      status: 'ativo',
      personKeys: toPersonKeys([cleanName, username].filter(Boolean)),
      allowedPersonKeys: [],
      familyId: uid,
      createdAt: new Date().toISOString(),
    };

    await db.collection('users').doc(uid).set(record);

    // Cria os atalhos em user_lookup SOMENTE se ainda não existirem (.create()),
    // ignorando conflito caso o username já pertença a alguém de outra família.
    const lookupIds = [...new Set([normalize(cleanEmail), normalize(username)].filter(Boolean))];
    await Promise.all(
      lookupIds.map((id) =>
        db
          .collection('user_lookup')
          .doc(id)
          .create({ email: cleanEmail })
          .catch(() => {})
      )
    );

    return res.status(200).json({ success: true });
  } catch (err: any) {
    if (err && err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Esse e-mail já está em uso' });
    }
    console.error('Erro no cadastro público (signup):', err);
    return res.status(500).json({ error: describeError(err) });
  }
}
