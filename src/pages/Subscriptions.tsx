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
    setIsSplit(false); setSplitItems({}); setEditingId(null); setShowForm(true);
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

  if (loading) return <PageLoading message="Carregando assinaturas..." />;
  if (error) return <PageError error={error as Error} title="Erro ao carregar assinaturas" />;

  return (
    <div className="animate-in fade-in duration-500 max-w-[1200px] mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Assinaturas e Recorrências</h2>
        {canEdit && (
          <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-4 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_4px_14px_rgba(227,176,75,0.25)]">
            <i className="fa-solid fa-plus text-sm" /> Nova assinatura
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#e3b04b]" />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Gasto Mensal Recorrente</span>
          <strong className="text-3xl font-bold font-mono text-[#f2f0ea]">{formatCurrency(totalMonthly)}</strong>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#34d399]" />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Assinaturas Ativas</span>
          <div className="flex items-baseline gap-2">
            <strong className="text-3xl font-bold font-mono text-[#f2f0ea]">{activeCount}</strong>
            {pausedCount > 0 && <span className="text-[#8fa39a] text-sm">({pausedCount} pausadas)</span>}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f87171]" />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Próxima Cobrança</span>
          <strong className="text-xl font-bold text-[#f2f0ea] mt-1 truncate" title={nextDue}>{nextDue}</strong>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="relative flex-1 min-w-[200px]">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#8fa39a]" />
          <input type="text" placeholder="Buscar por serviço ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
        </div>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="w-full md:w-auto p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none min-w-[180px]">
          <option value="all">Todas as Formas de Pagamento</option>
          <optgroup label="Contas">{accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>Conta: {a.name}</option>))}</optgroup>
          <optgroup label="Cartões">{cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>Cartão: {c.name}</option>))}</optgroup>
        </select>
        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="w-full md:w-auto p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none min-w-[150px]">
          <option value="all">Todas as Pessoas</option>
          {availablePersons.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="fa-rotate" title="Nenhuma assinatura encontrada" description="Cadastre serviços mensais como Netflix, Spotify, planos de saúde ou condomínio." actionLabel={canEdit ? 'Nova assinatura' : undefined} onAction={canEdit ? openNew : undefined} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((s) => {
            const isPaused = s.status === 'pausada';
            return (
              <div key={s.id} className={`group bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 transition-all hover:bg-white/[0.05] hover:-translate-y-1 hover:shadow-xl relative overflow-hidden ${isPaused ? 'opacity-70 grayscale-[0.3]' : ''}`}>
                <div className={`w-1 absolute top-0 bottom-0 left-0 ${isPaused ? 'bg-yellow-500' : 'bg-[#10b981]'}`} />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-lg text-[#8fa39a]">
                      <i className="fa-solid fa-repeat" />
                    </div>
                    <div>
                      <strong className="block text-[#f2f0ea] text-lg leading-tight">{s.name}</strong>
                      <span className={`text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${isPaused ? 'bg-yellow-500/20 text-yellow-500' : 'bg-[#10b981]/20 text-[#10b981]'}`}>
                        {isPaused ? 'Pausada' : 'Ativa'}
                      </span>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleTogglePause(s)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-white flex items-center justify-center" title={isPaused ? 'Reativar' : 'Pausar'}>
                        <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'} text-[0.85rem]`} />
                      </button>
                      <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-[#e3b04b] flex items-center justify-center">
                        <i className="fa-solid fa-pen text-[0.85rem]" />
                      </button>
                      <button onClick={() => setDeleteId(s.id)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-red-400 flex items-center justify-center">
                        <i className="fa-solid fa-trash text-[0.85rem]" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-end gap-1">
                  <strong className="text-2xl font-bold font-mono text-[#f2f0ea]">{formatCurrency(s.amount)}</strong>
                  <span className="text-[0.8rem] text-[#8fa39a] mb-1">/ mês</span>
                </div>

                <div className="bg-black/20 rounded-xl p-3 flex flex-col gap-2 text-[0.8rem]">
                  <div className="flex items-center gap-2 text-[#8fa39a]">
                    <i className="fa-regular fa-calendar w-4 text-center" /> 
                    <span>Cobra todo dia <strong className="text-white">{s.billingDay}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-[#8fa39a]">
                    <i className="fa-solid fa-credit-card w-4 text-center" />
                    <span className="truncate">{getPaymentLabel(s.paymentMethod)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#8fa39a]">
                    <i className="fa-solid fa-user w-4 text-center" />
                    <span className="truncate">{s.person || 'Eu'}</span>
                  </div>
                </div>

                {s.isSplit && s.splitDetails && (
                  <div className="mt-2 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                    {s.splitDetails.map((item: any, idx: number) => (
                      <span key={idx} className="text-[0.7rem] bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-[#f2f0ea] font-medium">
                        {item.person}: <span className="text-[#8fa39a]">{formatCurrency(item.amount)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form className="bg-[#141d1a] border border-white/10 rounded-[20px] p-6 sm:p-8 w-full max-w-[540px] flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-2">{editingId ? 'Editar Assinatura' : 'Nova Assinatura'}</h3>

            <div>
              <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Nome do Serviço</label>
              <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('name')} placeholder="Ex: Netflix, Academia..." />
              {errors.name && <span className="text-red-400 text-xs mt-1 block">{errors.name.message as string}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Valor Mensal</label>
                <input type="number" step="0.01" className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('amount')} placeholder="0.00" />
                {errors.amount && <span className="text-red-400 text-xs mt-1 block">{errors.amount.message as string}</span>}
              </div>
              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Dia de Cobrança</label>
                <input type="number" min="1" max="31" className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('billingDay')} />
                {errors.billingDay && <span className="text-red-400 text-xs mt-1 block">{errors.billingDay.message as string}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Forma de Pagamento</label>
                <select className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('paymentMethod')}>
                  <optgroup label="Contas Correntes">
                    <option value="account">Conta Principal</option>
                    {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>Conta: {a.name}</option>))}
                  </optgroup>
                  {cards.length > 0 && (
                    <optgroup label="Cartões de Crédito">
                      {cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>Cartão: {c.name}</option>))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Categoria</label>
                <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('category')} placeholder="Assinaturas" />
              </div>
            </div>

            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl mt-2">
              <label className="flex items-center gap-3 cursor-pointer text-[#f2f0ea] font-medium">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} className="w-4 h-4 accent-[#e3b04b]" />
                Dividir custo com outras pessoas (Rateio)
              </label>

              {isSplit ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#8fa39a] uppercase font-semibold">Selecione quem divide:</span>
                    <button type="button" onClick={splitEqually} className="text-xs bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[#f2f0ea] transition-colors"><i className="fa-solid fa-calculator mr-1" /> Dividir igual</button>
                  </div>
                  {availablePersons.map((pName) => {
                    const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                    return (
                      <div key={pName} className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-white/5">
                        <label className="flex items-center gap-3 cursor-pointer text-[0.9rem] text-[#f2f0ea]">
                          <input type="checkbox" checked={isChecked} onChange={(e) => handleSplitCheck(pName, e.target.checked)} className="accent-[#e3b04b]" />
                          {pName}
                        </label>
                        <input type="number" step="0.01" disabled={!isChecked} placeholder="0.00" value={splitItems[pName] || ''} onChange={(e) => handleSplitValueChange(pName, e.target.value)} className="w-24 p-1.5 rounded-md bg-white/5 border border-white/10 text-right text-[0.9rem] text-[#f2f0ea] focus:border-[#e3b04b] outline-none disabled:opacity-30" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Pessoa Titular</label>
                  <input className="w-full p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('person')} placeholder={session?.person} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/[0.06]">
              <button type="button" className="px-5 py-2.5 rounded-xl text-[#8fa39a] font-medium hover:text-white transition-colors" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#e3b04b] text-[#1c1206] font-bold transition-all hover:scale-105" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Assinatura'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteId} title="Excluir Assinatura" message="Tem certeza que deseja excluir esta assinatura? Os lançamentos vinculados a ela do mês atual serão removidos." confirmLabel="Excluir" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
