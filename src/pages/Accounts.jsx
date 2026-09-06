import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency } from '../utils/format';

const emptyForm = { name: '', bank: '', balance: '', owner: '' };

export default function Accounts() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  const { data: accounts, loading, saveRecord, deleteRecord } = useCollection('accounts');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('accounts', 'edit');
  const visible = session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner));

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(acc) {
    setForm({ name: acc.name || '', bank: acc.bank || '', balance: acc.balance ?? '', owner: acc.owner || '' });
    setEditingId(acc.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await saveRecord({
      id: editingId || undefined,
      name: form.name.trim(),
      bank: form.bank.trim(),
      balance: parseFloat(form.balance) || 0,
      owner: form.owner.trim() || session.person,
    });
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta conta?')) return;
    await deleteRecord(id);
  }

  if (loading) return <div className="page-loading">Carregando...</div>;

  return (
    <div className="accounts-page">
      <div className="page-header">
        <h2>Contas</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Nova conta
          </button>
        )}
      </div>

      <div className="accounts-grid">
        {visible.map((acc) => (
          <div className="account-card" key={acc.id}>
            <div className="account-card-header">
              <div className="account-card-title">
                <span className="icon-badge account-icon">
                  <i className="fa-solid fa-building-columns" />
                </span>
                <strong>{acc.name}</strong>
              </div>
              {canEdit && (
                <div className="card-actions">
                  <button onClick={() => openEdit(acc)}>
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button onClick={() => handleDelete(acc.id)}>
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>
              )}
            </div>
            <span className="account-bank">{acc.bank}</span>
            <span className="account-balance">{formatCurrency(acc.balance)}</span>
            {acc.owner && <span className="account-owner">{acc.owner}</span>}
          </div>
        ))}
        {visible.length === 0 && <p className="empty-state">Nenhuma conta cadastrada.</p>}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{editingId ? 'Editar conta' : 'Nova conta'}</h3>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <label>Banco</label>
            <input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            <label>Saldo inicial</label>
            <input
              type="number"
              step="0.01"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
            />
            <label>Pessoa (dono)</label>
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
