// Vercel Serverless Function: exclusão completa da própria conta no servidor.
//
// Fluxo:
// 1. Valida o token Bearer do usuário autenticado e aplica rate limit.
// 2. Se o usuário for administrador de uma família com outros membros ativos,
//    bloqueia com HTTP 409 ("Transfira a administração ou encerre o grupo antes de excluir sua conta.").
// 3. Caso contrário, apaga todos os documentos do usuário em todas as coleções
//    (accounts, cards, transactions, subscriptions, goals, persons, settings,
//     paidInvoices, paid_invoices, tags, notifications, reminders, settlements),
//    remove as entradas correspondentes em user_lookup, remove users/{uid}
//    e por fim exclui o registro no Firebase Authentication.
// 4. Mantém intocada a coleção consentLogs (guarda legal de comprovação de aceite).

import type { App } from 'firebase-admin/app';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

type AppModule = typeof import('firebase-admin/app');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS_PER_WINDOW = 5;
const memoryRateMap = new Map<string, { count: number; windowStartMs: number }>();

const USER_DATA_COLLECTIONS = [
  'accounts',
  'cards',
  'transactions',
  'subscriptions',
  'goals',
  'persons',
  'settings',
  'paidInvoices',
  'paid_invoices',
  'tags',
  'notifications',
  'reminders',
  'settlements',
];

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
    throw new Error(
      'A variável FIREBASE_SERVICE_ACCOUNT não está configurada na Vercel (Settings > Environment Variables).'
    );
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error(
      'A variável FIREBASE_SERVICE_ACCOUNT existe mas não é um JSON válido. Cole o conteúdo inteiro do arquivo da chave de serviço.'
    );
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

function normalize(str: unknown): string {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getClientIpHash(req: ApiRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(xff)
    ? xff[0]
    : typeof xff === 'string'
      ? xff.split(',')[0]
      : (req.headers['x-real-ip'] as string) || 'unknown';
  const cleanIp = String(rawIp || 'unknown').trim();
  return createHash('sha256').update(`wynd-del:${cleanIp}`).digest('hex').slice(0, 32);
}

async function checkRateLimit(db: Firestore, key: string): Promise<boolean> {
  const now = Date.now();
  const mem = memoryRateMap.get(key);
  if (mem && now - mem.windowStartMs < WINDOW_MS) {
    if (mem.count >= MAX_ATTEMPTS_PER_WINDOW) return false;
    mem.count += 1;
  } else {
    memoryRateMap.set(key, { count: 1, windowStartMs: now });
  }

  try {
    const ref = db.collection('_rate_limits').doc(`del_${key}`);
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : {};
      const windowStartMs =
        typeof data.windowStartMs === 'number' ? data.windowStartMs : 0;
      const count = typeof data.count === 'number' ? data.count : 0;

      if (now - windowStartMs < WINDOW_MS) {
        if (count >= MAX_ATTEMPTS_PER_WINDOW) return false;
        tx.set(
          ref,
          {
            count: count + 1,
            windowStartMs,
            expiresAt: new Date(windowStartMs + WINDOW_MS),
            updatedAt: new Date(now),
          },
          { merge: true }
        );
        return true;
      }

      tx.set(ref, {
        count: 1,
        windowStartMs: now,
        expiresAt: new Date(now + WINDOW_MS),
        updatedAt: new Date(now),
      });
      return true;
    });
    return allowed;
  } catch {
    return true;
  }
}

