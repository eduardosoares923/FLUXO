// Vercel Serverless Function: cadastro público ("Criar nova conta") com aprovação.
// Cria o usuário no Firebase Auth + documento em users/<uid> SEMPRE com status: 'pendente'.
// O usuário só consegue entrar depois que o superAdmin (ou o chefe da família convidante) aprovar.
//
// Proteções ativas:
// 1. Campo honeypot ("website"): se vier preenchido, responde 200 sem criar nada.
// 2. Rate limit por IP: em memória + coleção "_rate_limits" no Firestore com expiração (TTL em expiresAt),
//    limitando a 5 tentativas por IP a cada 15 minutos.
// 3. Mensagem neutra ao pedir entrada em família por código de convite (não revela se código/e-mail existe).

import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { TERMS_VERSION, PRIVACY_VERSION } from './_legal.js';

type AppModule = typeof import('firebase-admin/app');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS_PER_WINDOW = 5;
const memoryRateMap = new Map<string, { count: number; windowStartMs: number }>();

async function loadFirebaseAdmin() {
  const [appMod, authMod, firestoreMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  return {
    appMod,
    getAuth: authMod.getAuth,
    getFirestore: firestoreMod.getFirestore,
    FieldValue: firestoreMod.FieldValue,
  };
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

function getClientIpHash(req: ApiRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const rawIp = (Array.isArray(xff) ? xff[0] : xff || req.headers['x-real-ip'] || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
  return createHash('sha256').update(`wynd_signup_${rawIp}`).digest('hex').slice(0, 32);
}

async function checkRateLimit(db: Firestore, ipHash: string): Promise<boolean> {
  const now = Date.now();

  // 1. Verificação rápida em memória da instância
  const mem = memoryRateMap.get(ipHash);
  if (mem) {
    if (now - mem.windowStartMs < WINDOW_MS) {
      if (mem.count >= MAX_ATTEMPTS_PER_WINDOW) return false;
      mem.count += 1;
    } else {
      memoryRateMap.set(ipHash, { count: 1, windowStartMs: now });
    }
  } else {
    memoryRateMap.set(ipHash, { count: 1, windowStartMs: now });
  }

  // Limpa entradas expiradas do mapa em memória caso cresça
  if (memoryRateMap.size > 500) {
    for (const [k, v] of memoryRateMap.entries()) {
      if (now - v.windowStartMs >= WINDOW_MS) memoryRateMap.delete(k);
    }
  }

  // 2. Verificação persistente no Firestore (_rate_limits) com campo expiresAt (TTL)
  const docRef = db.collection('_rate_limits').doc(`signup_${ipHash}`);
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data() || {};
    const startMs = Number(data.windowStartMs) || 0;
    const count = Number(data.count) || 0;
    if (now - startMs < WINDOW_MS) {
      if (count >= MAX_ATTEMPTS_PER_WINDOW) return false;
      await docRef.set(
        {
          count: count + 1,
          windowStartMs: startMs,
          expiresAt: new Date(startMs + WINDOW_MS),
          updatedAt: new Date(now).toISOString(),
        },
        { merge: true }
      );
      return true;
    }
  }

  await docRef.set({
    count: 1,
    windowStartMs: now,
    expiresAt: new Date(now + WINDOW_MS),
    updatedAt: new Date(now).toISOString(),
  });

  // Limpeza oportunista de até 10 registros expirados em _rate_limits
  db.collection('_rate_limits')
    .where('expiresAt', '<', new Date(now))
    .limit(10)
    .get()
    .then((expiredSnap) => {
      expiredSnap.docs.forEach((d) => d.ref.delete().catch(() => {}));
    })
    .catch(() => {});

  return true;
}

async function resolveFamilyByInvite(db: Firestore, inviteInput: string): Promise<string> {
  const clean = inviteInput.trim();
  if (!clean) return '';
  const upperCode = clean.toUpperCase().replace(/^WYND-/, '');
  const lowerClean = clean.toLowerCase();

  // 1. Procura por inviteCode explícito
  const byCode = await db.collection('users').where('inviteCode', '==', upperCode).limit(5).get();
  const codeHead = byCode.docs.find((d) => {
    const data = d.data();
    return data.role === 'admin' && (data.familyId === d.id || !data.familyId);
  });
  if (codeHead) return codeHead.id;

  // 2. Se informou o e-mail do administrador da família
  if (lowerClean.includes('@')) {
    const byEmail = await db.collection('users').where('email', '==', lowerClean).limit(5).get();
    const emailHead = byEmail.docs.find((d) => {
      const data = d.data();
      return data.role === 'admin' && (data.familyId === d.id || !data.familyId);
    });
    if (emailHead) return emailHead.id;
  }

  // 3. Procura entre os administradores cujo código derivado (primeiros 8 caracteres do uid) bate com o código informado
  if (upperCode.length >= 6) {
    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
    const matched = adminsSnap.docs.find((d) => {
      const data = d.data();
      const isHead = !data.familyId || data.familyId === d.id;
      if (!isHead) return false;
      const derived = d.id.slice(0, 8).toUpperCase();
      return derived === upperCode || d.id === clean;
    });
    if (matched) return matched.id;
  }

  return '';
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

    const { name, email, password, website, usageType, inviteCode, acceptedTerms } = rawBody;

    // Honeypot contra bots: se "website" vier preenchido, finge sucesso sem criar nada
    if (website && String(website).trim() !== '') {
      return res.status(200).json({
        success: true,
        message: 'Cadastro enviado, aguarde a aprovação do administrador',
      });
    }

    if (acceptedTerms !== true) {
      return res.status(400).json({
        error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.',
      });
    }

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';
    const cleanUsageType = usageType === 'family' ? 'family' : 'individual';
    const cleanInvite = typeof inviteCode === 'string' ? inviteCode.trim().slice(0, 120) : '';

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'O nome deve ter entre 2 e 80 caracteres' });
    }
    if (!cleanEmail || cleanEmail.length > 160 || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Informe um e-mail válido' });
    }
    if (cleanPassword.length < 6 || cleanPassword.length > 128) {
      return res.status(400).json({ error: 'A senha deve ter entre 6 e 128 caracteres' });
    }
    if (cleanUsageType === 'family' && cleanInvite.length < 4) {
      return res.status(400).json({ error: 'Informe o código de convite da família' });
    }

    const { appMod, getAuth, getFirestore, FieldValue } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Rate limit por IP (memória + Firestore _rate_limits com expiração)
    const ipHash = getClientIpHash(req);
    const allowed = await checkRateLimit(db, ipHash);
    if (!allowed) {
      return res.status(429).json({
        error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
      });
    }

    // Se escolheu "Entrar em uma família", resolve o familyId de forma silenciosa
    // (nunca revela na resposta se o código ou e-mail existe ou não).
    let targetFamilyId = '';
    if (cleanUsageType === 'family') {
      targetFamilyId = await resolveFamilyByInvite(db, cleanInvite);
    }

    const newUser = await auth.createUser({
      email: cleanEmail,
      password: cleanPassword,
      displayName: cleanName,
    });

    const uid = newUser.uid;
    const emailPrefix = cleanEmail.split('@')[0] || '';
    const username = normalize(emailPrefix).replace(/[^a-z0-9._-]/g, '') || uid.slice(0, 8);

    const isIndividual = cleanUsageType === 'individual';
    const finalFamilyId = isIndividual ? uid : targetFamilyId;
    const finalRole = isIndividual ? 'admin' : 'usuario';

    const record: Record<string, any> = {
      id: uid,
      name: cleanName,
      username,
      email: cleanEmail,
      cpf: '',
      role: finalRole,
      person: cleanName,
      allowedPersons: '',
      status: 'pendente',
      usageType: cleanUsageType,
      personKeys: toPersonKeys([cleanName, username].filter(Boolean)),
      allowedPersonKeys: [],
      familyId: finalFamilyId,
      inviteCode: isIndividual ? uid.slice(0, 8).toUpperCase() : '',
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    };

    if (!isIndividual) {
      record.requestedInvite = cleanInvite;
      if (targetFamilyId) {
        record.requestedFamilyId = targetFamilyId;
      }
    }

    await db.collection('users').doc(uid).set(record);

    await db
      .collection('consentLogs')
      .doc(`${uid}_${TERMS_VERSION}`)
      .set({
        uid,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: FieldValue.serverTimestamp(),
        origem: 'signup',
      });

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

    return res.status(200).json({
      success: true,
      message: 'Cadastro enviado, aguarde a aprovação do administrador',
    });
  } catch (err: any) {
    if (err && err.code === 'auth/email-already-exists') {
      // Mensagem neutra quando for entrada em família, ou aviso padrão de cadastro
      return res.status(409).json({
        error: 'Não foi possível concluir o cadastro com este e-mail. Se você já enviou um pedido, aguarde a aprovação.',
      });
    }
    console.error('Erro no cadastro público (signup):', err);
    return res.status(500).json({ error: describeError(err) });
  }
}
