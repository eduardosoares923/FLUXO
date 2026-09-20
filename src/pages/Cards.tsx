import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { User } from '../types';

interface CardData {
  id?: string;
  name: string;
  limit: number | string;
  closeDay: number | string;
  dueDay: number | string;
  owner: string;
  ownerKey?: string;
}

const emptyForm: CardData = { name: '', limit: '', closeDay: '28', dueDay: '10', owner: '' };

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

function brandStyle(name: string) {
  const found = BRAND_STYLES.find((b) => b.match.test(name || ''));
  if (found) return found;
  const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_GRADIENTS.length;
  return { gradient: FALLBACK_GRADIENTS[idx], text: '#fff' };
}

export default function Cards() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { 
    session: User; 
    hasPermission: (mod: string, act?: string) => boolean;
    canAccessPerson: (p?: string) => boolean;
  };
  const { data: cards, loading, saveRecord, deleteRecord } = useCollection<CardData>('cards');
  
  const [form, setForm] = useState<CardData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('cards', 'edit');
  const visible = session?.role === 'admin' ? cards : cards.filter((c) => canAccessPerson(c.owner));

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(card: CardData) {
    setForm({
      name: card.name || '',
      limit: card.limit ?? '',
      closeDay: card.closeDay ?? '28',
      dueDay: card.dueDay ?? '10',
      owner: card.owner || '',
    });
    setEditingId(card.id || null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    const owner = form.owner?.trim() || session?.person || '';
    
    await saveRecord({
      id: editingId || undefined,
      name: form.name.trim(),
      limit: typeof form.limit === 'string' ? parseFloat(form.limit) || 0 : form.limit || 0,
      closeDay: typeof form.closeDay === 'string' ? parseInt(form.closeDay) || 28 : form.closeDay || 28,
      dueDay: typeof form.dueDay === 'string' ? parseInt(form.dueDay) || 10 : form.dueDay || 10,
      owner,
      ownerKey: normalize(owner),
    });
    setShowForm(false);
  }

  async function handleDelete(id?: string) {
    if (!id || !confirm('Excluir este cartão?')) return;
    await deleteRecord(id);
  }

  if (loading) return <div className="flex items-center justify-center h-[60vh] text-[#8fa39a] animate-pulse">Carregando cartões...</div>;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Cartões de Crédito</h2>
        {canEdit && (
          <button 
            className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-4 py-2.5 rounded-xl font-bold transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(227,176,75,0.4)]"
            onClick={openNew}
          >
            <i className="fa-solid fa-plus text-sm" /> Novo Cartão
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {visible.map((card) => {
          const style = brandStyle(card.name);
          return (
            <div
              key={card.id}
              className="group relative aspect-[1.6/1] rounded-[20px] p-5 flex flex-col justify-between overflow-hidden shadow-[0_16px_30px_-16px_rgba(0,0,0,0.6)] transition-all duration-300 hover:-translate-y-1.5 hover:-rotate-[0.6deg] hover:scale-[1.015] hover:shadow-[0_26px_44px_-18px_rgba(0,0,0,0.7)]"
              style={{ background: style.gradient, color: style.text }}
            >
              {/* Brilho interno do cartão */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgba(255,255,255,0.22),transparent_55%)] pointer-events-none" />
              
              <div className="flex justify-between items-start relative z-10">
                {/* Chip Dourado */}
                <div className="w-[34px] h-[25px] rounded-md bg-gradient-to-br from-[#ffd682] to-[#c8a03c] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]" />
                
                {canEdit && (
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: style.text }}>
                    <button onClick={() => openEdit(card)} className="hover:opacity-100 opacity-70 transition-opacity" title="Editar">
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button onClick={() => handleDelete(card.id)} className="hover:opacity-100 opacity-70 transition-opacity" title="Excluir">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                )}
              </div>

              <div className="relative z-10 mt-auto mb-2">
                <span className="block text-[0.7rem] tracking-wide opacity-80 mb-0.5 uppercase">Limite</span>
                <strong className="text-[1.6rem] tracking-tight font-mono">{formatCurrency(card.limit)}</strong>
              </div>

              <div className="flex flex-col gap-0.5 relative z-10">
                <span className="font-bold text-[0.95rem]">{card.name}</span>
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] opacity-85">Fecha {card.closeDay} &bull; Vence {card.dueDay}</span>
                  {card.owner && <span className="bg-black/20 px-2 py-0.5 rounded text-[0.7rem] uppercase font-bold tracking-wider">{card.owner}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full text-center text-[#8fa39a] py-16 bg-white/[0.02] rounded-2xl border border-white/5 border-dashed">
            Nenhum cartão cadastrado ainda.
          </p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form 
            className="bg-[#141d1a] border border-white/10 rounded-[20px] p-6 sm:p-8 w-full max-w-[540px] flex flex-col gap-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()} 
            onSubmit={handleSubmit}
          >
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-1">{editingId ? 'Editar Cartão' : 'Novo Cartão'}</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Nome do Cartão</label>
                <input 
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus placeholder="Ex: Nubank, Itaú..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Limite (R$)</label>
                <input
                  type="number" step="0.01"
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20 font-mono text-lg"
                  value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Dia de Fechamento</label>
                <input
                  type="number" min="1" max="31"
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.closeDay} onChange={(e) => setForm({ ...form, closeDay: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Dia de Vencimento</label>
                <input
                  type="number" min="1" max="31"
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Responsável / Dono</label>
                <input 
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Ex: Nome do Sócio"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/[0.06]">
              <button type="button" className="px-5 py-2.5 rounded-xl text-[#8fa39a] font-medium hover:text-white hover:bg-white/5 transition-colors" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] font-bold transition-all hover:scale-105 shadow-[0_4px_12px_rgba(227,176,75,0.3)]">
                Salvar Cartão
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
