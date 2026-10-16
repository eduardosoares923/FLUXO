import React, { useCallback, useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useAuth, upsertUserLookup } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { auth } from '../firebase';
import { toPersonKeys } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { CustomSelect } from '../components/CustomSelect';
import { toast } from '../stores/useToastStore';
import { User } from '../types';

interface UserFormValues {
  name: string;
  username: string;
  email: string;
  cpf?: string;
  password?: string;
  role: 'admin' | 'gerente' | 'usuario' | 'viewer';
  person?: string;
  allowedPersons?: string;
}

interface PendingUser extends User {
  requestKind?: 'signup' | 'change-family';
}

export default function Users() {
  const { session, hasPermission } = useAuth() as { session: User; hasPermission: (mod: string) => boolean };
  const { data: users, loading, error: collectionError, saveRecord } = useCollection<User>('users');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  // Exclusão de outro usuário com confirmação extra (digitar EXCLUIR)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);

  // Solicitações pendentes de aprovação (cadastro novo ou entrada em família)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [pendingBusy, setPendingBusy] = useState<string | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);

  // Mudança de família pelo superAdmin no modal de edição
  const [newFamilyInvite, setNewFamilyInvite] = useState('');
  const [changingFamily, setChangingFamily] = useState(false);

  // Preparação/migração de dados legados
  const [preparingData, setPreparingData] = useState(false);

  // Logins que existem no Firebase Authentication mas não têm cadastro no sistema (só superAdmin)
  interface OrphanLogin { uid: string; email: string; name: string; createdAt: string | null; lastSignIn: string | null; }
  const [orphans, setOrphans] = useState<OrphanLogin[]>([]);
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null);
  const [deleteOrphan, setDeleteOrphan] = useState<OrphanLogin | null>(null);
  const [orphanError, setOrphanError] = useState('');
  const [checkingOrphans, setCheckingOrphans] = useState(false);

  const isFamilyHead = session?.role === 'admin' && (!session?.familyId || session?.familyId === session?.id);
  const canApproveRequests = Boolean(session?.superAdmin || isFamilyHead);
  const myInviteCode = (session?.inviteCode || (session?.familyId || session?.id || '').slice(0, 8)).toUpperCase();

  const callManageUsers = useCallback(async (action: string, uid?: string, extra: Record<string, any> = {}) => {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/manage-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action, uid, ...extra }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`A função /api/manage-users não respondeu (status ${response.status}). Verifique se o deploy da pasta api terminou na Vercel.`);
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Erro no servidor (status ${response.status})`);
    return result;
  }, []);

  const loadPending = useCallback(async () => {
    if (!canApproveRequests) return;
    setLoadingPending(true);
    try {
      const result = await callManageUsers('list-pending');
      setPendingUsers(result.pending || []);
    } catch (err: any) {
      console.error('Erro ao buscar cadastros pendentes:', err);
    } finally {
      setLoadingPending(false);
    }
  }, [callManageUsers, canApproveRequests]);

  const loadOrphans = useCallback(async () => {
    setCheckingOrphans(true);
    setOrphanError('');
    try {
      const result = await callManageUsers('list-orphans');
      setOrphans(result.orphans || []);
    } catch (err: any) {
      console.error('Erro ao listar logins sem cadastro:', err);
      setOrphanError(err.message || 'Erro ao consultar os logins do Firebase.');
    } finally {
      setCheckingOrphans(false);
    }
  }, [callManageUsers]);

  useEffect(() => {
    if (canApproveRequests) loadPending();
  }, [canApproveRequests, loadPending]);

  useEffect(() => {
    if (session?.superAdmin) loadOrphans();
  }, [session?.superAdmin, loadOrphans]);

  async function handleApprovePending(p: PendingUser) {
    if (!p.id) return;
    setPendingBusy(p.id);
    try {
      await callManageUsers('approve', p.id);
      toast.success(
        p.requestKind === 'change-family'
          ? `Entrada de ${p.name || p.email} na família aprovada!`
          : `Cadastro de ${p.name || p.email} aprovado!`
      );
      await loadPending();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aprovar solicitação.');
    } finally {
      setPendingBusy(null);
    }
  }

  async function handleRejectPending(p: PendingUser) {
    if (!p.id) return;
    setPendingBusy(p.id);
    try {
      await callManageUsers('reject', p.id);
      toast.info(
        p.requestKind === 'change-family'
          ? `Solicitação de mudança de família recusada.`
          : `Cadastro de ${p.name || p.email} recusado e removido.`
      );
      await loadPending();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao recusar solicitação.');
    } finally {
      setPendingBusy(null);
    }
  }

  async function handlePrepareData() {
    setPreparingData(true);
    try {
      const res = await callManageUsers('prepare-data');
      toast.success(`Dados preparados! (${res.updatedUsers || 0} usuários e ${res.updatedDocs || 0} registros atualizados)`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao preparar dados.');
    } finally {
      setPreparingData(false);
    }
  }

  async function handleLinkOrphan(o: OrphanLogin) {
    setOrphanBusy(o.uid);
    try {
      await callManageUsers('link', o.uid);
      toast.success(`${o.email || o.name} agora faz parte do sistema.`);
      await loadOrphans();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao vincular login.');
    } finally {
      setOrphanBusy(null);
    }
  }

  async function handleConfirmDeleteOrphan() {
    if (!deleteOrphan) return;
    const o = deleteOrphan;
    setDeleteOrphan(null);
    setOrphanBusy(o.uid);
    try {
      await callManageUsers('delete', o.uid);
      toast.success('Login excluído do Firebase.');
      await loadOrphans();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir login.');
    } finally {
      setOrphanBusy(null);
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    defaultValues: {
      name: '',
      username: '',
      email: '',
      cpf: '',
      password: '',
      role: 'usuario',
      person: '',
      allowedPersons: '',
    },
  });

  const watchedRole = watch('role');

  if (!hasPermission('manage_users')) {
    return <p className="text-center py-12 text-[#8fa39a]">Você não tem permissão para acessar esta página.</p>;
  }

  function openNew() {
    reset({
      name: '', username: '', email: '', cpf: '', password: '', role: 'usuario', person: '', allowedPersons: '',
    });
    setEditingId(null);
    setNewFamilyInvite('');
    setError('');
    setShowForm(true);
  }

  function openEdit(u: any) {
    reset({
      name: u.name || '',
      username: u.username || '',
      email: u.email || '',
      cpf: u.cpf || '',
      password: '',
      role: u.role || 'usuario',
      person: u.person || u.name || '',
      allowedPersons: Array.isArray(u.allowedPersons) ? u.allowedPersons.join(', ') : u.allowedPersons || '',
    });
    setEditingId(u.id);
    setNewFamilyInvite('');
    setError('');
    setShowForm(true);
  }

  async function handleSuperAdminChangeFamily() {
    if (!editingId || !newFamilyInvite.trim()) return;
    setChangingFamily(true);
    try {
      const res = await callManageUsers('change-family', editingId, { inviteCode: newFamilyInvite.trim() });
      toast.success(res.message || 'Família alterada com sucesso.');
      setNewFamilyInvite('');
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar família do usuário.');
    } finally {
      setChangingFamily(false);
    }
  }

  async function onSubmit(data: UserFormValues) {
    setError('');
    try {
      if (!editingId) {
        if (!data.password || data.password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres.');
          return;
        }

        const idToken = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            name: data.name.trim(),
            username: data.username.trim(),
            email: data.email.trim().toLowerCase(),
            cpf: data.cpf?.trim() || '',
            password: data.password,
            role: data.role,
            person: data.person?.trim() || data.name.trim(),
            allowedPersons: data.role === 'gerente' ? data.allowedPersons?.trim() || '' : '',
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          setError(result.error || 'Erro ao criar usuário.');
          return;
        }

        toast.success('Usuário criado com sucesso!');
        setShowForm(false);
        return;
      }

      const person = data.person?.trim() || data.name.trim();
      const allowedPersons = data.role === 'gerente' ? data.allowedPersons?.trim() || '' : '';
      const isEditingSelf = editingId === session?.id && !session?.superAdmin;

      const record: any = {
        id: editingId,
        name: data.name.trim(),
        username: data.username.trim(),
        email: data.email.trim().toLowerCase(),
        cpf: data.cpf?.trim() || '',
        personKeys: toPersonKeys([person, data.name, data.username].filter(Boolean)),
        allowedPersonKeys: allowedPersons ? toPersonKeys(allowedPersons) : [],
      };
      if (!isEditingSelf) {
        record.role = data.role;
        record.person = person;
        record.allowedPersons = allowedPersons;
      }

      await saveRecord(record);
      await upsertUserLookup(record);
      toast.success('Usuário atualizado com sucesso!');
      setShowForm(false);
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      setError(err.message || 'Erro ao salvar usuário.');
      toast.error('Erro ao salvar usuário.');
    }
  }

  async function handleToggleStatus(u: User) {
    if (!u.id || u.id === session?.id || u.superAdmin) return;
    const nextStatus = u.status === 'inativo' ? 'ativo' : 'inativo';
    try {
      await saveRecord({ id: u.id, status: nextStatus });
      toast.success(nextStatus === 'inativo' ? `${u.name} foi bloqueado.` : `${u.name} foi desbloqueado.`);
      await loadPending();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status do usuário.');
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget?.id || deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR') return;
    setDeletingUser(true);
    try {
      await callManageUsers('delete', deleteTarget.id);
      toast.success('Usuário e dados vinculados excluídos do sistema.');
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir usuário.');
    } finally {
      setDeletingUser(false);
    }
  }

  if (loading) return <PageLoading message="Carregando usuários..." />;
  if (collectionError) return <PageError error={collectionError} title="Erro ao carregar usuários" />;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 md:pb-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Equipe e Usuários</h2>
          {isFamilyHead && myInviteCode && (
            <div className="mt-1.5 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-[#8fa39a]">
              <span>Código de convite da sua família:</span>
              <strong className="font-mono text-[#e3b04b] tracking-wider">{myInviteCode}</strong>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(myInviteCode);
                  toast.success('Código de convite copiado!');
                }}
                className="text-[#8fa39a] hover:text-white transition-colors ml-1"
                title="Copiar código de convite"
              >
                <i className="fa-regular fa-copy" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {canApproveRequests && (
            <button
              type="button"
              onClick={loadPending}
              disabled={loadingPending}
              className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-[#c9d2cf] transition-colors disabled:opacity-50"
            >
              <i className={`fa-solid fa-user-clock mr-1.5 ${loadingPending ? 'fa-spin' : ''}`} />
              {loadingPending ? 'Consultando...' : 'Atualizar Pendentes'}
            </button>
          )}
          <button
            className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-4 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_4px_14px_rgba(227,176,75,0.25)]"
            onClick={openNew}
          >
            <i className="fa-solid fa-plus text-sm" /> Novo Usuário
          </button>
        </div>
      </div>

      {/* Seção de Aprovação de Cadastros Pendentes (superAdmin vê todos; chefe da família vê os da própria família) */}
      {canApproveRequests && pendingUsers.length > 0 && (
        <div className="mb-8 bg-amber-500/[0.05] border border-amber-500/25 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-500/15 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[#f2f0ea] flex items-center gap-2">
                <i className="fa-solid fa-clock text-amber-400" />
                Solicitações aguardando aprovação ({pendingUsers.length})
              </h3>
              <p className="text-xs text-[#8fa39a] mt-0.5">
                Estes usuários solicitaram acesso e permanecem bloqueados até que você aprove ou recuse.
              </p>
            </div>
          </div>
          {pendingUsers.map((p) => (
            <div
              key={`${p.id}_${p.requestKind}`}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] gap-x-4 gap-y-2 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0">
                <div className="font-bold text-[#f2f0ea] truncate">{p.name}</div>
                <div className="text-xs text-[#8fa39a] truncate">{p.email}</div>
              </div>
              <div className="text-xs text-[#c9d2cf]">
                {p.requestKind === 'change-family' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 font-bold">
                    Mudança de família
                  </span>
                ) : p.usageType === 'family' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 font-bold">
                    Entrar em família {p.requestedInvite ? `(${p.requestedInvite})` : ''}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold">
                    Uso individual
                  </span>
                )}
              </div>
              <div className="hidden md:block text-xs text-[#8fa39a]">
                {p.familyId ? `Família: ${p.familyId.slice(0, 8).toUpperCase()}` : 'Sem família vinculada'}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={pendingBusy === p.id}
                  onClick={() => handleApprovePending(p)}
                  className="px-3.5 h-9 rounded-lg bg-emerald-500 text-[#062117] text-xs font-extrabold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  {pendingBusy === p.id ? '...' : 'Aprovar'}
                </button>
                <button
                  type="button"
                  disabled={pendingBusy === p.id}
                  onClick={() => handleRejectPending(p)}
                  className="px-3.5 h-9 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-bold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {users.length === 0 ? (
        <EmptyState
          icon="fa-users"
          title="Nenhum usuário cadastrado"
          description="Cadastre membros da equipe ou familiares com permissões personalizadas."
          actionLabel="Novo usuário"
          onAction={openNew}
        />
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_160px_120px] gap-4 px-5 py-3 border-b border-white/[0.06] text-[11px] uppercase tracking-wider font-bold text-[#5c6b66]">
            <span>Usuário</span><span>E-mail</span><span>Pessoa</span><span>Acesso</span><span className="text-right">Ações</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_160px_120px] gap-x-4 gap-y-2 items-center px-5 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#e3b04b]/15 text-[#e3b04b] flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                  {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" /> : (u.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[#f2f0ea] truncate">{u.name}</div>
                  <div className="text-xs text-[#8fa39a] truncate">@{u.username}</div>
                </div>
              </div>
              <div className="hidden md:block text-sm text-[#c9d2cf] truncate" title={u.email}>{u.email || '-'}</div>
              <div className="hidden md:block text-sm text-[#c9d2cf] truncate">{u.person || u.name}</div>
              <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                <span className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[0.65rem] ${u.role === 'admin' ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : u.role === 'gerente' ? 'bg-[#4d8dff]/20 text-[#4d8dff]' : 'bg-white/10 text-[#8fa39a]'}`}>{u.role}</span>
                {u.status === 'inativo' && (
                  <span className="px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[0.65rem] bg-red-500/20 text-red-400">Bloqueado</span>
                )}
                {u.status === 'pendente' && (
                  <span className="px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[0.65rem] bg-amber-500/20 text-amber-300">Pendente</span>
                )}
              </div>
              <div className="flex justify-end gap-1">
                <button onClick={() => openEdit(u)} className="w-9 h-9 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-[#e3b04b] transition-colors flex items-center justify-center" aria-label="Editar usuário" title="Editar usuário">
                  <i className="fa-solid fa-pen text-[0.8rem]" />
                </button>
                {u.id !== session?.id && !u.superAdmin && session?.role === 'admin' && (
                  <button
                    onClick={() => handleToggleStatus(u)}
                    className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${u.status === 'inativo' ? 'text-amber-400 hover:bg-emerald-500/15 hover:text-emerald-400' : 'text-[#8fa39a] hover:bg-amber-500/15 hover:text-amber-400'}`}
                    aria-label={u.status === 'inativo' ? 'Desbloquear usuário' : 'Bloquear usuário'}
                    title={u.status === 'inativo' ? 'Desbloquear usuário' : 'Bloquear usuário'}
                  >
                    <i className={`fa-solid ${u.status === 'inativo' ? 'fa-lock-open' : 'fa-lock'} text-[0.8rem]`} />
                  </button>
                )}
                {u.id !== session?.id && !u.superAdmin && (
                  <button
                    onClick={() => {
                      setDeleteTarget(u);
                      setDeleteConfirmText('');
                    }}
                    className="w-9 h-9 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-red-400 transition-colors flex items-center justify-center"
                    aria-label="Excluir usuário"
                    title="Excluir usuário"
                  >
                    <i className="fa-solid fa-trash text-[0.8rem]" />
                  </button>
                )}
              </div>
              <div className="md:hidden col-span-2 flex flex-wrap items-center gap-2 text-xs text-[#8fa39a]">
                <span className="truncate">{u.email || 'sem e-mail'}</span>
                <span>&bull;</span>
                <span>{u.person || u.name}</span>
                <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[0.6rem] ${u.role === 'admin' ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : u.role === 'gerente' ? 'bg-[#4d8dff]/20 text-[#4d8dff]' : 'bg-white/10 text-[#8fa39a]'}`}>{u.role}</span>
                {u.status === 'inativo' && (
                  <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[0.6rem] bg-red-500/20 text-red-400">Bloqueado</span>
                )}
                {u.status === 'pendente' && (
                  <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[0.6rem] bg-amber-500/20 text-amber-300">Pendente</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {session?.superAdmin && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
          <button onClick={loadOrphans} disabled={checkingOrphans} className="px-3 h-9 rounded-lg bg-white/5 text-[#8fa39a] font-bold hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50">
            <i className={`fa-solid fa-rotate mr-1.5 ${checkingOrphans ? 'fa-spin' : ''}`} />
            {checkingOrphans ? 'Verificando...' : 'Verificar logins do Firebase'}
          </button>
          <button onClick={handlePrepareData} disabled={preparingData} className="px-3 h-9 rounded-lg bg-[#e3b04b]/15 text-[#e3b04b] font-bold hover:bg-[#e3b04b]/25 transition-colors disabled:opacity-50">
            <i className={`fa-solid fa-wand-magic-sparkles mr-1.5 ${preparingData ? 'fa-spin' : ''}`} />
            {preparingData ? 'Preparando dados...' : 'Preparar dados (preencher familyId)'}
          </button>
          {!checkingOrphans && !orphanError && orphans.length === 0 && (
            <span className="text-[#34d399]"><i className="fa-solid fa-check mr-1" />Todos os logins do Firebase têm cadastro no sistema.</span>
          )}
        </div>
      )}

      {session?.superAdmin && orphanError && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <i className="fa-solid fa-circle-exclamation mr-2" />{orphanError}
        </div>
      )}

      {session?.superAdmin && orphans.length > 0 && (
        <div className="mt-8 bg-[#e3b04b]/[0.04] border border-[#e3b04b]/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e3b04b]/10">
            <h3 className="font-bold text-[#f2f0ea] flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-[#e3b04b]" />
              Logins no Firebase sem cadastro no sistema ({orphans.length})
            </h3>
            <p className="text-xs text-[#8fa39a] mt-1">
              Essas contas conseguem existir no Firebase mas não aparecem aqui. Vincule pra trazer pro sistema, ou exclua se for conta antiga.
            </p>
          </div>
          {orphans.map((o) => (
            <div key={o.uid} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] gap-x-4 gap-y-1 items-center px-5 py-3 border-b border-white/[0.04] last:border-0">
              <div className="min-w-0">
                <div className="font-semibold text-[#f2f0ea] truncate">{o.email || '(sem e-mail)'}</div>
                <div className="text-xs text-[#8fa39a] truncate">{o.name || 'Sem nome'}</div>
              </div>
              <div className="hidden md:block text-xs text-[#8fa39a]">Criado em {o.createdAt ? new Date(o.createdAt).toLocaleDateString('pt-BR') : '-'}</div>
              <div className="hidden md:block text-xs text-[#8fa39a]">Último acesso: {o.lastSignIn ? new Date(o.lastSignIn).toLocaleDateString('pt-BR') : 'nunca'}</div>
              <div className="flex justify-end gap-2">
                <button disabled={orphanBusy === o.uid} onClick={() => handleLinkOrphan(o)} className="px-3 h-9 rounded-lg bg-[#e3b04b] text-black text-xs font-bold hover:bg-[#f5d78a] transition-colors disabled:opacity-50">
                  {orphanBusy === o.uid ? '...' : 'Vincular'}
                </button>
                <button disabled={orphanBusy === o.uid} onClick={() => setDeleteOrphan(o)} className="px-3 h-9 rounded-lg bg-white/5 text-[#8fa39a] text-xs font-bold hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteOrphan}
        title="Excluir login do Firebase"
        message={`Isso apaga de vez o login ${deleteOrphan?.email || ''} do Firebase. A pessoa não vai mais conseguir entrar. Continuar?`}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteOrphan}
        onCancel={() => setDeleteOrphan(null)}
      />

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form className="bg-[#141d1a] border border-white/10 rounded-[20px] p-6 sm:p-8 w-full max-w-[540px] flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-2">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Nome Completo</label>
                <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('name')} />
                {errors.name && <span className="text-red-400 text-xs mt-1 block">{errors.name.message}</span>}
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Usuário (login)</label>
                <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('username')} />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">E-mail</label>
                <input type="email" className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none disabled:opacity-50" {...register('email')} disabled={!!editingId} />
              </div>

              {!editingId && (
                <div>
                  <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Senha Inicial</label>
                  <input type="password" className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('password')} />
                </div>
              )}

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Cargo</label>
                <Controller name="role" control={control} render={({ field }) => (
                  <CustomSelect value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    <option value="usuario">Usuário Normal</option>
                    <option value="gerente">Gerente</option>
                    <option value="viewer">Visualizador</option>
                    {(session?.superAdmin || field.value === 'admin') && (
                      <option value="admin">Administrador</option>
                    )}
                  </CustomSelect>
                )} />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Pessoa Financeira Vinculada</label>
                <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('person')} placeholder="Ex: Nome da pessoa que receberá os lançamentos" />
              </div>

              {watchedRole === 'gerente' && (
                <div className="sm:col-span-2">
                  <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase text-blue-400">Pessoas Permitidas (Modo Gerente)</label>
                  <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-blue-400 outline-none" {...register('allowedPersons')} placeholder="Ex: Eduardo, Maria (vazio = vê todos)" />
                </div>
              )}

              {editingId && session?.superAdmin && (
                <div className="sm:col-span-2 pt-3 border-t border-white/[0.08]">
                  <label className="block text-[0.75rem] font-semibold text-amber-400 mb-1 uppercase">Mover Usuário de Família (SuperAdmin)</label>
                  <p className="text-xs text-[#8fa39a] mb-2">
                    Aviso: Seus dados anteriores não serão levados para a nova família. A migração de lançamentos antigos é manual.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFamilyInvite}
                      onChange={(e) => setNewFamilyInvite(e.target.value)}
                      placeholder="Código de convite ou UID da nova família"
                      className="flex-1 p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] text-sm focus:border-amber-400 outline-none"
                    />
                    <button
                      type="button"
                      disabled={changingFamily || !newFamilyInvite.trim()}
                      onClick={handleSuperAdminChangeFamily}
                      className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      {changingFamily ? 'Movendo...' : 'Mover Família'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="p-3 mt-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">{error}</div>}

            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-white/[0.06]">
              <button type="button" className="px-5 py-2.5 rounded-xl text-[#8fa39a] font-medium hover:text-white transition-colors" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#e3b04b] text-[#1c1206] font-bold transition-all hover:scale-105" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Usuário'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de confirmação extra para exclusão de outro usuário pelo admin */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!deletingUser) {
              setDeleteTarget(null);
              setDeleteConfirmText('');
            }
          }}
        >
          <div
            className="bg-[#141d1a] border border-red-500/30 rounded-2xl p-6 sm:p-7 w-full max-w-[460px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[#f2f0ea] flex items-center gap-2 mb-2">
              <i className="fa-solid fa-triangle-exclamation text-red-400" />
              Excluir usuário permanentemente
            </h3>
            <p className="text-sm text-[#c9d2cf] mb-3">
              Você está prestes a excluir <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
              Isso apagará o login no Firebase, o cadastro e todos os lançamentos, contas e cartões pertencentes a este usuário.
            </p>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#8fa39a] mb-1.5">
              Digite <span className="text-red-400">EXCLUIR</span> para confirmar:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              className="w-full p-3 rounded-xl border border-white/10 bg-black/30 text-[#f2f0ea] outline-none focus:border-red-400 mb-5 font-mono uppercase"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={deletingUser}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-[#8fa39a] hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingUser || deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR'}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {deletingUser ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
