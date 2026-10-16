import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, maskCurrency, normalize } from '../utils/format';
import { ConfirmModal } from '../components/ConfirmModal';
import { useUIStore } from '../stores/useUIStore';
import { CustomSelect } from '../components/CustomSelect';
import { MoneyField, Tooltip } from '../components/ui';
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
  const { privacyMode, togglePrivacyMode } = useUIStore();

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

  const totalBalance = useMemo(() => {
    return visible.reduce((sum, acc) => sum + displayBalance(acc), 0);
  }, [visible]);

  const personOptions = useMemo(() => (persons || []).map((p) => p.name).filter(Boolean), [persons]);

  function openNewAccount() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(acc: Account) {
    setForm({ name: acc.name, bank: acc.bank || '', balance: String(acc.balance), owner: acc.owner || '' });
    setEditingId(acc.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({ id: editingId || undefined, name: form.name.trim(), bank: form.bank.trim(), balance: parseFloat(form.balance) || 0, owner, ownerKey: normalize(owner) });
    setShowForm(false);
  }

  function openNewPerson() {
    setPersonForm(emptyPersonForm);
    setEditingPersonId(null);
    setShowPersonForm(true);
  }

  function openEditPerson(p: Person) {
    setPersonForm({ name: p.name });
    setEditingPersonId(p.id!);
    setShowPersonForm(true);
  }

  async function handlePersonSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = personForm.name.trim();
    if (!name) return;
    await savePerson({ id: editingPersonId || undefined, name, personKey: normalize(name) });
    setShowPersonForm(false);
    setPersonForm(emptyPersonForm);
    setEditingPersonId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-pri border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-4 sm:pt-6 animate-in fade-in duration-500">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink">Contas</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <Tooltip content={privacyMode ? 'Mostrar saldos' : 'Esconder saldos'}>
            <button
              onClick={togglePrivacyMode}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={privacyMode ? 'Mostrar saldos' : 'Esconder saldos'}
              className="w-10 h-10 rounded-full border border-border bg-card text-muted hover:text-ink flex items-center justify-center transition-colors shadow-xs"
            >
              <i className={`fa-solid ${privacyMode ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
            </button>
          </Tooltip>

          {canEdit && (
            <button
              onClick={openNewAccount}
              className="px-4 py-2.5 rounded-full bg-pri text-white font-medium text-sm shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
            >
              <i className="fa-solid fa-plus text-xs" /> Nova conta
            </button>
          )}
        </div>
      </div>

      {/* ABAS EM CÁPSULA */}
      <div className="flex items-center bg-card border border-border p-1 rounded-full w-fit mb-6">
        <button
          onClick={() => setTab('contas')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            tab === 'contas'
              ? 'bg-pri text-white shadow-xs'
              : 'text-muted hover:text-ink'
          }`}
        >
          Contas
        </button>
        <button
          onClick={() => setTab('pessoas')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            tab === 'pessoas'
              ? 'bg-pri text-white shadow-xs'
              : 'text-muted hover:text-ink'
          }`}
        >
          Pessoas
        </button>
      </div>

      {/* SEÇÃO CONTAS */}
      {tab === 'contas' && (
        <>
          {/* CARTÃO VERDE HERO COM TOTAL */}
          <div className="bg-pri text-white rounded-3xl p-6 sm:p-8 mb-8 shadow-sm flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs sm:text-sm text-white/80 font-medium block mb-1">Total em contas</span>
              <strong className="text-3xl sm:text-5xl font-bold font-heading tracking-tight block">
                {privacyMode ? '••••••' : formatCurrency(totalBalance)}
              </strong>
            </div>
            <span className="text-xs sm:text-sm text-white/80 font-medium">
              {visible.length} {visible.length === 1 ? 'conta ativa' : 'contas ativas'}
            </span>
          </div>

          {/* GRID DE CARTÕES DE CONTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12">
            {visible.map((acc) => {
              const initial = acc.name?.trim().charAt(0).toUpperCase() || 'C';
              return (
                <div
                  key={acc.id}
                  className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between hover:border-pri/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-priSoft text-pri font-bold font-heading flex items-center justify-center text-lg shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink text-base truncate">{acc.name}</h3>
                        <span className="text-xs text-muted truncate block">{acc.bank || 'Instituição não informada'}</span>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0 text-muted">
                        <button
                          onClick={() => openEdit(acc)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Editar conta"
                          className="w-8 h-8 rounded-lg hover:text-ink hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-pen text-xs" />
                        </button>
                        <button
                          onClick={() => setDeleteAccountId(acc.id)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Excluir conta"
                          className="w-8 h-8 rounded-lg hover:text-spendText hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-2 border-t border-border/40">
                    <strong className="text-xl sm:text-2xl font-bold font-heading text-ink">
                      {maskCurrency(displayBalance(acc), privacyMode)}
                    </strong>
                    <span className="text-xs font-medium text-muted bg-border/40 px-2.5 py-0.5 rounded-full truncate max-w-[120px]">
                      {acc.owner || 'Geral'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {visible.length === 0 && (
            <p className="text-muted text-sm mb-12">Nenhuma conta cadastrada.</p>
          )}

          {/* SEÇÃO PESSOAS LOGO ABAIXO DAS CONTAS (CONFORME 1-Contas.png) */}
          <div className="border-t border-border/60 pt-8 mt-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <h2 className="text-xl font-bold font-heading text-ink">Pessoas</h2>
                <p className="text-xs sm:text-sm text-muted">Usadas para dividir gastos em Transações e Fixas.</p>
              </div>
              {canEdit && (
                <button
                  onClick={openNewPerson}
                  className="px-3.5 py-1.5 rounded-full border border-border text-ink hover:bg-border/20 text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <i className="fa-solid fa-plus text-[10px]" /> Nova pessoa
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {(persons || []).map((p) => {
                const initial = p.name?.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <div
                    key={p.id}
                    className="bg-card border border-border p-4 rounded-2xl flex items-center justify-between shadow-xs hover:border-pri/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-priSoft text-pri font-bold font-heading flex items-center justify-center text-sm shrink-0">
                        {initial}
                      </div>
                      <span className="font-semibold text-ink text-sm sm:text-base truncate">{p.name}</span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 text-muted shrink-0">
                        <button
                          onClick={() => openEditPerson(p)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Editar pessoa"
                          className="w-8 h-8 rounded-lg hover:text-ink hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-pen text-xs" />
                        </button>
                        <button
                          onClick={() => setDeletePersonId(p.id!)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Excluir pessoa"
                          className="w-8 h-8 rounded-lg hover:text-spendText hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(persons || []).length === 0 && (
              <p className="text-muted text-xs mt-3">Nenhuma pessoa cadastrada ainda.</p>
            )}
          </div>
        </>
      )}

      {/* SEÇÃO PESSOAS EXCLUSIVA QUANDO NA ABA PESSOAS */}
      {tab === 'pessoas' && (
        <div className="animate-in fade-in">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="text-xl font-bold font-heading text-ink">Pessoas</h2>
              <p className="text-xs sm:text-sm text-muted">Usadas para dividir gastos em Transações e Fixas.</p>
            </div>
            {canEdit && (
              <button
                onClick={openNewPerson}
                className="px-4 py-2 rounded-full bg-pri text-white font-medium text-sm shadow-sm hover:opacity-95 transition-all flex items-center gap-1.5 shrink-0"
              >
                <i className="fa-solid fa-plus text-xs" /> Nova pessoa
              </button>
            )}
          </div>

          {loadingPersons ? (
            <p className="text-muted text-sm animate-pulse mt-4">Carregando pessoas...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {(persons || []).map((p) => {
                const initial = p.name?.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <div
                    key={p.id}
                    className="bg-card border border-border p-4 sm:p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-pri/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-priSoft text-pri font-bold font-heading flex items-center justify-center text-sm shrink-0">
                        {initial}
                      </div>
                      <span className="font-semibold text-ink text-base truncate">{p.name}</span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 text-muted shrink-0">
                        <button
                          onClick={() => openEditPerson(p)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Editar pessoa"
                          className="w-8 h-8 rounded-lg hover:text-ink hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-pen text-xs" />
                        </button>
                        <button
                          onClick={() => setDeletePersonId(p.id!)}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-label="Excluir pessoa"
                          className="w-8 h-8 rounded-lg hover:text-spendText hover:bg-border/30 flex items-center justify-center transition-colors"
                        >
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loadingPersons && (persons || []).length === 0 && (
            <p className="text-muted text-sm mt-8">Nenhuma pessoa cadastrada ainda. As telas de Transações e Fixas usam essa lista para dividir gastos entre pessoas da família.</p>
          )}
        </div>
      )}

      {/* DIALOG DE CONTA (RADIX UI) */}
      <Dialog.Root open={showForm} onOpenChange={setShowForm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border p-6 rounded-3xl text-ink shadow-2xl z-50 animate-in zoom-in-95">
            <Dialog.Title className="text-xl font-bold font-heading mb-4 text-ink">
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </Dialog.Title>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Nome da conta</label>
                <input
                  placeholder="Ex: Conta Corrente"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="p-3 bg-card border border-border rounded-xl text-ink outline-none focus:border-pri transition-colors text-sm"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Instituição / Banco</label>
                <input
                  placeholder="Ex: Nubank, Itaú (opcional)"
                  value={form.bank}
                  onChange={(e) => setForm({ ...form, bank: e.target.value })}
                  className="p-3 bg-card border border-border rounded-xl text-ink outline-none focus:border-pri transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Saldo Inicial</label>
                <MoneyField
                  placeholder="R$ 0,00"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Dono da conta</label>
                <CustomSelect value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                  <option value="">Geral (sem dono específico)</option>
                  {personOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </CustomSelect>
              </div>
              {personOptions.length === 0 && (
                <p className="text-xs text-muted -mt-1">Nenhuma pessoa cadastrada ainda. Cadastre na seção "Pessoas" para poder escolher aqui.</p>
              )}

              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-border hover:bg-border/20 py-2.5 rounded-full font-semibold text-sm transition-colors text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-pri text-white font-semibold py-2.5 rounded-full hover:opacity-95 transition-opacity text-sm shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* DIALOG DE PESSOA (RADIX UI) */}
      <Dialog.Root open={showPersonForm} onOpenChange={setShowPersonForm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border p-6 rounded-3xl text-ink shadow-2xl z-50 animate-in zoom-in-95">
            <Dialog.Title className="text-xl font-bold font-heading mb-4 text-ink">
              {editingPersonId ? 'Editar Pessoa' : 'Nova Pessoa'}
            </Dialog.Title>
            <form onSubmit={handlePersonSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Nome</label>
                <input
                  placeholder="Ex: Eduardo"
                  value={personForm.name}
                  onChange={(e) => setPersonForm({ name: e.target.value })}
                  className="p-3 bg-card border border-border rounded-xl text-ink outline-none focus:border-pri transition-colors text-sm"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowPersonForm(false)}
                  className="flex-1 border border-border hover:bg-border/20 py-2.5 rounded-full font-semibold text-sm transition-colors text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-pri text-white font-semibold py-2.5 rounded-full hover:opacity-95 transition-opacity text-sm shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* MODAIS DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <ConfirmModal
        isOpen={!!deleteAccountId}
        title={'Excluir conta'}
        message="Tem certeza que deseja excluir esta conta?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deleteAccountId) deleteRecord(deleteAccountId); setDeleteAccountId(null); }}
        onCancel={() => setDeleteAccountId(null)}
      />
      <ConfirmModal
        isOpen={!!deletePersonId}
        title={'Excluir pessoa'}
        message="Contas e transações já lançadas continuam com o nome como estava. Deseja excluir mesmo assim?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deletePersonId) deletePerson(deletePersonId); setDeletePersonId(null); }}
        onCancel={() => setDeletePersonId(null)}
      />
    </div>
  );
}
