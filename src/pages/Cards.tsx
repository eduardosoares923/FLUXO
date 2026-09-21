import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { Card, User } from '../types';

const emptyForm = { name: '', limit: '', closeDay: '28', dueDay: '10', owner: '' };

// Cores simplificadas direto no Tailwind
const BRAND_STYLES = [
  { match: /amazon/i, bg: 'bg-gradient-to-br from-gray-900 to-[#ff9900]' },
  { match: /inter/i, bg: 'bg-gradient-to-br from-[#ff7a00] to-[#ff9a3c]' },
  { match: /ita[uú]/i, bg: 'bg-gradient-to-br from-[#003399] to-[#0057d9]' },
  { match: /nubank|nu ?/i, bg: 'bg-gradient-to-br from-[#820ad1] to-[#a020f0]' },
  { match: /caixa/i, bg: 'bg-gradient-to-br from-[#003ca5] to-[#ff6600]' },
  { match: /santander|bradesco/i, bg: 'bg-gradient-to-br from-[#cc0000] to-[#8b0000]' },
];

function getBrandBg(name: string) {
  const found = BRAND_STYLES.find((b) => b.match.test(name || ''));
  return found ? found.bg : 'bg-gradient-to-br from-slate-800 to-slate-900';
}

export default function Cards() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User, hasPermission: any, canAccessPerson: any };
  const { data: cards, loading, saveRecord, deleteRecord } = useCollection<Card>('cards');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('cards', 'edit');
  const visible = session.role === 'admin' ? cards : cards.filter((c) => canAccessPerson(c.owner));

  function openEdit(card: Card) { 
    setForm({ name: card.name, limit: String(card.limit), closeDay: String(card.closeDay), dueDay: String(card.dueDay), owner: card.owner || '' }); 
    setEditingId(card.id); 
    setShowForm(true); 
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({ id: editingId || undefined, name: form.name.trim(), limit: parseFloat(form.limit) || 0, closeDay: parseInt(form.closeDay) || 28, dueDay: parseInt(form.dueDay) || 10, owner, ownerKey: normalize(owner) });
    setShowForm(false);
  }

  if (loading) return <div className="p-10 text-center text-[#8fa39a] animate-pulse">Carregando cartões...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-20">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea]">Cartões</h2>
        {canEdit && (
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform">
            <i className="fa-solid fa-plus mr-2"/> Novo Cartão
          </button>
        )}
      </div>

      {/* Grid Responsivo Super Limpo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {visible.map((card) => (
          <div key={card.id} className={`${getBrandBg(card.name)} aspect-[1.6/1] rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between hover:-translate-y-1 transition-transform`}>
            
            <div className="flex justify-between items-start">
              {/* Chip do Cartão */}
              <div className="w-12 h-8 bg-yellow-100/40 rounded flex items-center justify-center">
                <div className="w-8 h-5 border border-yellow-800/30 rounded-sm" />
              </div>
              
              {/* Botões de Ação */}
              {canEdit && (
                <div className="flex gap-3">
                  <button onClick={() => openEdit(card)} className="hover:text-yellow-300"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => confirm('Excluir este cartão?') && deleteRecord(card.id)} className="hover:text-red-300"><i className="fa-solid fa-trash" /></button>
                </div>
              )}
            </div>

            {/* Limite */}
            <div className="mt-4">
              <div className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Limite</div>
              <div className="text-2xl font-mono">{formatCurrency(card.limit)}</div>
            </div>

            {/* Rodapé: Nome e Datas */}
            <div className="flex justify-between items-end">
              <div className="text-lg font-bold tracking-wide uppercase truncate mr-2">{card.name}</div>
              <div className="text-xs text-right opacity-90 leading-tight shrink-0">
                F: {card.closeDay} <br/>V: {card.dueDay}
              </div>
            </div>
          </div>
        ))}
      </div>

      {visible.length === 0 && <p className="text-[#8fa39a] mt-10">Nenhum cartão cadastrado.</p>}

      {/* Modal Básico Simplificado */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSubmit} className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white">
            <h3 className="text-xl font-bold mb-2">{editingId ? 'Editar' : 'Novo'} Cartão</h3>
            
            <input placeholder="Nome do Cartão (Ex: Nubank)" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            <input type="number" step="0.01" placeholder="Limite Total" value={form.limit} onChange={(e) => setForm({...form, limit: e.target.value})} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            
            <div className="flex gap-4">
              <input type="number" placeholder="Dia Fechamento" value={form.closeDay} onChange={(e) => setForm({...form, closeDay: e.target.value})} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
              <input type="number" placeholder="Dia Vencimento" value={form.dueDay} onChange={(e) => setForm({...form, dueDay: e.target.value})} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
