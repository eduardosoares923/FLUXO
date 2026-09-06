import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, upsertUserLookup } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { auth } from '../firebase';
import { userSchema } from '../schemas/financialSchemas';
import { toPersonKeys } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../stores/useToastStore';

export default function Users() {
  const { session, hasPermission } = useAuth();
  const { data: users, loading, error: collectionError, saveRecord, deleteRecord } = useCollection('users');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(userSchema),
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
    return <p className="empty-state">Você não tem permissão para acessar esta página.</p>;
  }

  function openNew() {
    reset({
      name: '',
      username: '',
      email: '',
      cpf: '',
      password: '',
      role: 'usuario',
      person: '',
      allowedPersons: '',
    });
    setEditingId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(u) {
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

  async function onSubmit(data) {
    setError('');
    try {
      if (!editingId) {
        // Criação: passa pela API serverless (Admin SDK), pra NÃO trocar a
        // sessão do navegador pro usuário recém-criado (é isso que
        // createUserWithEmailAndPassword no cliente fazia, e derrubava o
        // admin da própria sessão).
        if (!data.password || data.password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres.');
          return;
        }

        const idToken = await auth.currentUser.getIdToken();
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

      // Edição: continua direto no Firestore, isso não mexe em nenhuma
      // sessão de autenticação, só nos dados do documento já existente.
      const person = data.person?.trim() || data.name.trim();
      const allowedPersons = data.role === 'gerente' ? data.allowedPersons?.trim() || '' : '';

      const record = {
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
    } catch (err) {
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
    <div className="users-page">
      <div className="page-header">
        <h2>Usuários</h2>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fa-solid fa-plus" /> Novo usuário
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
        <table className="tx-table full hoverable">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Cargo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="icon-badge user-avatar-badge">
                      <i className="fa-solid fa-user" />
                    </span>
                    <div>
                      <strong>{u.name}</strong>
                      {u.person && u.person !== u.name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Pessoa: {u.person}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '3px 8px',
                      borderRadius: '10px',
                      background:
                        u.role === 'admin'
                          ? 'rgba(227, 176, 75, 0.15)'
                          : u.role === 'gerente'
                          ? 'rgba(77, 141, 255, 0.15)'
                          : 'rgba(255, 255, 255, 0.05)',
                      color:
                        u.role === 'admin'
                          ? 'var(--accent-primary)'
                          : u.role === 'gerente'
                          ? 'var(--blue)'
                          : 'var(--text-secondary)',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  <button onClick={() => openEdit(u)} title="Editar usuário">
                    <i className="fa-solid fa-pen" />
                  </button>
                  {u.id !== session?.id && (
                    <button onClick={() => setDeleteId(u.id)} title="Excluir usuário">
                      <i className="fa-solid fa-trash" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3>{editingId ? 'Editar usuário' : 'Novo usuário'}</h3>

            <label>Nome</label>
            <input {...register('name')} placeholder="Ex: Maria Silva" />
            {errors.name && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.name.message}</span>}

            <label>Usuário (login)</label>
            <input {...register('username')} placeholder="Ex: mariasilva" />
            {errors.username && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.username.message}</span>}

            <label>E-mail</label>
            <input type="email" {...register('email')} placeholder="maria@exemplo.com" disabled={!!editingId} />
            {errors.email && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.email.message}</span>}

            <label>CPF</label>
            <input {...register('cpf')} placeholder="000.000.000-00" />
            {errors.cpf && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.cpf.message}</span>}

            {!editingId && (
              <>
                <label>Senha</label>
                <input type="password" {...register('password')} placeholder="Mínimo 6 caracteres" />
                {errors.password && (
                  <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.password.message}</span>
                )}
              </>
            )}

            <label>Cargo</label>
            <select {...register('role')}>
              <option value="usuario">Usuário</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Administrador</option>
            </select>

            <label>Pessoa vinculada</label>
            <input {...register('person')} placeholder="Nome da pessoa para vínculo financeiro" />

            {watchedRole === 'gerente' && (
              <>
                <label>Pessoas permitidas (gerente)</label>
                <input
                  {...register('allowedPersons')}
                  placeholder="Ex: Eduardo, Mãe (separado por vírgula; vazio = vê todo mundo)"
                />
              </>
            )}

            {error && <div className="login-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Excluir Usuário"
        message="Tem certeza que deseja excluir o registro deste usuário? (O login continuará existindo no Firebase Auth)."
        confirmLabel="Excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
