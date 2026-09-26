import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, getCardInvoiceMonth, toPersonKeys } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

export default function Subscriptions() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User; hasPermission: (r: string, a: string) => boolean; canAccessPerson: (p?: string | null) => boolean };
  const { data: subs, loading, error, saveRecord, deleteRecord } = useCollection<any>('subscriptions');
  const { data: transactions, saveRecord: saveTx, deleteRecord: deleteTx } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<any>('cards');
  const { data: personsList } = useCollection<{ name?: string }>('persons');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');

  const [isSplit, setIsSplit] = useState(false);
  const [splitItems, setSplitItems] = useState<Record<string, string>>({});

  const canEdit = hasPermission('subscriptions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: '', amount: '', billingDay: 10, category: 'Assinaturas', paymentMethod: 'account', person: '' },
  });

  const watchedAmount = watch('amount');
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);

  async function syncSubscriptionWithTransaction(sub: any, isCancel = false) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = String(sub.billingDay || 10).padStart(2, '0');
    const txDate = `${currentYear}-${currentMonth}-${dayStr}`;

    const existingTx = transactions.find((t) => t.subscriptionId === sub.id && t.date?.startsWith(`${currentYear}-${currentMonth}`));

    if (isCancel || sub.status === 'pausada') {
      if (existingTx) await deleteTx(existingTx.id!);
      return;
    }

    const txRecord: Partial<Transaction> = {
      id: existingTx?.id,
      subscriptionId: sub.id,
      description: `${sub.name} (Assinatura)`,
      amount: Number(sub.amount),
      type: 'expense',
      category: sub.category || 'Assinaturas',
      date: txDate,
      paymentMethod: sub.paymentMethod,
      person: sub.person || session?.person,
      userId: session?.id,
      isSubscription: true,
    };

    if (sub.paymentMethod.startsWith('card_')) {
      const cardId = sub.paymentMethod.replace('card_', '');
      const card = cards.find((c) => String(c.id) === cardId);
      if (card) txRecord.invoiceMonth = getCardInvoiceMonth(txDate, card.closeDay);
    }

    await saveTx(txRecord as Transaction);
  }

  async function handleLaunchMonth() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const activeSubs = visible.filter((s) => s.status !== 'pausada');
    if (activeSubs.length === 0) return toast.info('Nenhuma assinatura ativa pra lançar.');
    let created = 0; let alreadyLaunched = 0;
    for (const s of activeSubs) {
      const already = transactions.some((t) => t.subscriptionId === s.id && t.date?.startsWith(`${currentYear}-${currentMonth}`));
      await syncSubscriptionWithTransaction(s);
      if (already) alreadyLaunched++; else created++;
    }
    if (created === 0) toast.info(`Todas as ${alreadyLaunched} assinatura(s) já estavam lançadas este mês.`);
    else toast.success(`${created} assinatura(s) lançada(s) este mês!${alreadyLaunched > 0 ? ` (${alreadyLaunched} já estavam, sem duplicar)` : ''}`);
  }

  const visible = useMemo(() => {
    return subs
      .filter((s) => session?.role === 'admin' || canAccessPerson(s.person))
      .filter((s) => {
        const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase());
        const matchPayment = paymentFilter === 'all' || s.paymentMethod === paymentFilter;
        const matchPerson = personFilter === 'all' || (s.isSplit && s.splitDetails?.some((d: any) => d.person === personFilter)) || s.person?.toLowerCase().includes(personFilter.toLowerCase());
        return matchSearch && matchPayment && matchPerson;
      });
  }, [subs, session, canAccessPerson, search, paymentFilter, personFilter]);

  const { totalMonthly, activeCount, pausedCount, nextDue } = useMemo(() => {
    let sum = 0; let active = 0; let paused = 0;
    const todayDay = new Date().getDate();
    let minDaysDiff = Infinity; let nextSub: any = null;

    visible.forEach((s) => {
      const amt = Number(s.amount) || 0;
      if (s.status !== 'pausada') {
        sum += amt; active++;
        const bDay = Number(s.billingDay) || 10;
        let diff = bDay - todayDay;
        if (diff < 0) diff += 30;
        if (diff < minDaysDiff) { minDaysDiff = diff; nextSub = s; }
      } else {
        paused++;
      }
    });
    return { totalMonthly: sum, activeCount: active, pausedCount: paused, nextDue: nextSub ? `Dia ${nextSub.billingDay} (${nextSub.name})` : 'Nenhuma' };
  }, [visible]);

  function openNew() {
    reset({ name: '', amount: '', billingDay: 10, category: 'Assinaturas', paymentMethod: 'account', person: session?.person || '' });
    setIsSplit(false); setSplitItems({}); setOriginalAmount(null); setEditingId(null); setShowForm(true);
  }

  function openEdit(s: any) {
    reset({ name: s.name || '', amount: s.amount ?? '', billingDay: s.billingDay ?? 10, category: s.category || 'Assinaturas', paymentMethod: s.paymentMethod || 'account', person: s.person || session?.person || '' });
    setIsSplit(Boolean(s.isSplit));
    if (s.isSplit && Array.isArray(s.splitDetails)) {
      const map: Record<string, string> = {};
      s.splitDetails.forEach((d) => { map[d.person] = d.amount; });
      setSplitItems(map);
    } else {
      setSplitItems({});
    }
    setOriginalAmount(Number(s.amount) || null);
    setEditingId(s.id); setShowForm(true);
  }

  function handleSplitCheck(personName: string, checked: boolean) {
    setSplitItems((prev) => {
      const copy = { ...prev };
      if (checked) copy[personName] = copy[personName] || '';
      else delete copy[personName];
      return copy;
    });
  }

  function handleSplitValueChange(personName: string, val: string) {
    setSplitItems((prev) => ({
      ...prev,
      [personName]: val,
    }));
  }

  function splitEqually() {
    const total = parseFloat(watchedAmount as string) || 0;
    const keys = Object.keys(splitItems);
    if (keys.length === 0) return toast.warning('Selecione pelo menos uma pessoa para dividir.');
    const share = Math.floor((total / keys.length) * 100) / 100;
    const remainder = Math.round((total - share * keys.length) * 100) / 100;
    const updated: Record<string, string> = {};
    keys.forEach((k, idx) => { updated[k] = idx === 0 ? (share + remainder).toFixed(2) : share.toFixed(2); });
    setSplitItems(updated);
  }

  async function onSubmit(data: any) {
    try {
      let finalPerson = data.person?.trim() || session?.person;
      let finalSplitDetails = null;

      if (isSplit) {
        const keys = Object.keys(splitItems);
        if (keys.length === 0) return toast.warning('Selecione pelo menos uma pessoa na divisão.');
        let sum = 0; const details = [];
        for (const k of keys) {
          const val = parseFloat(splitItems[k]) || 0;
          if (val <= 0) return toast.warning(`Informe o valor da cota de ${k}.`);
          sum += val; details.push({ person: k, amount: val });
        }
        const totalAmt = Number(data.amount) || 0;
        if (Math.abs(sum - totalAmt) > 0.05) return toast.error(`A soma das cotas (${formatCurrency(sum)}) deve ser igual ao valor total (${formatCurrency(totalAmt)}).`);
        finalPerson = details.map((d) => d.person).join(', ');
        finalSplitDetails = details;
      }

      const existing = editingId ? subs.find((s) => s.id === editingId) : null;
      const status = existing ? existing.status || 'ativa' : 'ativa';

      const record = {
        id: editingId || undefined, name: data.name.trim(), amount: Number(data.amount), billingDay: Number(data.billingDay),
        category: data.category?.trim() || 'Assinaturas', paymentMethod: data.paymentMethod, person: finalPerson,
        personKeys: toPersonKeys(finalPerson), status, isSplit, splitDetails: finalSplitDetails, updatedAt: new Date().toISOString(),
      };

      const saved = await saveRecord(record);
      await syncSubscriptionWithTransaction(saved);
      toast.success(editingId ? 'Assinatura atualizada!' : 'Assinatura cadastrada!');
      setShowForm(false);
    } catch (err) { toast.error('Erro ao salvar assinatura.'); }
  }

  async function handleTogglePause(s: any) {
    const nextStatus = s.status === 'pausada' ? 'ativa' : 'pausada';
    try {
      const updated = { ...s, status: nextStatus };
      await saveRecord(updated);
      await syncSubscriptionWithTransaction(updated);
      toast.info(nextStatus === 'ativa' ? 'Assinatura reativada!' : 'Assinatura pausada.');
    } catch (err) { toast.error('Erro ao alterar status.'); }
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;
    try {
      const subToDelete = subs.find((s) => s.id === deleteId);
      if (subToDelete) await syncSubscriptionWithTransaction(subToDelete, true);
      await deleteRecord(deleteId);
      toast.success('Assinatura excluída com sucesso!');
    } catch (err) { toast.error('Erro ao excluir assinatura.'); } 
    finally { setDeleteId(null); }
  }

  function getPaymentLabel(pm: string) {
    if (pm === 'account') return 'Conta principal';
    if (pm.startsWith('acc_')) { const a = accounts.find((acc) => `acc_${acc.id}` === pm); return a ? `Conta: ${a.name}` : 'Conta'; }
    if (pm.startsWith('card_')) { const c = cards.find((card) => `card_${card.id}` === pm); return c ? `Cartão: ${c.name}` : 'Cartão'; }
    return pm;
  }

    if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="w-10 h-10 border-4 border-[#e3b04b] border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <PageError error={error as Error} title="Erro ao carregar assinaturas" />;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 md:pb-6 animate-in fade-in">
      
      {/* CABEÇALHO */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea]">Assinaturas</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={handleLaunchMonth} className="bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2" title="Lançar todas as assinaturas ativas do mês de uma vez">
              <i className="fa-solid fa-bolt" /> <span className="hidden sm:inline">Lançar mês</span>
            </button>
            <button onClick={openNew} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2">
              <i className="fa-solid fa-plus" /> <span className="hidden sm:inline">Nova Assinatura</span>
            </button>
          </div>
        )}
      </div>

      {/* KPIs SUPER ENXUTOS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[#8fa39a] text-xs font-bold uppercase tracking-widest mb-1">Custo Mensal Fixado</span>
          <strong className="text-2xl font-mono text-[#e3b04b]">{formatCurrency(totalMonthly)}</strong>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[#8fa39a] text-xs font-bold uppercase tracking-widest mb-1">Status Ativas</span>
          <strong className="text-2xl text-white">{activeCount} <span className="text-sm text-[#8fa39a] font-normal">/ {pausedCount} pausadas</span></strong>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[#8fa39a] text-xs font-bold uppercase tracking-widest mb-1">Próxima Cobrança</span>
          <strong className="text-lg text-white truncate">{nextDue}</strong>
        </div>
      </div>

      {/* FILTROS RESPONSIVOS */}
      <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-2xl shadow-lg flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#8fa39a]" />
          <input type="text" placeholder="Buscar assinatura..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/20 text-white focus:border-[#e3b04b] outline-none" />
        </div>
        <div className="flex gap-3">
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="flex-1 w-full md:w-[150px] px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-white focus:border-[#e3b04b] outline-none">
            <option value="all">Cobrança</option><option value="account">Contas</option><option value="card">Cartões</option>
          </select>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="flex-1 w-full md:w-[150px] px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-white focus:border-[#e3b04b] outline-none">
            <option value="all">Pessoas</option>{availablePersons.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
      </div>

      {/* GRID DE CARTÕES DE ASSINATURA */}
      {visible.length === 0 ? (
        <EmptyState icon="fa-rotate" title="Nenhuma assinatura" description="Cadastre seus pagamentos recorrentes (Spotify, Netflix, Conta de Luz)." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {visible.map((s) => (
            <div key={s.id} className={`p-5 rounded-3xl border transition-all ${s.status === 'pausada' ? 'bg-white/[0.01] border-white/5 opacity-60 grayscale' : 'bg-white/[0.03] border-white/[0.08] hover:-translate-y-1 shadow-lg'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${s.status === 'pausada' ? 'bg-white/10 text-[#8fa39a]' : 'bg-[#e3b04b]/15 text-[#e3b04b]'}`}>
                  <i className="fa-solid fa-rotate" />
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 bg-black/20 p-1.5 rounded-xl border border-white/5">
                    <button onClick={() => handleTogglePause(s)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-white flex items-center justify-center" title={s.status === 'pausada' ? 'Reativar' : 'Pausar'}><i className={`fa-solid ${s.status === 'pausada' ? 'fa-play' : 'fa-pause'}`} /></button>
                    <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-[#3b82f6]/20 hover:text-[#3b82f6] flex items-center justify-center"><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => setDeleteId(s.id)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center"><i className="fa-solid fa-trash" /></button>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-bold text-white truncate">{s.name}</h3>
              <div className="text-xs text-[#8fa39a] mb-5 font-medium flex items-center gap-1.5"><i className="fa-regular fa-calendar" /> Vence dia {s.billingDay}</div>
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <strong className={`text-2xl font-mono ${s.status === 'pausada' ? 'text-[#8fa39a]' : 'text-white'}`}>{formatCurrency(s.amount)}</strong>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8fa39a] px-2 py-1 bg-white/5 rounded-lg text-right leading-tight whitespace-normal max-w-[140px]">{s.person}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE FORMULÁRIO BÁSICO */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <form className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-md flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3 className="text-xl font-bold mb-2">{editingId ? 'Editar Assinatura' : 'Nova Assinatura'}</h3>
            
            <input placeholder="Nome (Ex: Netflix, Luz)" {...register('name')} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            {(errors.name as any) && <span className="text-red-400 text-xs mt-[-10px]">{(errors.name as any).message}</span>}
            
            <div className="flex gap-4">
              <input type="number" step="0.01" placeholder="Valor Mensal" {...register('amount')} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
              <input type="number" min="1" max="31" placeholder="Dia do Vencimento" {...register('billingDay')} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" />
            </div>
            {originalAmount !== null && (() => {
              const novo = parseFloat(watchedAmount as string) || 0;
              const diff = novo - originalAmount;
              if (Math.abs(diff) < 0.01) return null;
              const pct = originalAmount > 0 ? (diff / originalAmount) * 100 : 0;
              return (
                <p className={`text-xs -mt-2 font-bold ${diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  <i className={`fa-solid ${diff > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} mr-1`} />
                  {diff > 0 ? 'Subiu' : 'Baixou'} {formatCurrency(Math.abs(diff))} ({Math.abs(pct).toFixed(0)}%) desde o valor anterior ({formatCurrency(originalAmount)})
                </p>
              );
            })()}

            <select {...register('paymentMethod')} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]">
              <option value="account">Conta Padrão</option>
              <optgroup label="Contas">{accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}</optgroup>
              <optgroup label="Cartões">{cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>{c.name}</option>))}</optgroup>
            </select>

            {/* SEÇÃO RATEIO ENXUTA */}
            <div className="mt-2 p-4 bg-white/5 rounded-2xl">
              <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-white">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} className="accent-[#e3b04b] w-4 h-4" /> Dividir com outras pessoas
              </label>
              {isSplit ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#8fa39a]">Participantes:</span>
                    <button type="button" onClick={splitEqually} className="text-xs font-bold text-[#e3b04b] bg-[#e3b04b]/10 px-2 py-1 rounded"><i className="fa-solid fa-calculator" /> Dividir igual</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {availablePersons.map((pName) => {
                      const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                      return (
                        <div key={pName} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                          <label className="flex items-center gap-3 text-sm text-white cursor-pointer">
                            <input type="checkbox" checked={isChecked} onChange={(e) => handleSplitCheck(pName, e.target.checked)} className="accent-[#e3b04b]" /> {pName}
                          </label>
                          <input type="number" step="0.01" disabled={!isChecked} value={splitItems[pName] || ''} onChange={(e) => handleSplitValueChange(pName, e.target.value)} className="w-24 p-1.5 rounded-md bg-black/30 border border-white/10 text-right text-sm disabled:opacity-30 outline-none focus:border-[#e3b04b]" placeholder="0.00" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <input {...register('person')} placeholder={`Pessoa (padrão: ${session.person})`} className="w-full p-2.5 rounded-xl border border-white/10 bg-black/30 text-white focus:border-[#e3b04b] outline-none" />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors disabled:opacity-50">
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMAÇÃO DE EXCLUSÃO BÁSICA */}
      <ConfirmModal isOpen={!!deleteId} title="Excluir Assinatura" message="Tem certeza que deseja excluir esta assinatura? (Não afeta cobranças já geradas)" confirmLabel="Excluir" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

