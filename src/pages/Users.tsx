import React, { useState } from 'react';
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
  role: 'admin' | 'gerente' | 'usuario';
  person?: string;
  allowedPersons?: string;
}

export default function Users() {
  const { session, hasPermission } = useAuth() as { session: User; hasPermission: (mod: string) => boolean };
  const { data: users, loading, error: collectionError, saveRecord, deleteRecord } = useCollection<User>('users');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    setError('');
    setShowForm(true);
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

      const record: any = {
        id: editingId,
        name: data.name.trim(),
        username: data.username.trim(),
        email: data.email.trim().toLowerCase(),
        cpf: data.cpf?.trim() || '',
        role: data.role,
        person,
        allowedPersons,
        status: 'ativo',
        personKeys: toPersonKeys([person, data.name, data.username].filter(Boolean)),
        allowedPersonKeys: allowedPersons ? toPersonKeys(allowedPersons) : [],
      };

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

  async function handleConfirmDelete() {
    if (!deleteId) return;
    try {
      await deleteRecord(deleteId);
      toast.success('Registro do usuário excluído com sucesso!');
    } catch (err) {
      toast.error('Erro ao excluir usuário.');
    } finally {
      setDeleteId(null);
    }
  }

  if (loading) return <PageLoading message="Carregando usuários..." />;
  if (collectionError) return <PageError error={collectionError} title="Erro ao carregar usuários" />;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 md:pb-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Equipe e Usuários</h2>
        <button 
          className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-4 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_4px_14px_rgba(227,176,75,0.25)]"
          onClick={openNew}
        >
          <i className="fa-solid fa-plus text-sm" /> Novo Usuário
        </button>
      </div>

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
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_120px_96px] gap-4 px-5 py-3 border-b border-white/[0.06] text-[11px] uppercase tracking-wider font-bold text-[#5c6b66]">
            <span>Usuário</span><span>E-mail</span><span>Pessoa</span><span>Acesso</span><span className="text-right">Ações</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_120px_96px] gap-x-4 gap-y-2 items-center px-5 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors">
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
              <div className="hidden md:block">
                <span className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[0.65rem] ${u.role === 'admin' ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : u.role === 'gerente' ? 'bg-[#4d8dff]/20 text-[#4d8dff]' : 'bg-white/10 text-[#8fa39a]'}`}>{u.role}</span>
              </div>
              <div className="flex justify-end gap-1">
                <button onClick={() => openEdit(u)} className="w-9 h-9 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-[#e3b04b] transition-colors flex items-center justify-center" aria-label="Editar usuário">
                  <i className="fa-solid fa-pen text-[0.8rem]" />
                </button>
                {u.id !== session?.id && (
                  <button onClick={() => setDeleteId(u.id || null)} className="w-9 h-9 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-red-400 transition-colors flex items-center justify-center" aria-label="Excluir usuário">
                    <i className="fa-solid fa-trash text-[0.8rem]" />
                  </button>
                )}
              </div>
              <div className="md:hidden col-span-2 flex flex-wrap items-center gap-2 text-xs text-[#8fa39a]">
                <span className="truncate">{u.email || 'sem e-mail'}</span>
                <span>&bull;</span>
                <span>{u.person || u.name}</span>
                <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[0.6rem] ${u.role === 'admin' ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : u.role === 'gerente' ? 'bg-[#4d8dff]/20 text-[#4d8dff]' : 'bg-white/10 text-[#8fa39a]'}`}>{u.role}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form className="bg-[#141d1a] border border-white/10 rounded-[20px] p-6 sm:p-8 w-full max-w-[540px] flex flex-col gap-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
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
                    <option value="admin">Administrador</option>
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

      <ConfirmModal isOpen={!!deleteId} title="Excluir Usuário" message="Tem certeza que deseja excluir o registro deste usuário?" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
