import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { Account, User } from '../types';

const emptyForm = { name: '', bank: '', balance: '', owner: '' };

export default function Accounts() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User, hasPermission: any, canAccessPerson: any };
  const { data: accounts, loading, saveRecord, deleteRecord } = useCollection<Account>('accounts');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canEdit = hasPermission('accounts', 'edit');
  const visible = session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner));

  function openEdit(acc: Account) { setForm({ name: acc.name, bank: acc.bank || '', balance: String(acc.balance), owner: acc.owner || '' }); setEditingId(acc.id); setShowForm(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({ id: editingId || undefined, name: form.name.trim(), bank: form.bank.trim(), balance: parseFloat(form.balance) || 0, owner, ownerKey: normalize(owner) });
    setShowForm(false);
  }

  if (loading) return <div className="p-10 text-center text-[#8fa39a] animate-pulse">Carregando contas...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 md:pb-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea]">Contas</h2>
        {canEdit && <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform"><i className="fa-solid fa-plus mr-2" />Nova Conta</button>}
      </div>

      {/* Grid Simplificado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((acc) => (
          <div key={acc.id} className="bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#e3b04b]/10 text-[#e3b04b] rounded-2xl flex items-center justify-center text-xl shrink-0"><i className="fa-solid fa-building-columns" /></div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{acc.name}</h3>
                  <span className="text-xs text-[#8fa39a] truncate block">{acc.bank || 'Instituição não informada'}</span>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2 text-[#8fa39a] shrink-0">
                  <button onClick={() => openEdit(acc)} className="hover:text-white p-1"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => confirm('Excluir esta conta?') && deleteRecord(acc.id)} className="hover:text-red-400 p-1"><i className="fa-solid fa-trash" /></button>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-between items-end">
              <strong className="text-2xl font-mono text-[#f2f0ea]">{formatCurrency(acc.balance)}</strong>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8fa39a] px-2 py-1 bg-white/5 rounded-lg truncate max-w-[100px]">{acc.owner || 'Geral'}</span>
            </div>
          </div>
        ))}
      </div>

      {visible.length === 0 && <p className="text-[#8fa39a] mt-10">Nenhuma conta cadastrada.</p>}

      {/* Modal Básico */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSubmit} className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white">
            <h3 className="text-xl font-bold mb-2">{editingId ? 'Editar Conta' : 'Nova Conta'}</h3>
            <input placeholder="Nome (Ex: Conta Corrente)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            <input placeholder="Banco (Opcional)" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            <input type="number" step="0.01" placeholder="Saldo Inicial" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            <input placeholder="Dono da Conta (Opcional)" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            
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
