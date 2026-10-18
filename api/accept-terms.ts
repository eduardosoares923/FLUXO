// Vercel Serverless Function: registra o aceite dos Termos de Uso e da Política de Privacidade
// pós-login (via TermsGate) tanto em users/<uid> quanto em consentLogs/<uid>_<TERMS_VERSION>.
// Não armazena IP em consentLogs.

import type { App } from 'firebase-admin/app';
import { TERMS_VERSION, PRIVACY_VERSION } from '../src/legal/versions';

type AppModule = typeof import('firebase-admin/app');

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    const body = req.body || {};
    if (body.acceptedTerms !== true) {
      return res.status(400).json({
        error: 'Você precisa confirmar o aceite dos Termos de Uso e da Política de Privacidade.',
      });
    }

    const { appMod, getAuth, getFirestore, FieldValue } =
      await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await userRef.set(
      {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db
      .collection('consentLogs')
      .doc(`${uid}_${TERMS_VERSION}`)
      .set({
        uid,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: FieldValue.serverTimestamp(),
        origem: 'gate',
      });

    return res.status(200).json({
      success: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    });
  } catch (err: any) {
    console.error('Erro ao registrar aceite dos termos:', err);
    return res.status(500).json({ error: describeError(err) });
  }
}
