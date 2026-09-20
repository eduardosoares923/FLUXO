import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { User } from '../types';

// Definimos o formato exato que a tela de Contas espera
interface AccountData {
  id?: string;
  name: string;
  bank: string;
  balance: number | string;
  owner: string;
  ownerKey?: string;
}

const emptyForm: AccountData = { name: '', bank: '', balance: '', owner: '' };

export default function Accounts() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { 
    session: User; 
    hasPermission: (mod: string, act?: string) => boolean;
    canAccessPerson: (p?: string) => boolean;
  };
  const { data: accounts, loading, saveRecord, deleteRecord } = useCollection<AccountData>('accounts');
  
  const [form, setForm] = useState<AccountData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('accounts', 'edit');
  const visible = session?.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner));

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(acc: AccountData) {
    setForm({ name: acc.name || '', bank: acc.bank || '', balance: acc.balance ?? '', owner: acc.owner || '' });
    setEditingId(acc.id || null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    const owner = form.owner?.trim() || session?.person || '';
    
    await saveRecord({
      id: editingId || undefined,
      name: form.name.trim(),
      bank: form.bank?.trim() || '',
      balance: typeof form.balance === 'string' ? parseFloat(form.balance) || 0 : form.balance || 0,
      owner,
      ownerKey: normalize(owner),
    });
    setShowForm(false);
  }

  async function handleDelete(id?: string) {
    if (!id || !confirm('Excluir esta conta?')) return;
    await deleteRecord(id);
  }

  if (loading) return <div className="flex items-center justify-center h-[60vh] text-[#8fa39a] animate-pulse">Carregando contas...</div>;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Contas Bancárias</h2>
        {canEdit && (
          <button 
            className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-4 py-2.5 rounded-xl font-bold transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(227,176,75,0.4)]"
            onClick={openNew}
          >
            <i className="fa-solid fa-plus text-sm" /> Nova Conta
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {visible.map((acc) => (
          <div 
            key={acc.id} 
            className="group bg-white/[0.035] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.6)] hover:border-white/[0.15] relative overflow-hidden"
          >
            {/* Brilho de fundo no hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-3">
                <span className="w-[38px] h-[38px] rounded-[10px] bg-[#4d8dff]/15 text-[#4d8dff] flex items-center justify-center text-[1.1rem]">
                  <i className="fa-solid fa-building-columns" />
                </span>
                <strong className="text-[#f2f0ea] text-lg truncate max-w-[140px] leading-tight">{acc.name}</strong>
              </div>
              
              {canEdit && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(acc)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-[#e3b04b] transition-colors flex items-center justify-center" title="Editar">
                    <i className="fa-solid fa-pen text-[0.8rem]" />
                  </button>
                  <button onClick={() => handleDelete(acc.id)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-red-400 transition-colors flex items-center justify-center" title="Excluir">
                    <i className="fa-solid fa-trash text-[0.8rem]" />
                  </button>
                </div>
              )}
            </div>
            
            <div className="mt-3 relative z-10">
              <span className="block text-[0.75rem] text-[#8fa39a] mb-0.5 tracking-wide uppercase font-semibold">Saldo Atual</span>
              <span className="text-[1.7rem] font-bold font-mono tracking-tight text-[#f2f0ea]">
                {formatCurrency(acc.balance)}
              </span>
            </div>
            
            <div className="flex items-center justify-between mt-1 text-[0.8rem] text-[#8fa39a] relative z-10">
              <span>{acc.bank || 'Sem instituição'}</span>
              {acc.owner && <span className="bg-white/[0.06] px-2.5 py-1 rounded-md text-[0.75rem] font-medium">{acc.owner}</span>}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full text-center text-[#8fa39a] py-16 bg-white/[0.02] rounded-2xl border border-white/5 border-dashed">
            Nenhuma conta cadastrada ainda.
          </p>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO/EDIÇÃO EM TAILWIND PURE */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form 
            className="bg-[#141d1a] border border-white/10 rounded-[20px] p-6 sm:p-8 w-full max-w-[540px] flex flex-col gap-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()} 
            onSubmit={handleSubmit}
          >
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-1">{editingId ? 'Editar Conta' : 'Nova Conta Bancária'}</h3>
            
            {/* O famoso Grid Inteligente, agora nativo via Tailwind */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Nome da Conta</label>
                <input 
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus placeholder="Ex: Conta Corrente Nubank"
                />
              </div>
              
              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Instituição / Banco</label>
                <input 
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20"
                  value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="Ex: Nubank"
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase tracking-wide">Saldo Inicial (R$)</label>
                <input
                  type="number" step="0.01"
                  className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] transition-all hover:bg-white/[0.04] focus:outline-none focus:border-[#e3b04b] focus:ring-2 focus:ring-[#e3b04b]/20 font-mono text-lg"
                  value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })}
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
                Salvar Conta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
