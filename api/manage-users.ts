// Vercel Serverless Function: gerencia a ligação entre o Firebase Authentication
// (onde ficam os logins) e a coleção "users" do Firestore (o cadastro que o app
// mostra). O navegador não consegue listar nem apagar logins do Authentication,
// só o Admin SDK no servidor, por isso isso fica aqui.
//
// Ações (POST com { action, uid }):
//   - "list-orphans": logins que existem no Authentication mas não têm cadastro em "users" (só superAdmin)
//   - "link":         cria o cadastro em "users" pra um desses logins como chefe de família (só superAdmin)
//   - "delete":       apaga outro usuário (superAdmin ou admin da mesma família) ou a própria conta ("Excluir minha conta")
//
// Usa a mesma variável de ambiente FIREBASE_SERVICE_ACCOUNT do create-user.ts.

import type { App } from 'firebase-admin/app';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';

type AppModule = typeof import('firebase-admin/app');

const SCOPED_COLLECTIONS = [
  'transactions',
  'accounts',
  'cards',
  'subscriptions',
  'paidInvoices',
  'reminders',
  'goals',
  'settlements',
  'tags',
];

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
    const { appMod, getAuth, getFirestore } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Quem chama precisa estar logado e ativo
    const idToken = getBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Token de autenticação ausente' });
    const decoded = await auth.verifyIdToken(idToken);
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    const callerData = callerDoc.data() || {};
    if (!callerDoc.exists || callerData.status === 'inativo') {
      return res.status(403).json({ error: 'Usuário sem acesso ativo' });
    }

    const isSuperAdmin = callerData.superAdmin === true;
    const { action, uid } = req.body || {};

    if (action === 'list-orphans') {
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Apenas o administrador geral pode listar logins órfãos' });
      }
      const usersSnap = await db.collection('users').get();
      const known = new Set(usersSnap.docs.map((d) => d.id));
      const orphans: Array<{ uid: string; email: string; name: string; createdAt: string | null; lastSignIn: string | null }> = [];
      let pageToken: string | undefined;
      do {
        const page = await auth.listUsers(1000, pageToken);
        page.users.forEach((u) => {
          if (!known.has(u.uid)) {
            orphans.push({
              uid: u.uid,
              email: u.email || '',
              name: u.displayName || '',
              createdAt: u.metadata.creationTime || null,
              lastSignIn: u.metadata.lastSignInTime || null,
            });
          }
        });
        pageToken = page.pageToken;
      } while (pageToken);
      return res.status(200).json({ orphans });
    }

    if (!uid) return res.status(400).json({ error: 'Informe o usuário (uid)' });

    if (action === 'link') {
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Apenas o administrador geral pode vincular logins órfãos' });
      }
      const existing = await db.collection('users').doc(uid).get();
      if (existing.exists) return res.status(409).json({ error: 'Esse login já tem cadastro no sistema' });

      const authUser = await auth.getUser(uid);
      const email = (authUser.email || '').toLowerCase();
      const emailPrefix = email.split('@')[0] || uid.slice(0, 8);
      const name = authUser.displayName || emailPrefix;
      const username = normalize(emailPrefix).replace(/[^a-z0-9._-]/g, '') || uid.slice(0, 8);

      const record = {
        id: uid,
        name,
        username,
        email,
        cpf: '',
        role: 'admin',
        person: name,
        allowedPersons: '',
        status: 'ativo',
        personKeys: toPersonKeys([name, username].filter(Boolean)),
        allowedPersonKeys: [],
        familyId: uid,
        createdAt: new Date().toISOString(),
      };
      await db.collection('users').doc(uid).set(record);

      const lookupIds = [...new Set([normalize(username), normalize(email)].filter(Boolean))];
      await Promise.all(
        lookupIds.map((id) =>
          db
            .collection('user_lookup')
            .doc(id)
            .create({ email })
            .catch(() => {})
        )
      );

      return res.status(200).json({ success: true, user: record });
    }

    if (action === 'delete') {
      // Caso 1: exclusão da PRÓPRIA conta ("Excluir minha conta")
      if (uid === decoded.uid) {
        if (isSuperAdmin) {
          return res.status(400).json({ error: 'O administrador geral não pode excluir a própria conta por aqui' });
        }

        const isFamilyHead = callerData.familyId === uid;
        if (isFamilyHead) {
          const familyMembersSnap = await db
            .collection('users')
            .where('familyId', '==', uid)
            .get();
          const hasOtherMembers = familyMembersSnap.docs.some((d) => d.id !== uid);
          if (hasOtherMembers) {
            return res.status(409).json({ error: 'Exclua ou mova os membros da família antes de excluir sua conta' });
          }
        }

        for (const colName of SCOPED_COLLECTIONS) {
          const refMap = new Map<string, DocumentReference>();
          const byOwner = await db.collection(colName).where('ownerUid', '==', uid).get();
          byOwner.docs.forEach((d) => refMap.set(d.ref.path, d.ref));

          if (isFamilyHead) {
            const byFamily = await db.collection(colName).where('familyId', '==', uid).get();
            byFamily.docs.forEach((d) => refMap.set(d.ref.path, d.ref));
          }

          if (refMap.size > 0) {
            await deleteRefsInBatches(db, [...refMap.values()]);
          }
        }

        let selfEmail = String(callerData.email || '');
        try {
          const authUser = await auth.getUser(uid);
          selfEmail = selfEmail || authUser.email || '';
          await auth.deleteUser(uid);
        } catch (e: any) {
          if (e.code !== 'auth/user-not-found') throw e;
        }

        await db.collection('users').doc(uid).delete();

        if (selfEmail) {
          const lookups = await db.collection('user_lookup').where('email', '==', selfEmail.toLowerCase()).get();
          await Promise.all(lookups.docs.map((d) => d.ref.delete()));
        }

        return res.status(200).json({ success: true });
      }

      // Caso 2: exclusão de OUTRA pessoa
      const userDoc = await db.collection('users').doc(uid).get();
      const targetData = userDoc.exists ? userDoc.data() || {} : {};

      if (targetData.superAdmin === true && !isSuperAdmin) {
        return res.status(403).json({ error: 'Não é permitido excluir o administrador geral' });
      }

      const canDeleteOther =
        isSuperAdmin ||
        (callerData.role === 'admin' &&
          Boolean(callerData.familyId) &&
          userDoc.exists &&
          targetData.familyId === callerData.familyId);

      if (!canDeleteOther) {
        return res.status(403).json({ error: 'Sem permissão para excluir este usuário' });
      }

      let email = userDoc.exists ? targetData.email || '' : '';

      try {
        const authUser = await auth.getUser(uid);
        email = email || authUser.email || '';
        await auth.deleteUser(uid);
      } catch (e: any) {
        // Se o login já não existe mais, segue apagando o resto normalmente
        if (e.code !== 'auth/user-not-found') throw e;
      }

      if (userDoc.exists) await db.collection('users').doc(uid).delete();

      // Remove os atalhos de login (usuário/e-mail/CPF) que apontavam pra esse e-mail
      if (email) {
        const lookups = await db.collection('user_lookup').where('email', '==', String(email).toLowerCase()).get();
        await Promise.all(lookups.docs.map((d) => d.ref.delete()));
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err: any) {
    console.error('Erro ao gerenciar usuários:', err);
    return res.status(500).json({ error: describeError(err) });
  }
}
