import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';

const emptyForm = { name: '', limit: '', closeDay: '28', dueDay: '10', owner: '' };

// Identidade visual por banco/loja: cada cartão físico tem uma cor que a
// pessoa já reconhece de cabeça (o roxo do Nubank, o laranja do Inter etc).
// Uma paleta única pra todos apaga essa referência, então mapeamos por nome.
const BRAND_STYLES = [
  { match: /amazon/i, gradient: 'linear-gradient(135deg, #17181b 0%, #2b2c30 55%, #ff9900 130%)', text: '#fff' },
  { match: /inter/i, gradient: 'linear-gradient(135deg, #ff7a00 0%, #ff9a3c 100%)', text: '#1a1200' },
  { match: /ita[uú]/i, gradient: 'linear-gradient(135deg, #003399 0%, #0057d9 60%, #7fb2ff 130%)', text: '#fff' },
  { match: /a[cç]ucar|pao de a|assai|extra/i, gradient: 'linear-gradient(135deg, #a3061a 0%, #d4132f 100%)', text: '#fff' },
  { match: /neon/i, gradient: 'linear-gradient(135deg, #041226 0%, #0b3d91 60%, #00e0ff 140%)', text: '#fff' },
  { match: /mercado ?pago/i, gradient: 'linear-gradient(135deg, #00263d 0%, #009ee3 100%)', text: '#fff' },
  { match: /riachuelo|richuelo/i, gradient: 'linear-gradient(135deg, #6b0f4a 0%, #c2185b 60%, #ff6fae 130%)', text: '#fff' },
  { match: /nubank|nu ?/i, gradient: 'linear-gradient(135deg, #820ad1 0%, #a020f0 100%)', text: '#fff' },
  { match: /bradesco/i, gradient: 'linear-gradient(135deg, #7a0019 0%, #cc092f 100%)', text: '#fff' },
  { match: /santander/i, gradient: 'linear-gradient(135deg, #8b0000 0%, #ec0000 100%)', text: '#fff' },
  { match: /caixa/i, gradient: 'linear-gradient(135deg, #003ca5 0%, #0066cc 60%, #ff6600 130%)', text: '#fff' },
  { match: /banco do brasil|^bb$/i, gradient: 'linear-gradient(135deg, #003366 0%, #ffcc00 140%)', text: '#fff' },
];
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #1e293b 0%, #334155 55%, #6366f1 140%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 55%, #2c5364 140%)',
  'linear-gradient(135deg, #1a2a1a 0%, #2d4a2d 55%, #4a7a4a 140%)',
];

function brandStyle(name) {
  const found = BRAND_STYLES.find((b) => b.match.test(name || ''));
  if (found) return found;
  const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_GRADIENTS.length;
  return { gradient: FALLBACK_GRADIENTS[idx], text: '#fff' };
}

export default function Cards() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  const { data: cards, loading, saveRecord, deleteRecord } = useCollection('cards');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('cards', 'edit');
  const visible = session.role === 'admin' ? cards : cards.filter((c) => canAccessPerson(c.owner));

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(card) {
    setForm({
      name: card.name || '',
      limit: card.limit ?? '',
      closeDay: card.closeDay ?? '28',
      dueDay: card.dueDay ?? '10',
      owner: card.owner || '',
    });
    setEditingId(card.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({
      id: editingId || undefined,
      name: form.name.trim(),
      limit: parseFloat(form.limit) || 0,
      closeDay: parseInt(form.closeDay) || 28,
      dueDay: parseInt(form.dueDay) || 10,
      owner,
      ownerKey: normalize(owner),
    });
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este cartão?')) return;
    await deleteRecord(id);
  }

  if (loading) return <div className="page-loading">Carregando...</div>;

  return (
    <div className="cards-page">
      <div className="page-header">
        <h2>Cartões</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Novo cartão
          </button>
        )}
      </div>

      <div className="cards-grid">
        {visible.map((card) => {
          const style = brandStyle(card.name);
          return (
            <div
              className="credit-card"
              key={card.id}
              style={{ background: style.gradient, color: style.text }}
            >
              <div className="credit-card-top">
                <span className="credit-card-chip" aria-hidden="true" />
                {canEdit && (
                  <div className="card-actions" style={{ color: style.text }}>
                    <button onClick={() => openEdit(card)} aria-label="Editar cartão">
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button onClick={() => handleDelete(card.id)} aria-label="Excluir cartão">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                )}
              </div>

              <div className="credit-card-limit">
                <span className="credit-card-limit-label">Limite</span>
                <strong>{formatCurrency(card.limit)}</strong>
              </div>

              <div className="credit-card-bottom">
                <span className="credit-card-name">{card.name}</span>
                <span className="credit-card-dates">
                  Fecha {card.closeDay} &bull; Vence {card.dueDay}
                </span>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <p className="empty-state">Nenhum cartão cadastrado.</p>}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{editingId ? 'Editar cartão' : 'Novo cartão'}</h3>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <label>Limite</label>
            <input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} />
            <label>Dia de fechamento</label>
            <input type="number" min="1" max="31" value={form.closeDay} onChange={(e) => setForm({ ...form, closeDay: e.target.value })} />
            <label>Dia de vencimento</label>
            <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} />
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