async function deleteRefsInBatches(db: Firestore, refs: DocumentReference[]) {
  const chunkSize = 400;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    const { appMod, getAuth, getFirestore } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const ipHash = getClientIpHash(req);
    const allowed = await checkRateLimit(db, `${uid}_${ipHash}`);
    if (!allowed) {
      return res.status(429).json({
        error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
      });
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const callerFamilyId =
      typeof userData.familyId === 'string' && userData.familyId.trim()
        ? userData.familyId.trim()
        : uid;
    const isFamilyAdmin =
      userData.role === 'admin' || callerFamilyId === uid;

    // Verifica se o usuário é admin de uma família com outros membros ativos
    let hasOtherFamilyMembers = false;
    if (callerFamilyId) {
      const familySnap = await db
        .collection('users')
        .where('familyId', '==', callerFamilyId)
        .get();

      const otherActiveMembers = familySnap.docs.filter((d) => {
        if (d.id === uid) return false;
        const st = d.data()?.status;
        return st !== 'inativo' && st !== 'pendente';
      });

      hasOtherFamilyMembers = familySnap.docs.some((d) => d.id !== uid);

      if (isFamilyAdmin && otherActiveMembers.length > 0) {
        return res.status(409).json({
          error:
            'Transfira a administração ou encerre o grupo antes de excluir sua conta.',
        });
      }
    }

    const includeFamilyDocs = isFamilyAdmin && !hasOtherFamilyMembers;

    // 1. Apaga todos os documentos pertencentes ao usuário em todas as coleções
    //    (mantendo consentLogs intocado)
    for (const colName of USER_DATA_COLLECTIONS) {
      const refMap = new Map<string, DocumentReference>();

      const byOwner = await db
        .collection(colName)
        .where('ownerUid', '==', uid)
        .get();
      byOwner.docs.forEach((d) => refMap.set(d.ref.path, d.ref));

      const byUserId = await db
        .collection(colName)
        .where('userId', '==', uid)
        .get();
      byUserId.docs.forEach((d) => refMap.set(d.ref.path, d.ref));

      const byCreatedByUid = await db
        .collection(colName)
        .where('createdByUid', '==', uid)
        .get();
      byCreatedByUid.docs.forEach((d) => refMap.set(d.ref.path, d.ref));

      if (includeFamilyDocs && callerFamilyId) {
        const byFamily = await db
          .collection(colName)
          .where('familyId', '==', callerFamilyId)
          .get();
        byFamily.docs.forEach((d) => refMap.set(d.ref.path, d.ref));
      }

      if (refMap.size > 0) {
        await deleteRefsInBatches(db, [...refMap.values()]);
      }
    }

    // 2. Apaga entradas de user_lookup vinculadas ao e-mail, username ou CPF do usuário
    let authEmail = String(userData.email || decoded.email || '').trim().toLowerCase();
    try {
      const authRecord = await auth.getUser(uid);
      if (!authEmail && authRecord.email) {
        authEmail = authRecord.email.trim().toLowerCase();
      }
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') throw e;
    }

    const lookupRefs = new Map<string, DocumentReference>();
    if (authEmail) {
      const byEmailSnap = await db
        .collection('user_lookup')
        .where('email', '==', authEmail)
        .get();
      byEmailSnap.docs.forEach((d) => lookupRefs.set(d.ref.path, d.ref));
    }

    const candidateKeys = new Set<string>();
    if (authEmail) candidateKeys.add(normalize(authEmail));
    if (userData.username) candidateKeys.add(normalize(userData.username));
    if (userData.cpf) {
      const cpfDigits = String(userData.cpf).replace(/\D/g, '');
      if (cpfDigits.length >= 11) candidateKeys.add(cpfDigits);
    }

    for (const key of candidateKeys) {
      if (!key) continue;
      const snap = await db.collection('user_lookup').doc(key).get();
      if (snap.exists) {
        const snapEmail = String(snap.data()?.email || '').trim().toLowerCase();
        if (!authEmail || !snapEmail || snapEmail === authEmail) {
          lookupRefs.set(snap.ref.path, snap.ref);
        }
      }
    }

    if (lookupRefs.size > 0) {
      await deleteRefsInBatches(db, [...lookupRefs.values()]);
    }

    // 3. Apaga o documento users/{uid}
    if (userSnap.exists) {
      await userRef.delete();
    }

    // 4. Apaga o usuário no Firebase Authentication por último
    try {
      await auth.deleteUser(uid);
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') throw e;
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Erro ao excluir conta:', err);
    return res.status(500).json({ error: describeError(err) });
  }
}
