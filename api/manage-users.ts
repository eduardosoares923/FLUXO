// Vercel Serverless Function: gerencia usuários, aprovações de cadastro, mudança de família,
// preparação de dados legados e exclusão completa (Auth + Firestore + dados financeiros).
//
// Ações (POST com { action, uid, ... }):
//   - "list-orphans":  logins no Authentication sem doc em "users" (só superAdmin)
//   - "link":          vincula login órfão como chefe de família (só superAdmin)
//   - "list-pending":  lista cadastros pendentes ou pedidos de entrada na família (superAdmin vê todos; chefe vê os da própria família)
//   - "approve":       aprova cadastro pendente ou mudança de família (validado no servidor)
//   - "reject":        recusa e apaga cadastro pendente ou cancela pedido de mudança de família (validado no servidor)
//   - "change-family": muda usuário de família sem migrar dados antigos (superAdmin aplica direto; usuário pede aprovação ao chefe de destino)
//   - "prepare-data":  preenche familyId e ownerUid em registros antigos que ainda não têm o campo
//   - "delete":        apaga usuário e todos os seus dados nas 9 coleções (própria conta ou admin da família/superAdmin)

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

async function loadFirebaseAdmin() {
  const [appMod, authMod, firestoreMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  return { appMod, getAuth: authMod.getAuth, getFirestore: firestoreMod.getFirestore, FieldValue: firestoreMod.FieldValue };
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

/** Desfaz o status 'inativo' gravado antes de apagar o login (se não havia status, remove o campo). */
async function restoreStatus(userRef: DocumentReference, FieldValue: typeof import('firebase-admin/firestore').FieldValue, previousStatus: unknown) {
  try {
    await userRef.set({ status: previousStatus === undefined ? FieldValue.delete() : previousStatus }, { merge: true });
  } catch (restoreErr: any) {
    console.error('Exclusão de conta: não foi possível restaurar o status', describeError(restoreErr));
  }
}

async function deleteUserFinancialData(db: Firestore, uid: string, includeFamilyDocs: boolean) {
  for (const colName of SCOPED_COLLECTIONS) {
    const refMap = new Map<string, DocumentReference>();
    const byOwner = await db.collection(colName).where('ownerUid', '==', uid).get();
    byOwner.docs.forEach((d) => refMap.set(d.ref.path, d.ref));

    if (includeFamilyDocs) {
      const byFamily = await db.collection(colName).where('familyId', '==', uid).get();
      byFamily.docs.forEach((d) => refMap.set(d.ref.path, d.ref));
    }

    if (refMap.size > 0) {
      await deleteRefsInBatches(db, [...refMap.values()]);
    }
  }
}

async function resolveFamilyByInvite(db: Firestore, inviteInput: string): Promise<string> {
  const clean = String(inviteInput || '').trim();
  if (!clean) return '';
  const upperCode = clean.toUpperCase().replace(/^WYND-/, '');
  const lowerClean = clean.toLowerCase();

  const byCode = await db.collection('users').where('inviteCode', '==', upperCode).limit(5).get();
  const codeHead = byCode.docs.find((d) => {
    const data = d.data();
    return data.role === 'admin' && (data.familyId === d.id || !data.familyId);
  });
  if (codeHead) return codeHead.id;

  if (lowerClean.includes('@')) {
    const byEmail = await db.collection('users').where('email', '==', lowerClean).limit(5).get();
    const emailHead = byEmail.docs.find((d) => {
      const data = d.data();
      return data.role === 'admin' && (data.familyId === d.id || !data.familyId);
    });
    if (emailHead) return emailHead.id;
  }

  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  const matched = adminsSnap.docs.find((d) => {
    const data = d.data();
    const isHead = !data.familyId || data.familyId === d.id;
    if (!isHead) return false;
    const derived = d.id.slice(0, 8).toUpperCase();
    return derived === upperCode || d.id === clean;
  });
  return matched ? matched.id : '';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { appMod, getAuth, getFirestore, FieldValue } = await loadFirebaseAdmin();
    const app = getAdminApp(appMod);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Quem chama precisa estar logado e ativo (não pode ser 'inativo' nem 'pendente').
    // Exceção: conta 'pendente' pode excluir a PRÓPRIA conta ('inativo' é bloqueio de administrador e segue barrado).
    const idToken = getBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Token de autenticação ausente' });
    const decoded = await auth.verifyIdToken(idToken);
    const { action, uid, inviteCode, targetFamilyId } = req.body || {};
    const isSelfDelete = action === 'delete' && uid === decoded.uid;
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    const callerData = callerDoc.data() || {};
    if (!callerDoc.exists || callerData.status === 'inativo' || (callerData.status === 'pendente' && !isSelfDelete)) {
      return res.status(403).json({ error: 'Usuário sem acesso ativo' });
    }

    const isSuperAdmin = callerData.superAdmin === true;
    const callerFamilyId = callerData.familyId || decoded.uid;
    const isCallerFamilyHead = callerData.role === 'admin' && callerFamilyId === decoded.uid;

    // -----------------------------------------------------------------------
    // 1. LISTAR PENDENTES (superAdmin vê todos; chefe de família vê os da própria família)
    // -----------------------------------------------------------------------
    if (action === 'list-pending') {
      if (!isSuperAdmin && !isCallerFamilyHead) {
        return res.status(403).json({ error: 'Sem permissão para listar aprovações pendentes' });
      }

      const pendingSnap = await db.collection('users').where('status', '==', 'pendente').get();
      const pendingList: any[] = [];

      pendingSnap.docs.forEach((d) => {
        const data = d.data();
        const item = { id: d.id, ...data, requestKind: 'signup' };
        if (isSuperAdmin) {
          pendingList.push(item);
        } else if (isCallerFamilyHead && data.familyId === callerFamilyId && d.id !== callerFamilyId) {
          pendingList.push(item);
        }
      });

      // Também busca pedidos de mudança de família (usuários que têm pendingFamilyId preenchido)
      if (isSuperAdmin) {
        const allUsersSnap = await db.collection('users').get();
        allUsersSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.pendingFamilyId && data.status !== 'pendente') {
            pendingList.push({ id: d.id, ...data, requestKind: 'change-family' });
          }
        });
      } else if (isCallerFamilyHead) {
        const transferSnap = await db.collection('users').where('pendingFamilyId', '==', callerFamilyId).get();
        transferSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.status !== 'pendente') {
            pendingList.push({ id: d.id, ...data, requestKind: 'change-family' });
          }
        });
      }

      return res.status(200).json({ pending: pendingList });
    }

    // -----------------------------------------------------------------------
    // 2. PREPARAR DADOS (migração de familyId e ownerUid em documentos antigos)
    // -----------------------------------------------------------------------
    if (action === 'prepare-data') {
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Apenas o administrador geral pode preparar os dados' });
      }
      const defaultFamilyId = callerFamilyId;
      const usersSnap = await db.collection('users').get();
      const personToUid = new Map<string, string>();
      let updatedUsers = 0;

      for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const keys = toPersonKeys([u.person, u.name, u.username].filter(Boolean));
        keys.forEach((k) => {
          if (!personToUid.has(k)) personToUid.set(k, uDoc.id);
        });
        if (!u.familyId) {
          const inferredFamily = u.role === 'admin' ? uDoc.id : defaultFamilyId;
          await uDoc.ref.set(
            {
              familyId: inferredFamily,
              inviteCode: u.role === 'admin' ? uDoc.id.slice(0, 8).toUpperCase() : '',
            },
            { merge: true }
          );
          updatedUsers++;
        }
      }

      let updatedDocs = 0;
      for (const colName of SCOPED_COLLECTIONS) {
        const snap = await db.collection(colName).get();
        let batch = db.batch();
        let countInBatch = 0;

        for (const d of snap.docs) {
          const data = d.data();
          if (!data.familyId || !data.ownerUid) {
            const patch: Record<string, any> = {};
            if (!data.familyId) patch.familyId = defaultFamilyId;
            if (!data.ownerUid) {
              const pKey = normalize(data.person || data.owner || '');
              const firstKey = pKey.split(',')[0]?.trim();
              patch.ownerUid = (firstKey && personToUid.get(firstKey)) || defaultFamilyId;
            }
            if (!Array.isArray(data.sharedWith)) {
              patch.sharedWith = [];
            }
            batch.set(d.ref, patch, { merge: true });
            countInBatch++;
            updatedDocs++;

            if (countInBatch >= 400) {
              await batch.commit();
              batch = db.batch();
              countInBatch = 0;
            }
          }
        }
        if (countInBatch > 0) {
          await batch.commit();
        }
      }

      return res.status(200).json({ success: true, updatedUsers, updatedDocs });
    }

    // -----------------------------------------------------------------------
    // 3. LISTAR ÓRFÃOS (somente superAdmin)
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 4. VINCULAR ÓRFÃO (somente superAdmin)
    // -----------------------------------------------------------------------
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
        inviteCode: uid.slice(0, 8).toUpperCase(),
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

    // -----------------------------------------------------------------------
    // 5. APROVAR CADASTRO PENDENTE OU MUDANÇA DE FAMÍLIA (validado no servidor)
    // -----------------------------------------------------------------------
    if (action === 'approve') {
      const targetDoc = await db.collection('users').doc(uid).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
      const targetData = targetDoc.data() || {};

      // Caso A: aprovação de mudança de família em conta já existente
      if (targetData.pendingFamilyId && targetData.status !== 'pendente') {
        const destFamily = String(targetData.pendingFamilyId);
        const canApproveTransfer = isSuperAdmin || (isCallerFamilyHead && callerFamilyId === destFamily);
        if (!canApproveTransfer) {
          return res.status(403).json({ error: 'Apenas o chefe da família de destino ou o administrador geral pode aprovar esta entrada' });
        }
        await targetDoc.ref.set(
          {
            familyId: destFamily,
            role: destFamily === uid ? 'admin' : 'usuario',
            pendingFamilyId: null,
            pendingInviteCode: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        return res.status(200).json({ success: true });
      }

      // Caso B: aprovação de conta recém-criada (status === 'pendente')
      const isIndividualRequest = targetData.usageType === 'individual' || targetData.familyId === uid;
      const isSameFamilyRequest = Boolean(targetData.familyId) && targetData.familyId !== uid && targetData.familyId === callerFamilyId;

      if (isIndividualRequest && !isSuperAdmin) {
        return res.status(403).json({ error: 'Apenas o administrador geral pode aprovar cadastros de uso individual' });
      }
      if (!isIndividualRequest && !isSuperAdmin && !(isCallerFamilyHead && isSameFamilyRequest)) {
        return res.status(403).json({ error: 'Você só pode aprovar solicitações destinadas à sua própria família' });
      }

      const approvedFamilyId = targetData.familyId || (isSuperAdmin && targetFamilyId ? String(targetFamilyId) : uid);
      const approvedRole = approvedFamilyId === uid ? 'admin' : (targetData.role || 'usuario');

      await targetDoc.ref.set(
        {
          status: 'ativo',
          familyId: approvedFamilyId,
          role: approvedRole,
          inviteCode: approvedFamilyId === uid ? uid.slice(0, 8).toUpperCase() : '',
          approvedByUid: decoded.uid,
          approvedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return res.status(200).json({ success: true });
    }

    // -----------------------------------------------------------------------
    // 6. RECUSAR CADASTRO PENDENTE OU MUDANÇA DE FAMÍLIA (validado no servidor)
    // -----------------------------------------------------------------------
    if (action === 'reject') {
      const targetDoc = await db.collection('users').doc(uid).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
      const targetData = targetDoc.data() || {};

      // Se era apenas pedido de mudança de família numa conta já ativa, limpa o pedido
      if (targetData.pendingFamilyId && targetData.status !== 'pendente') {
        const destFamily = String(targetData.pendingFamilyId);
        const canRejectTransfer = isSuperAdmin || (isCallerFamilyHead && callerFamilyId === destFamily);
        if (!canRejectTransfer) {
          return res.status(403).json({ error: 'Sem permissão para recusar esta solicitação' });
        }
        await targetDoc.ref.set({ pendingFamilyId: null, pendingInviteCode: null }, { merge: true });
        return res.status(200).json({ success: true });
      }

      if (targetData.status !== 'pendente') {
        return res.status(400).json({ error: 'Este usuário já está ativo. Use a opção de excluir usuário.' });
      }

      const isIndividualRequest = targetData.usageType === 'individual' || targetData.familyId === uid;
      const isSameFamilyRequest = Boolean(targetData.familyId) && targetData.familyId !== uid && targetData.familyId === callerFamilyId;

      if (isIndividualRequest && !isSuperAdmin) {
        return res.status(403).json({ error: 'Apenas o administrador geral pode recusar cadastros de uso individual' });
      }
      if (!isIndividualRequest && !isSuperAdmin && !(isCallerFamilyHead && isSameFamilyRequest)) {
        return res.status(403).json({ error: 'Você só pode recusar solicitações da sua própria família' });
      }

      await deleteUserFinancialData(db, uid, false);

      let email = String(targetData.email || '');
      try {
        const authUser = await auth.getUser(uid);
        email = email || authUser.email || '';
        await auth.deleteUser(uid);
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') throw e;
      }

      await targetDoc.ref.delete();

      if (email) {
        const lookups = await db.collection('user_lookup').where('email', '==', email.toLowerCase()).get();
        await Promise.all(lookups.docs.map((d) => d.ref.delete()));
      }

      return res.status(200).json({ success: true });
    }

    // -----------------------------------------------------------------------
    // 7. MUDAR DE FAMÍLIA (superAdmin muda direto; usuário solicita aprovação ao chefe de destino)
    //    NÃO migra dados antigos automaticamente.
    // -----------------------------------------------------------------------
    if (action === 'change-family') {
      const targetDoc = await db.collection('users').doc(uid).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });

      let resolvedDest = typeof targetFamilyId === 'string' ? targetFamilyId.trim() : '';
      if (!resolvedDest && typeof inviteCode === 'string' && inviteCode.trim()) {
        resolvedDest = await resolveFamilyByInvite(db, inviteCode.trim());
      }
      if (!resolvedDest) {
        return res.status(400).json({ error: 'Código de convite ou família de destino não encontrado' });
      }

      if (isSuperAdmin) {
        await targetDoc.ref.set(
          {
            familyId: resolvedDest,
            role: resolvedDest === uid ? 'admin' : 'usuario',
            pendingFamilyId: null,
            pendingInviteCode: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        return res.status(200).json({
          success: true,
          status: 'applied',
          message: 'Família atualizada pelo administrador geral. Os dados anteriores não foram migrados.',
        });
      }

      if (uid !== decoded.uid) {
        return res.status(403).json({ error: 'Apenas o próprio usuário ou o administrador geral pode solicitar mudança de família' });
      }

      await targetDoc.ref.set(
        {
          pendingFamilyId: resolvedDest,
          pendingInviteCode: String(inviteCode || '').trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        status: 'pending',
        message: 'Pedido enviado ao administrador da nova família. Seus dados anteriores não serão levados para a nova família.',
      });
    }

    // -----------------------------------------------------------------------
    // 8. EXCLUIR CONTA (própria conta ou exclusão por admin/superAdmin)
    // -----------------------------------------------------------------------
    if (action === 'delete') {
      // Caso 1: exclusão da PRÓPRIA conta ("Excluir minha conta")
      if (uid === decoded.uid) {
        const authAgeSec = Math.floor(Date.now() / 1000) - Number(decoded.auth_time || 0);
        if (!decoded.auth_time || authAgeSec > 5 * 60) {
          return res.status(401).json({ code: 'requires-recent-login', error: 'Por segurança, confirme sua senha para excluir a conta.' });
        }
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

        // Ordem segura: bloqueia o cadastro, apaga o login e só então limpa os dados.
        const userRef = db.collection('users').doc(uid);
        const previousStatus = callerData.status;

        // O e-mail é lido antes de apagar o login (depois não dá mais para consultar)
        let selfEmail = String(callerData.email || '');
        try {
          selfEmail = selfEmail || (await auth.getUser(uid)).email || '';
        } catch (e: any) {
          if (e.code !== 'auth/user-not-found') throw e;
        }

        // 1. Marca como inativo (bloqueia o uso e dá para desfazer)
        await userRef.set({ status: 'inativo' }, { merge: true });

        // 2. Apaga o login. Se falhar, desfaz o status e não apaga mais nada.
        try {
          await auth.deleteUser(uid);
        } catch (e: any) {
          if (e.code !== 'auth/user-not-found') {
            await restoreStatus(userRef, FieldValue, previousStatus);
            return res.status(500).json({ error: describeError(e) });
          }
        }

        // 3. Com o login já apagado, apaga os dados, os atalhos e, por último, o cadastro.
        //    Se algo falhar, users/<uid> fica 'inativo' como marca para retomar a limpeza.
        try {
          await deleteUserFinancialData(db, uid, isFamilyHead);
          if (selfEmail) {
            const lookups = await db.collection('user_lookup').where('email', '==', selfEmail.toLowerCase()).get();
            await Promise.all(lookups.docs.map((d) => d.ref.delete()));
          }
          await userRef.delete();
        } catch (cleanupErr: any) {
          console.error('Exclusão de conta: limpeza pendente', describeError(cleanupErr));
          return res.status(200).json({ success: true, cleanup: 'pending' });
        }

        return res.status(200).json({ success: true });
      }

      // Caso 2: exclusão de OUTRA pessoa pelo admin da família ou superAdmin
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

      // Apaga também os dados financeiros pertencentes a esse usuário para não deixar órfãos
      const targetIsOwnFamilyHead = userDoc.exists && targetData.familyId === uid;
      if (targetIsOwnFamilyHead) {
        const otherMembersSnap = await db.collection('users').where('familyId', '==', uid).get();
        const hasOtherMembers = otherMembersSnap.docs.some((d) => d.id !== uid);
        if (hasOtherMembers) {
          return res.status(409).json({ error: 'Este usuário é chefe de uma família que ainda possui outros membros. Remova ou mova os membros antes.' });
        }
      }
      await deleteUserFinancialData(db, uid, Boolean(targetIsOwnFamilyHead));

      let email = userDoc.exists ? targetData.email || '' : '';

      try {
        const authUser = await auth.getUser(uid);
        email = email || authUser.email || '';
        await auth.deleteUser(uid);
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') throw e;
      }

      if (userDoc.exists) await db.collection('users').doc(uid).delete();

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
