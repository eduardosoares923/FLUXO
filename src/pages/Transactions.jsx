import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth } from '../utils/format';

const CATEGORY_ICONS = {
  alimentação: 'fa-utensils',
  mercado: 'fa-cart-shopping',
  moradia: 'fa-house',
  transporte: 'fa-car',
  saúde: 'fa-heart-pulse',
  educação: 'fa-graduation-cap',
  lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar',
  investimentos: 'fa-chart-line',
  assinaturas: 'fa-rotate',
  'roupas e acessórios': 'fa-shirt',
};

function iconForCategory(category, type) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

const emptyForm = {
  description: '',
  amount: '',
  type: 'expense',
  category: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: 'account',
  person: '',
};

export default function Transactions() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  const { data: transactions, loading, saveRecord, deleteRecord } = useCollection('transactions');
  const { data: accounts } = useCollection('accounts');
  const { data: cards } = useCollection('cards');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('transactions', 'edit');

  const visible = useMemo(
    () =>
      [...transactions]
        .filter((tx) => canAccessPerson(tx.person, tx))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, canAccessPerson]
  );

  function openNew() {
    setForm({ ...emptyForm, person: session.person });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(tx) {
    setForm({
      description: tx.description || '',
      amount: tx.amount ?? '',
      type: tx.type || 'expense',
      category: tx.category || '',
      date: tx.date || emptyForm.date,
      paymentMethod: tx.paymentMethod || 'account',
      person: tx.person || session.person,
    });
    setEditingId(tx.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return;

    const record = {
      id: editingId || undefined,
      description: form.description.trim(),
      amount: parseFloat(form.amount) || 0,
      type: form.type,
      category: form.category.trim(),
      date: form.date,
      paymentMethod: form.paymentMethod,
      person: form.person.trim() || session.person,
      userId: session.id,
    };

    if (form.paymentMethod.startsWith('card_')) {
      const cardId = form.paymentMethod.replace('card_', '');
      const card = cards.find((c) => String(c.id) === cardId);
      if (card) record.invoiceMonth = getCardInvoiceMonth(form.date, card.closeDay);
    }

    await saveRecord(record);
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta transação?')) return;
    await deleteRecord(id);
  }

  if (loading) return <div className="page-loading">Carregando...</div>;

  return (
    <div className="transactions-page">
      <div className="page-header">
        <h2>Transações</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Nova transação
          </button>
        )}
      </div>

      <table className="tx-table full">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Pessoa</th>
            <th>Valor</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((tx) => (
            <tr key={tx.id}>
              <td>{formatDate(tx.date)}</td>
              <td>
                <span className={`icon-badge tx-table-icon ${tx.type === 'income' ? 'income' : 'expense'}`}>
                  <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                </span>
                {tx.description}
              </td>
              <td>{tx.category}</td>
              <td>{tx.person}</td>
              <td className={tx.type === 'income' ? 'income' : 'expense'}>
                {tx.type === 'income' ? '+ ' : '- '}
                {formatCurrency(tx.amount)}
              </td>
              {canEdit && (
                <td>
                  <button onClick={() => openEdit(tx)}>
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button onClick={() => handleDelete(tx.id)}>
                    <i className="fa-solid fa-trash" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="empty-state">
                Nenhuma transação encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{editingId ? 'Editar transação' : 'Nova transação'}</h3>

            <label>Descrição</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />

            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>

            <label>Valor</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />

            <label>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />

            <label>Categoria</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />

            <label>Forma de pagamento</label>
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="account">Conta corrente (padrão)</option>
              {accounts.map((a) => (
                <option key={a.id} value={`acc_${a.id}`}>
                  {a.name}
                </option>
              ))}
              {cards.map((c) => (
                <option key={c.id} value={`card_${c.id}`}>
                  Cartão {c.name}
                </option>
              ))}
            </select>

            <label>Pessoa</label>
            <input value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} />

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
