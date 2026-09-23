import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { ConfirmModal } from '../components/ConfirmModal';
import { Account, Person, User } from '../types';

const emptyForm = { name: '', bank: '', balance: '', owner: '' };
const emptyPersonForm = { name: '' };

function displayBalance(acc: Account & { computedBalance?: number }) {
  const initial = Number(acc.balance) || 0;
  const computed = acc.computedBalance !== undefined ? Number(acc.computedBalance) : 0;
  return initial + computed;
}

export default function Accounts() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User; hasPermission: any; canAccessPerson: any };
  const { data: accounts, loading, saveRecord, deleteRecord } = useCollection<Account>('accounts');
  const { data: persons, loading: loadingPersons, saveRecord: savePerson, deleteRecord: deletePerson } = useCollection<Person>('persons');

  const [tab, setTab] = useState<'contas' | 'pessoas'>('contas');

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [personForm, setPersonForm] = useState(emptyPersonForm);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [showPersonForm, setShowPersonForm] = useState(false);

  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deletePersonId, setDeletePersonId] = useState<string | null>(null);

  const canEdit = hasPermission('accounts', 'edit');
  const visible = session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner));

  const personOptions = useMemo(() => (persons || []).map((p) => p.name).filter(Boolean), [persons]);

  function openEdit(acc: Account) { setForm({ name: acc.name, bank: acc.bank || '', balance: String(acc.balance), owner: acc.owner || '' }); setEditingId(acc.id); setShowForm(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({ id: editingId || undefined, name: form.name.trim(), bank: form.bank.trim(), balance: parseFloat(form.balance) || 0, owner, ownerKey: normalize(owner) });
    setShowForm(false);
  }

  function openEditPerson(p: Person) { setPersonForm({ name: p.name }); setEditingPersonId(p.id!); setShowPersonForm(true); }

  async function handlePersonSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = personForm.name.trim();
    if (!name) return;
    await savePerson({ id: editingPersonId || undefined, name, personKey: normalize(name) });
    setShowPersonForm(false);
    setPersonForm(emptyPersonForm);
    setEditingPersonId(null);
  }

  if (loading) return <div className="p-10 text-center text-[#8fa39a] animate-pulse">Carregando contas...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 md:pb-6">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div className="flex gap-2 bg-white/[0.03] p-1 rounded-2xl">
          <button onClick={() => setTab('contas')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'contas' ? 'bg-[#e3b04b] text-black' : 'text-[#8fa39a] hover:text-white'}`}>Contas</button>
          <button onClick={() => setTab('pessoas')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'pessoas' ? 'bg-[#e3b04b] text-black' : 'text-[#8fa39a] hover:text-white'}`}>Pessoas</button>
        </div>
        {canEdit && tab === 'contas' && (
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform"><i className="fa-solid fa-plus mr-2" />Nova Conta</button>
        )}
        {canEdit && tab === 'pessoas' && (
          <button onClick={() => { setPersonForm(emptyPersonForm); setEditingPersonId(null); setShowPersonForm(true); }} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform"><i className="fa-solid fa-plus mr-2" />Nova Pessoa</button>
        )}
      </div>

      {tab === 'contas' && (
        <>
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
                      <button onClick={() => setDeleteAccountId(acc.id)} className="hover:text-red-400 p-1"><i className="fa-solid fa-trash" /></button>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-between items-end">
                  <strong className="text-2xl font-mono text-[#f2f0ea]">{formatCurrency(displayBalance(acc))}</strong>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#8fa39a] px-2 py-1 bg-white/5 rounded-lg truncate max-w-[100px]">{acc.owner || 'Geral'}</span>
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && <p className="text-[#8fa39a] mt-10">Nenhuma conta cadastrada.</p>}
        </>
      )}

      {tab === 'pessoas' && (
        <>
          {loadingPersons ? (
            <p className="text-[#8fa39a] animate-pulse">Carregando pessoas...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(persons || []).map((p) => (
                <div key={p.id} className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-[#e3b04b]/10 text-[#e3b04b] rounded-full flex items-center justify-center font-bold shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-white truncate">{p.name}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 text-[#8fa39a] shrink-0">
                      <button onClick={() => openEditPerson(p)} className="hover:text-white p-1"><i className="fa-solid fa-pen" /></button>
                      <button onClick={() => setDeletePersonId(p.id!)} className="hover:text-red-400 p-1"><i className="fa-solid fa-trash" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!loadingPersons && (persons || []).length === 0 && (
            <p className="text-[#8fa39a] mt-10">Nenhuma pessoa cadastrada ainda. As telas de Transações e Assinaturas usam essa lista pra dividir gastos entre pessoas da família.</p>
          )}
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSubmit} className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white">
            <h3 className="text-xl font-bold mb-2">{editingId ? 'Editar Conta' : 'Nova Conta'}</h3>
            <input placeholder="Nome (Ex: Conta Corrente)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            <input placeholder="Banco (Opcional)" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            <input type="number" step="0.01" placeholder="Saldo Inicial" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b] text-white">
              <option value="">Geral (sem dono específico)</option>
              {personOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {personOptions.length === 0 && (
              <p className="text-xs text-[#8fa39a] -mt-2">Nenhuma pessoa cadastrada ainda. Cadastre na aba "Pessoas" pra poder escolher aqui.</p>
            )}

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {showPersonForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handlePersonSubmit} className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white">
            <h3 className="text-xl font-bold mb-2">{editingPersonId ? 'Editar Pessoa' : 'Nova Pessoa'}</h3>
            <input placeholder="Nome (Ex: Eduardo)" value={personForm.name} onChange={(e) => setPersonForm({ name: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required autoFocus />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setShowPersonForm(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors">Salvar</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteAccountId}
        title="Excluir conta"
        message="Tem certeza que deseja excluir esta conta?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deleteAccountId) deleteRecord(deleteAccountId); setDeleteAccountId(null); }}
        onCancel={() => setDeleteAccountId(null)}
      />
      <ConfirmModal
        isOpen={!!deletePersonId}
        title="Excluir pessoa"
        message="Contas/transações já lançadas continuam com o nome como estava. Deseja excluir mesmo assim?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deletePersonId) deletePerson(deletePersonId); setDeletePersonId(null); }}
        onCancel={() => setDeletePersonId(null)}
      />
    </div>
  );
}
