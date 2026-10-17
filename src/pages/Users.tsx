import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { User, Person } from '../types';
import { toast } from '../stores/useToastStore';
import { db, auth } from '../firebase';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { normalize } from '../utils/format';
import { Select } from '../components/ui/Select';

export function Users() {
  const { data: users, update, remove } = useCollection<User>(
    'users',
    {},
    { unscoped: true }
  );
  const { data: persons, add: addPerson, remove: removePerson } =
    useCollection<Person>('persons');
  const { session } = useAuth();

  const isAdmin = session?.role === 'admin' || session?.superAdmin === true;
  const isSuperAdmin = session?.superAdmin === true;
  const myFamilyId = session?.familyId || session?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [migratingScope, setMigratingScope] = useState(false);
  const [newFamilyTarget, setNewFamilyTarget] = useState<string>('');

  // Double confirmation delete dialog state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);

  // People manager dialog state
  const [isPersonsOpen, setIsPersonsOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  // Orphan Firebase Auth logins check
  const [checkingOrphans, setCheckingOrphans] = useState(false);
  const [orphanError, setOrphanError] = useState<string | null>(null);
  const [orphanAccounts, setOrphanAccounts] = useState<
    {
      uid: string;
      email: string;
      username: string;
      displayName: string;
      createdAt: string;
    }[] | null
  >(null);
  const [orphanToDelete, setOrphanToDelete] = useState<{
    uid: string;
    label: string;
  } | null>(null);

  // User form fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('usuario');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('ativo');

  const myUserDoc = useMemo(
    () => (users || []).find((u) => u.id === session?.id),
    [users, session?.id]
  );

  const myInviteCode = useMemo(() => {
    if (myUserDoc?.inviteCode) return myUserDoc.inviteCode;
    const raw = (myFamilyId || session?.username || 'WYND2026')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    return raw.slice(0, 6).padEnd(6, '8');
  }, [myUserDoc, myFamilyId, session?.username]);

  const generateNewInviteCode = async () => {
    if (!session?.id) return;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    try {
      await update(session.id, { inviteCode: code });
      toast.success('Novo código de convite gerado.');
    } catch {
      toast.error('Erro ao gerar código de convite.');
    }
  };

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(myInviteCode);
      toast.success('Código copiado para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar o código automaticamente.');
    }
  };

  // Pending requests (new signups + family switch requests)
  const pendingRequests = useMemo(() => {
    if (!isAdmin) return [];
    return (users || []).filter((u) => {
      const isNewPending =
        u.status === 'pendente' &&
        (isSuperAdmin ||
          (u.requestedInvite &&
            u.requestedInvite.toUpperCase() === myInviteCode.toUpperCase()));
      const isSwitchPending =
        Boolean(u.pendingFamilyId) &&
        (isSuperAdmin || u.pendingFamilyId === myFamilyId);
      return isNewPending || isSwitchPending;
    });
  }, [users, isAdmin, isSuperAdmin, myInviteCode, myFamilyId]);

  // Active / blocked users with access
  const familyUsers = useMemo(() => {
    return (users || [])
      .filter((u) => {
        if (u.status === 'pendente') return false;
        if (isSuperAdmin) return true;
        const uFam = u.familyId || u.id;
        return uFam === myFamilyId;
      })
      .sort((a, b) => {
        if (a.id === session?.id) return -1;
        if (b.id === session?.id) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [users, isSuperAdmin, myFamilyId, session?.id]);

  const handleApproveRequest = async (u: User) => {
    if (!u.id) return;
    try {
      if (u.pendingFamilyId) {
        const targetFamily = u.pendingFamilyId;
        await updateDoc(doc(db, 'users', u.id), {
          familyId: targetFamily,
          pendingFamilyId: deleteField(),
        });
        toast.success(`${u.name} agora faz parte da família.`);
        return;
      }

      const joinMyFamily =
        u.usageType === 'family' &&
        u.requestedInvite &&
        u.requestedInvite.toUpperCase() === myInviteCode.toUpperCase();

      const assignedFamilyId = joinMyFamily ? myFamilyId : u.id;
      const assignedRole = joinMyFamily ? 'usuario' : 'admin';

      await update(u.id, {
        status: 'ativo',
        familyId: assignedFamilyId,
        role: assignedRole,
      });

      if (joinMyFamily && u.name) {
        const exists = (persons || []).some(
          (p) => normalize(p.name) === normalize(u.name)
        );
        if (!exists) {
          await addPerson({
            name: u.name.trim(),
            personKey: normalize(u.name),
          });
        }
      }

      toast.success(`Acesso de ${u.name} aprovado.`);
    } catch {
      toast.error('Erro ao aprovar solicitação.');
    }
  };

  const handleRejectRequest = async (u: User) => {
    if (!u.id) return;
    try {
      if (u.pendingFamilyId) {
        await updateDoc(doc(db, 'users', u.id), {
          pendingFamilyId: deleteField(),
        });
        toast.info(`Mudança de família de ${u.name} recusada.`);
        return;
      }
      await update(u.id, { status: 'inativo' });
      toast.info(`Solicitação de ${u.name} recusada.`);
    } catch {
      toast.error('Erro ao recusar solicitação.');
    }
  };

  const handleToggleBlock = async (u: User) => {
    if (!u.id || u.id === session?.id) return;
    const nextStatus = u.status === 'inativo' ? 'ativo' : 'inativo';
    try {
      await update(u.id, { status: nextStatus });
      toast.success(
        nextStatus === 'inativo'
          ? `${u.name} foi bloqueado.`
          : `${u.name} foi desbloqueado.`
      );
    } catch {
      toast.error('Não foi possível alterar o bloqueio.');
    }
  };

  const openNewUserModal = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('usuario');
    setPerson(persons[0]?.name || '');
    setStatus('ativo');
    setNewFamilyTarget('');
    setIsModalOpen(true);
  };

  const openEditUserModal = (u: User) => {
    setEditingUser(u);
    setName(u.name || '');
    setUsername(u.username || '');
    setEmail(u.email || '');
    setPassword('');
    setRole(u.role || 'usuario');
    setPerson(u.person || '');
    setStatus(u.status || 'ativo');
    setNewFamilyTarget(u.familyId || u.id || '');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      toast.warning('Preencha nome e nome de usuário.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser?.id) {
        await update(editingUser.id, {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          role,
          person,
          status,
        });

        if (password.trim()) {
          const fbUser = auth?.currentUser;
          if (fbUser) {
            const idToken = await fbUser.getIdToken();
            await fetch('/api/manage-users', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                action: 'updatePassword',
                uid: editingUser.id,
                password: password.trim(),
              }),
            });
          }
        }

        toast.success('Usuário atualizado.');
      } else {
        if (!password || password.length < 6) {
          toast.warning('A senha inicial deve ter pelo menos 6 caracteres.');
          setSubmitting(false);
          return;
        }
        const fbUser = auth?.currentUser;
        if (!fbUser) {
          toast.error('Sessão expirada. Entre novamente.');
          setSubmitting(false);
          return;
        }
        const idToken = await fbUser.getIdToken();
        const resp = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            name: name.trim(),
            username: username.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
            password,
            role,
            person,
            status,
            familyId: myFamilyId,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          toast.error(data?.error || 'Não foi possível criar o usuário.');
          setSubmitting(false);
          return;
        }
        toast.success('Novo usuário criado.');
      }
      setIsModalOpen(false);
    } catch {
      toast.error('Erro ao salvar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete?.id || deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR') {
      return;
    }
    setDeletingUser(true);
    try {
      const fbUser = auth?.currentUser;
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        await fetch('/api/manage-users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            action: 'deleteUser',
            uid: userToDelete.id,
          }),
        });
      }
      await remove(userToDelete.id);
      toast.success(`Usuário "${userToDelete.name}" excluído.`);
      setUserToDelete(null);
      setDeleteConfirmText('');
    } catch {
      toast.error('Erro ao excluir usuário.');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleMoveUserFamily = async () => {
    if (!isSuperAdmin || !editingUser?.id || !newFamilyTarget) return;
    const resolvedFamilyId =
      newFamilyTarget === '__SOLO__' ? editingUser.id : newFamilyTarget;
    try {
      await update(editingUser.id, { familyId: resolvedFamilyId });
      toast.success('Família do usuário atualizada.');
      setIsModalOpen(false);
    } catch {
      toast.error('Erro ao mover usuário de família.');
    }
  };

  const prepareDatabaseScope = async () => {
    if (!isSuperAdmin || migratingScope) return;
    setMigratingScope(true);
    try {
      const allUsersSnap = await getDocs(collection(db, 'users'));
      const userByName: Record<string, { uid: string; familyId: string }> = {};
      let batch = writeBatch(db);
      let ops = 0;

      allUsersSnap.docs.forEach((d) => {
        const data = d.data() as any;
        const famId = data.familyId || myFamilyId || d.id;
        if (!data.familyId) {
          batch.update(doc(db, 'users', d.id), { familyId: famId });
          ops++;
        }
        if (data.name) userByName[normalize(data.name)] = { uid: d.id, familyId: famId };
        if (data.person) userByName[normalize(data.person)] = { uid: d.id, familyId: famId };
        if (data.username) userByName[normalize(data.username)] = { uid: d.id, familyId: famId };
      });

      const cols = [
        'accounts',
        'cards',
        'transactions',
        'subscriptions',
        'persons',
        'paid_invoices',
        'settings',
        'goals',
        'tags',
      ];

      for (const colName of cols) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data() as any;
          if (data.familyId && data.ownerUid) continue;
          const ownerName = normalize(data.owner || data.person || data.createdBy || '');
          const match = userByName[ownerName];
          const ownerUid = data.ownerUid || match?.uid || session?.id || '';
          const familyId = data.familyId || match?.familyId || myFamilyId;
          batch.update(doc(db, colName, d.id), { familyId, ownerUid });
          ops++;
          if (ops >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
      }

      if (ops > 0) await batch.commit();
      toast.success('Dados preparados e vinculados com sucesso.');
    } catch {
      toast.error('Erro ao preparar dados.');
    } finally {
      setMigratingScope(false);
    }
  };

  const checkOrphanLogins = async () => {
    if (!isAdmin || checkingOrphans) return;
    const fbUser = auth?.currentUser;
    if (!fbUser) return;
    setCheckingOrphans(true);
    setOrphanError(null);
    try {
      const idToken = await fbUser.getIdToken();
      const resp = await fetch('/api/manage-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: 'listAuthUsers' }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setOrphanError(data?.error || 'Erro ao verificar logins.');
        return;
      }
      const firestoreIds = new Set((users || []).map((u) => u.id));
      const firestoreUsernames = new Set(
        (users || []).map((u) => (u.username || '').toLowerCase())
      );
      const orphans = (data.authUsers || []).filter(
        (au: any) =>
          !firestoreIds.has(au.uid) &&
          (!au.username || !firestoreUsernames.has(au.username.toLowerCase()))
      );
      setOrphanAccounts(orphans);
      if (orphans.length === 0) {
        toast.success('Nenhum login solto encontrado no Firebase.');
      }
    } catch {
      setOrphanError('Falha ao consultar a função manage-users.');
    } finally {
      setCheckingOrphans(false);
    }
  };

  const confirmFreeOrphan = async () => {
    if (!orphanToDelete) return;
    const fbUser = auth?.currentUser;
    if (!fbUser) return;
    try {
      const idToken = await fbUser.getIdToken();
      const resp = await fetch('/api/manage-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'deleteUser',
          uid: orphanToDelete.uid,
        }),
      });
      if (resp.ok) {
        setOrphanAccounts((prev) =>
          prev ? prev.filter((a) => a.uid !== orphanToDelete.uid) : null
        );
        toast.success(`Login "${orphanToDelete.label}" liberado.`);
      } else {
        toast.error('Não foi possível liberar o login.');
      }
    } catch {
      toast.error('Erro ao liberar login.');
    } finally {
      setOrphanToDelete(null);
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;
    const clean = newPersonName.trim();
    if ((persons || []).some((p) => normalize(p.name) === normalize(clean))) {
      toast.warning('Essa pessoa já está cadastrada.');
      return;
    }
    await addPerson({ name: clean, personKey: normalize(clean) });
    setNewPersonName('');
    toast.success(`Pessoa "${clean}" adicionada.`);
  };

  const getRoleLabel = (r?: string) => {
    if (r === 'admin') return 'Administrador';
    if (r === 'gerente') return 'Gerente';
    return 'Membro';
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsPersonsOpen(true)}
              className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-xs hover:border-pri/40 transition-colors"
            >
              Pessoas ({persons.length})
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={checkingOrphans}
              onClick={checkOrphanLogins}
              className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-muted hover:text-ink font-bold text-xs hover:border-pri/40 transition-colors disabled:opacity-50"
            >
              {checkingOrphans ? 'Verificando...' : 'Verificar logins'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          {isSuperAdmin && (
            <button
              type="button"
              disabled={migratingScope}
              onClick={prepareDatabaseScope}
              className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-sm hover:border-pri/40 transition-colors disabled:opacity-50"
            >
              {migratingScope ? 'Preparando...' : 'Preparar dados'}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={openNewUserModal}
              className="px-4 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm flex items-center gap-2 shadow-sm hover:opacity-95 transition-opacity"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Novo usuário</span>
            </button>
          )}
        </div>
      </div>

      {/* Orphan diagnostics alert if triggered */}
      {orphanError && (
        <div className="rounded-[20px] bg-spendSoft border border-spend/30 p-4 text-xs text-spendText font-semibold">
          {orphanError}
        </div>
      )}

      {orphanAccounts && orphanAccounts.length > 0 && (
        <div className="rounded-[24px] bg-card border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">
              Logins sem ficha no Wynd ({orphanAccounts.length})
            </h3>
            <button
              type="button"
              onClick={() => setOrphanAccounts(null)}
              className="text-xs font-bold text-muted hover:text-ink"
            >
              Fechar
            </button>
          </div>
          <div className="divide-y divide-border">
            {orphanAccounts.map((oa) => (
              <div
                key={oa.uid}
                className="py-2.5 flex items-center justify-between gap-3"
              >
                <div className="text-xs">
                  <span className="font-bold text-ink">
                    {oa.username || oa.email}
                  </span>
                  <span className="text-muted ml-2">{oa.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setOrphanToDelete({
                      uid: oa.uid,
                      label: oa.username || oa.email,
                    })
                  }
                  className="px-3 min-h-[36px] rounded-[12px] bg-spendSoft text-spendText text-xs font-bold"
                >
                  Liberar login
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card 1: Código de convite */}
      <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              Código de convite
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Compartilhe com quem vai dividir as finanças com você
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-5 min-h-[44px] inline-flex items-center justify-center rounded-[16px] bg-neutral border border-border font-display text-base md:text-lg font-bold tracking-[0.22em] text-ink select-all">
              {myInviteCode}
            </div>

            <button
              type="button"
              onClick={handleCopyInviteCode}
              className="px-4 min-h-[44px] rounded-[16px] bg-priSoft text-priInk font-bold text-xs md:text-sm hover:opacity-90 transition-opacity"
            >
              Copiar código
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={generateNewInviteCode}
                aria-label="Gerar outro código"
                className="w-11 h-11 rounded-[16px] bg-neutral text-muted hover:text-ink flex items-center justify-center transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-border text-xs text-muted">
          Quem usar este código entra em Solicitações até você aprovar.
        </div>
      </div>

      {/* Card 2: Solicitações */}
      {isAdmin && (
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-border">
            <h2 className="font-display text-base font-bold text-ink">
              Solicitações
            </h2>
            <span className="text-xs font-bold text-pri">
              {pendingRequests.length === 0
                ? 'Nenhuma solicitação pendente'
                : `${pendingRequests.length} ${
                    pendingRequests.length === 1
                      ? 'pessoa esperando aprovação'
                      : 'pessoas esperando aprovação'
                  }`}
            </span>
          </div>

          {pendingRequests.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">
              Quando alguém pedir para entrar na família, o pedido aparece aqui.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {pendingRequests.map((u) => {
                const initial = (u.name || u.username || 'U')
                  .trim()
                  .charAt(0)
                  .toUpperCase();
                const isSwitch = Boolean(u.pendingFamilyId);
                const isFamilyInvite =
                  isSwitch ||
                  (u.usageType === 'family' && Boolean(u.requestedInvite));

                return (
                  <div
                    key={u.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-priSoft text-priInk font-display font-bold text-sm flex items-center justify-center shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-ink truncate">
                          {u.name}
                        </div>
                        <div className="text-xs text-muted truncate mt-0.5">
                          {u.username}
                          {isSwitch
                            ? ', pediu para mudar para esta família'
                            : isFamilyInvite
                              ? `, quer entrar com o código ${u.requestedInvite || myInviteCode}`
                              : ', pediu cadastro para uso próprio'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-13 sm:pl-0">
                      <span
                        className={`px-3 py-1 rounded-pill text-[11px] font-bold ${
                          isFamilyInvite
                            ? 'bg-priSoft text-priInk'
                            : 'bg-neutral text-ink'
                        }`}
                      >
                        {isSwitch
                          ? 'Mudança de família'
                          : isFamilyInvite
                            ? 'Entrar na família'
                            : 'Uso individual'}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRejectRequest(u)}
                        className="px-4 min-h-[38px] rounded-[14px] bg-card border border-border text-ink text-xs font-bold hover:bg-neutral transition-colors"
                      >
                        Recusar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApproveRequest(u)}
                        className="px-4 min-h-[38px] rounded-[14px] bg-fab text-fabIcon text-xs font-bold hover:opacity-95 transition-opacity"
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Card 3: Pessoas com acesso */}
      <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs">
        <div className="pb-4 border-b border-border">
          <h2 className="font-display text-base font-bold text-ink">
            Pessoas com acesso
          </h2>
        </div>

        <div className="divide-y divide-border">
          {familyUsers.map((u) => {
            const isMe = u.id === session?.id;
            const isBlocked = u.status === 'inativo';
            const initial = (u.name || u.username || 'U')
              .trim()
              .charAt(0)
              .toUpperCase();

            return (
              <div
                key={u.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full font-display font-bold text-sm flex items-center justify-center shrink-0 ${
                      isBlocked
                        ? 'bg-neutral text-muted'
                        : 'bg-priSoft text-priInk'
                    }`}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-ink truncate">
                      {u.name}
                    </div>
                    <div className="text-xs text-muted truncate mt-0.5">
                      {u.username}
                      {u.email ? `, ${u.email}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-13 sm:pl-0">
                  {isMe && (
                    <span className="px-2.5 py-1 rounded-pill bg-priSoft text-priInk text-[11px] font-bold">
                      Você
                    </span>
                  )}

                  {isBlocked ? (
                    <span className="px-2.5 py-1 rounded-pill bg-spendSoft text-spendText text-[11px] font-bold">
                      Bloqueado
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-pill bg-neutral text-ink text-[11px] font-bold">
                      {getRoleLabel(u.role)}
                    </span>
                  )}

                  {isAdmin && !isMe && (
                    <button
                      type="button"
                      onClick={() => handleToggleBlock(u)}
                      className="px-3.5 min-h-[38px] rounded-[14px] bg-card border border-border text-xs font-bold text-ink hover:bg-neutral transition-colors"
                    >
                      {isBlocked ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      type="button"
                      aria-label={`Editar ${u.name}`}
                      onClick={() => openEditUserModal(u)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}

                  {isAdmin && !isMe && (
                    <button
                      type="button"
                      aria-label={`Excluir ${u.name}`}
                      onClick={() => {
                        setUserToDelete(u);
                        setDeleteConfirmText('');
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-spend hover:bg-spendSoft transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Novo / Editar Usuário */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[480px] max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                {editingUser ? 'Editar usuário' : 'Novo usuário'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Dados de acesso e perfil do usuário.
            </Dialog.Description>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Usuário (login)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: ana.silva"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  {editingUser ? 'Nova senha (opcional)' : 'Senha inicial'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    editingUser
                      ? 'Deixe em branco para manter a atual'
                      : 'Mínimo de 6 caracteres'
                  }
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">Cargo</label>
                  <Select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    ariaLabel="Cargo"
                  >
                    <option value="usuario">Membro</option>
                    <option value="gerente">Gerente</option>
                    <option value="admin">Administrador</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Pessoa vinculada
                  </label>
                  <Select
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    ariaLabel="Pessoa vinculada"
                  >
                    <option value="">Nenhuma</option>
                    {persons.map((p) => (
                      <option key={p.id || p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {isSuperAdmin && editingUser && (
                <div className="rounded-[18px] bg-neutral p-3.5 space-y-2.5">
                  <div className="text-xs font-bold text-ink">
                    Mover usuário de família (Super Admin)
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        size="sm"
                        value={newFamilyTarget}
                        onChange={(e) => setNewFamilyTarget(e.target.value)}
                        ariaLabel="Escolher família"
                      >
                        <option value="__SOLO__">
                          Família própria (individual)
                        </option>
                        {(users || [])
                          .filter((u) => u.role === 'admin' || u.id === u.familyId)
                          .map((u) => {
                            const fId = u.familyId || u.id || '';
                            return (
                              <option key={u.id} value={fId}>
                                Família de {u.name} ({u.username})
                              </option>
                            );
                          })}
                      </Select>
                    </div>
                    <button
                      type="button"
                      onClick={handleMoveUserFamily}
                      className="px-3.5 min-h-[38px] rounded-[14px] bg-priSoft text-priInk text-xs font-bold"
                    >
                      Mover
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Double confirmation Delete User Dialog (typing EXCLUIR) */}
      <Dialog.Root
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-spend p-6 text-ink shadow-2xl focus:outline-none space-y-4">
            <Dialog.Title className="font-display text-lg font-bold text-spendText">
              Excluir usuário
            </Dialog.Title>
            <Dialog.Description className="text-xs text-muted leading-relaxed">
              Isso remove o acesso de{' '}
              <span className="font-bold text-ink">{userToDelete?.name}</span> ao Wynd.
              Para confirmar, digite <span className="font-bold text-ink">EXCLUIR</span>{' '}
              abaixo.
            </Dialog.Description>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Digite EXCLUIR"
              aria-label="Digite EXCLUIR para confirmar"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-spend"
            />

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteConfirmText('');
                }}
                className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  deletingUser ||
                  deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR'
                }
                onClick={handleConfirmDeleteUser}
                className="px-5 min-h-[44px] rounded-[18px] bg-spend text-white font-bold text-sm disabled:opacity-40"
              >
                {deletingUser ? 'Excluindo...' : 'Excluir usuário'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Free Orphan Login Dialog */}
      <Dialog.Root
        open={Boolean(orphanToDelete)}
        onOpenChange={(open) => {
          if (!open) setOrphanToDelete(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none space-y-4">
            <Dialog.Title className="font-display text-lg font-bold text-ink">
              Liberar login do Firebase
            </Dialog.Title>
            <Dialog.Description className="text-xs text-muted leading-relaxed">
              Deseja remover o login solto{' '}
              <span className="font-bold text-ink">{orphanToDelete?.label}</span> para
              que ele possa ser cadastrado novamente?
            </Dialog.Description>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setOrphanToDelete(null)}
                className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmFreeOrphan}
                className="px-4 min-h-[44px] rounded-[18px] bg-spend text-white font-bold text-sm"
              >
                Liberar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Manage Persons Dialog */}
      <Dialog.Root open={isPersonsOpen} onOpenChange={setIsPersonsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none space-y-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                Pessoas da família
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="text-xs text-muted">
              Nomes disponíveis para associar lançamentos e dividir despesas.
            </Dialog.Description>

            <form onSubmit={handleAddPerson} className="flex gap-2">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Nome da pessoa"
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-[16px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
              />
              <button
                type="submit"
                className="px-4 min-h-[42px] rounded-[16px] bg-priSoft text-priInk font-bold text-xs"
              >
                Adicionar
              </button>
            </form>

            <div className="divide-y divide-border max-h-60 overflow-y-auto">
              {persons.map((p) => (
                <div
                  key={p.id}
                  className="py-2.5 flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-ink">{p.name}</span>
                  {p.id && (
                    <button
                      type="button"
                      onClick={() => removePerson(p.id!)}
                      className="text-xs font-bold text-spendText hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default Users;
