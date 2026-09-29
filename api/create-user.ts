// Vercel Serverless Function: cria um usuário no Firebase Auth + Firestore
// usando o Admin SDK, do lado do servidor. Diferente de
// createUserWithEmailAndPassword no navegador, isso NÃO troca a sessão de
// quem está chamando (o admin continua logado como admin).
//
// Requer a variável de ambiente FIREBASE_SERVICE_ACCOUNT no Vercel, com o
// conteúdo do JSON da chave de serviço (o mesmo tipo de credencial usada
// no server.js do NexClaim).

import type { App } from 'firebase-admin/app';

type AppModule = typeof import('firebase-admin/app');

// Carrega o firebase-admin só quando a função é chamada, e não no topo do arquivo.
// Se o carregamento falhar na Vercel, o erro volta como JSON legível pra tela, em vez
// de derrubar a função inteira com um 500 sem explicação nenhuma.
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

// Tipos mínimos da requisição/resposta da Vercel, declarados aqui pra não precisar
// instalar o pacote @vercel/node só por causa deles.
interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

function getBearerToken(req: ApiRequest): string {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw || '';
  return value.replace('Bearer ', '');
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { appMod, getAuth, getFirestore } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // 1. Confirma que quem está chamando está logado E é admin
    const idToken = getBearerToken(req);
    if (!idToken) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    const decoded = await auth.verifyIdToken(idToken);
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Só administradores podem criar usuários' });
    }

    // 2. Valida os dados recebidos
    const { name, username, email, cpf, password, role, person, allowedPersons } = req.body || {};
    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Preencha nome, usuário, e-mail e senha' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
    }

    // 3. Cria o usuário no Firebase Auth (sem afetar a sessão de ninguém,
    //    porque isso roda no servidor, não no navegador)
    const newUser = await auth.createUser({
      email: email.trim().toLowerCase(),
      password,
      displayName: name.trim(),
    });

    // 4. Cria o documento no Firestore, já com as chaves normalizadas
    const finalPerson = person?.trim() || name.trim();
    const finalAllowedPersons = role === 'gerente' ? allowedPersons?.trim() || '' : '';

    const record = {
      id: newUser.uid,
      name: name.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      cpf: cpf?.trim() || '',
      role: role || 'usuario',
      person: finalPerson,
      allowedPersons: finalAllowedPersons,
      status: 'ativo',
      personKeys: toPersonKeys([finalPerson, name, username].filter(Boolean)),
      allowedPersonKeys: finalAllowedPersons ? toPersonKeys(finalAllowedPersons) : [],
      createdAt: new Date().toISOString(),
    };

    await db.collection('users').doc(newUser.uid).set(record);

    // 5. Mantém a coleção user_lookup em dia (login por username/CPF)
    const lookupIds = new Set([normalize(username), normalize(email)]);
    const cpfDigits = (cpf || '').replace(/\D/g, '');
    if (cpfDigits.length >= 11) lookupIds.add(cpfDigits);
    await Promise.all(
      [...lookupIds].map((id) =>
        db.collection('user_lookup').doc(id).set({ email: email.trim().toLowerCase() }, { merge: true })
      )
    );

    return res.status(200).json({ success: true, uid: newUser.uid });
  } catch (err: any) {
    console.error('Erro ao criar usuário:', err);
    const message = err.code === 'auth/email-already-exists' ? 'Esse e-mail já está em uso' : describeError(err);
    return res.status(500).json({ error: message });
  }
}
