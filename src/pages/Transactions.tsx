import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth, toPersonKeys, generateId } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

const CATEGORY_ICONS: Record<string, string> = {
  alimentação: 'fa-utensils', mercado: 'fa-cart-shopping', moradia: 'fa-house', transporte: 'fa-car',
  saúde: 'fa-heart-pulse', educação: 'fa-graduation-cap', lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar', investimentos: 'fa-chart-line', assinaturas: 'fa-rotate', 'roupas e acessórios': 'fa-shirt',
};

function iconForCategory(category?: string, type?: string) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

function addMonthsClamped(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const finalDate = new Date(target.getFullYear(), target.getMonth(), day);
  return `${finalDate.getFullYear()}-${String(finalDate.getMonth() + 1).padStart(2, '0')}-${String(finalDate.getDate()).padStart(2, '0')}`;
}

export default function Transactions() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User; hasPermission: (r: string, a: string) => boolean; canAccessPerson: (p?: string | null, tx?: any) => boolean };
  const { data: transactions, loading, error, saveRecord, deleteRecord, deleteRecords } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<any>('cards');
  const { data: personsList } = useCollection<{ name?: string }>('persons');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [groupDeleteTx, setGroupDeleteTx] = useState<any>(null);
  const [detailsTx, setDetailsTx] = useState<any>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [paymentMode, setPaymentMode] = useState('single');
  const [installmentsCount, setInstallmentsCount] = useState(2);
  const [installmentValueType, setInstallmentValueType] = useState('total');
  const [updateFuture, setUpdateFuture] = useState(false);

  const [isSplit, setIsSplit] = useState(false);
  const [splitItems, setSplitItems] = useState<Record<string, string>>({});

  const canEdit = hasPermission('transactions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const availableCategories = useMemo(() => [...new Set(transactions.map((tx) => tx.category).filter(Boolean))].sort(), [transactions]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { description: '', amount: '', type: 'expense', category: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'account', person: '' },
  });

  const watchedAmount = watch('amount');
  const watchedType = watch('type');

  const visible = useMemo(() => 
    [...transactions]
      .filter((tx) => canAccessPerson(tx.person, tx))
      .filter((tx) => typeFilter === 'all' || tx.type === typeFilter)
      .filter((tx) => categoryFilter === 'all' || tx.category === categoryFilter)
      .filter((tx) => !search || tx.description?.toLowerCase().includes(search.toLowerCase()) || tx.category?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, canAccessPerson, typeFilter, categoryFilter, search]
  );

  function resetSplitAndInstallments() {
    setIsSplit(false); setSplitItems({}); setPaymentMode('single'); setInstallmentsCount(2); setInstallmentValueType('total'); setUpdateFuture(false);
  }

  function openNew() {
    reset({ description: '', amount: '', type: 'expense', category: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'account', person: session?.person || '' });
    resetSplitAndInstallments(); setEditingTx(null); setEditingId(null); setShowForm(true);
  }

  function openEdit(tx: any) {
    reset({
      description: tx.description || '', amount: tx.installmentAmount ?? tx.amount ?? '',
      type: tx.type || 'expense', category: tx.category || '', date: tx.date || new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'account', person: tx.person || session?.person || '',
    });
    setIsSplit(Boolean(tx.isSplit));
    if (tx.isSplit && Array.isArray(tx.splitDetails)) {
      const items: Record<string, string> = {};
      tx.splitDetails.forEach((d: any) => { items[d.person] = String(d.amount); });
      setSplitItems(items);
    } else setSplitItems({});
    
    setPaymentMode('single'); setUpdateFuture(false);
    setEditingTx(tx); setEditingId(tx.id); setShowForm(true);
  }

  function handleSplitCheck(pName: string, checked: boolean) {
    setSplitItems((prev) => { const copy = { ...prev }; if (checked) copy[pName] = copy[pName] || ''; else delete copy[pName]; return copy; });
  }

  function handleSplitValueChange(pName: string, val: string) {
    setSplitItems((prev) => ({ ...prev, [pName]: val }));
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

  function computeInvoiceMonth(dateStr: string, pm: string) {
    if (!pm?.startsWith('card_')) return undefined;
    const cardId = pm.replace('card_', '');
    const card = cards.find((c: any) => String(c.id) === cardId);
    return card ? getCardInvoiceMonth(dateStr, card.closeDay) : undefined;
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
        if (paymentMode === 'single' && Math.abs(sum - totalAmt) > 0.05) return toast.error(`A soma (${formatCurrency(sum)}) deve ser igual ao total (${formatCurrency(totalAmt)}).`);
        finalPerson = details.map((d) => d.person).join(', ');
        finalSplitDetails = details;
      }

      if (paymentMode === 'installments' && installmentsCount >= 2 && !editingId) {
        const rawAmt = Number(data.amount) || 0;
        const instAmt = installmentValueType === 'total' ? Math.round((rawAmt / installmentsCount) * 100) / 100 : rawAmt;
        const totalAmt = installmentValueType === 'total' ? rawAmt : Math.round(rawAmt * installmentsCount * 100) / 100;
        const groupId = 'group_' + generateId();
        const saves = [];
        
        for (let i = 0; i < installmentsCount; i++) {
          const instDate = addMonthsClamped(data.date, i);
          saves.push(saveRecord({
            groupId, type: data.type, description: `${data.description.trim()} (${i + 1}/${installmentsCount})`,
            amount: instAmt, installmentAmount: instAmt, totalPurchaseAmount: totalAmt, category: data.category?.trim() || '',
            paymentMethod: data.paymentMethod, person: finalPerson, personKeys: toPersonKeys(finalPerson), date: instDate,
            invoiceMonth: computeInvoiceMonth(instDate, data.paymentMethod), installmentIndex: i + 1, totalInstallments: installmentsCount,
            isSplit, splitDetails: finalSplitDetails, userId: session?.id,
          } as Transaction));
        }
        await Promise.all(saves);
        toast.success(`Lançamento parcelado em ${installmentsCount}x de ${formatCurrency(instAmt)}!`);
      } else {
        const record: any = {
          id: editingId || undefined, description: data.description.trim(), amount: Number(data.amount), type: data.type,
          category: data.category?.trim() || '', date: data.date, paymentMethod: data.paymentMethod, person: finalPerson,
          personKeys: toPersonKeys(finalPerson), isSplit, splitDetails: finalSplitDetails, userId: session?.id,
          invoiceMonth: computeInvoiceMonth(data.date, data.paymentMethod),
        };
        await saveRecord(record);

        if (editingId && editingTx?.groupId && updateFuture) {
          const futures = transactions.filter((t: any) => t.groupId === editingTx.groupId && t.installmentIndex > editingTx.installmentIndex);
          if (futures.length > 0) {
            const updates = futures.map((f: any) => saveRecord({ 
              ...f, amount: Number(data.amount), installmentAmount: Number(data.amount), category: data.category?.trim() || '',
              paymentMethod: data.paymentMethod, invoiceMonth: computeInvoiceMonth(f.date, data.paymentMethod)
            } as Transaction));
            await Promise.all(updates);
            toast.info(`Atualizadas ${futures.length} parcelas futuras.`);
          }
        }
        toast.success(editingId ? 'Transação atualizada!' : 'Transação registrada!');
      }
      setShowForm(false);
    } catch (err) { toast.error('Erro ao salvar transação.'); }
  }

  function requestDelete(tx: any) { if (tx.groupId) setGroupDeleteTx(tx); else setDeleteId(tx.id); }

  async function handleConfirmDelete() {
    if (!deleteId) return;
    try { await deleteRecord(deleteId); toast.success('Transação excluída!'); } 
    catch { toast.error('Erro ao excluir.'); } finally { setDeleteId(null); }
  }

  async function handleDeleteJustThis() {
    if (!groupDeleteTx) return;
    try { await deleteRecord(groupDeleteTx.id); toast.success('Parcela excluída!'); } 
    catch { toast.error('Erro.'); } finally { setGroupDeleteTx(null); }
  }

  async function handleDeleteWholeGroup() {
    if (!groupDeleteTx) return;
    const groupIds = transactions.filter((t: any) => t.groupId === groupDeleteTx.groupId).map((t) => t.id as string);
    try { await deleteRecords(groupIds); toast.success(`${groupIds.length} parcelas excluídas!`); } 
    catch { toast.error('Erro ao excluir parcelas.'); } finally { setGroupDeleteTx(null); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === visible.length ? new Set() : new Set(visible.map((tx) => tx.id as string))));
  }

  async function handleConfirmBulkDelete() {
    try { await deleteRecords([...selectedIds]); toast.success(`${selectedIds.size} transações excluídas!`); setSelectedIds(new Set()); } 
    catch { toast.error('Erro ao excluir em lote.'); } finally { setConfirmBulkDelete(false); }
  }

  if (loading) return <PageLoading message="Carregando transações..." />;
  if (error) return <PageError error={error as Error} title="Erro ao carregar transações" />;

  return (
    <div className="animate-in fade-in duration-500 max-w-[1200px] mx-auto pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Transações</h2>
        {canEdit && (
          <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#1c1206] px-5 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_4px_14px_rgba(227,176,75,0.25)]">
            <i className="fa-solid fa-plus text-sm" /> Nova Transação
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#8fa39a]" />
          <input type="text" placeholder="Buscar por descrição ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full sm:w-auto p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none min-w-[160px]">
          <option value="all">Todos os tipos</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full sm:w-auto p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none min-w-[180px]">
          <option value="all">Todas as categorias</option>
          {availableCategories.map((c) => <option key={c} value={c as string}>{c as string}</option>)}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center justify-between mb-6 animate-in slide-in-from-top-2">
          <span className="text-red-400 font-bold">{selectedIds.size} selecionada(s)</span>
          <button onClick={() => setConfirmBulkDelete(true)} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-semibold transition-colors">
            <i className="fa-solid fa-trash" /> Excluir Lote
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon="fa-arrow-right-arrow-left" title="Nenhuma transação" description="Registre receitas e despesas, ou ajuste os filtros de busca." actionLabel={canEdit ? 'Nova transação' : undefined} onAction={canEdit ? openNew : undefined} />
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl">
          {canEdit && (
            <div className="bg-white/5 px-6 py-3 border-b border-white/5 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-[#8fa39a] text-sm font-semibold hover:text-white transition-colors">
                <input type="checkbox" className="w-4 h-4 accent-[#e3b04b]" checked={selectedIds.size === visible.length} onChange={toggleSelectAll} />
                Selecionar Tudo
              </label>
            </div>
          )}
          
          <div className="flex flex-col divide-y divide-white/5">
            {visible.map((tx: any) => (
              <div key={tx.id} className="group p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:bg-white/[0.04] transition-colors relative">
                {canEdit && (
                  <input type="checkbox" checked={selectedIds.has(tx.id)} onChange={() => toggleSelect(tx.id)} className="w-5 h-5 accent-[#e3b04b] shrink-0 mt-1 sm:mt-0" />
                )}
                
                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center text-xl shrink-0 transition-transform group-hover:scale-110 ${tx.type === 'income' ? 'bg-[#34d399]/15 text-[#34d399]' : 'bg-white/10 text-[#8fa39a]'}`}>
                  <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-[#f2f0ea] text-[1.1rem] truncate">{tx.description}</strong>
                    {tx.groupId && <span className="text-[0.65rem] bg-[#e3b04b]/20 text-[#e3b04b] px-2 py-0.5 rounded-md font-bold tracking-widest uppercase">Parcela</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[0.8rem] text-[#8fa39a]">
                    <span><i className="fa-regular fa-calendar mr-1 opacity-70" /> {formatDate(tx.date)}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span><i className="fa-solid fa-tag mr-1 opacity-70" /> {tx.category || 'Sem Categoria'}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span><i className="fa-solid fa-user mr-1 opacity-70" /> {tx.person}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-4 mt-2 sm:mt-0">
                  <strong className={`text-xl font-bold font-mono tracking-tight ${tx.type === 'income' ? 'text-[#34d399]' : 'text-[#f2f0ea]'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </strong>

                  <div className="flex gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setDetailsTx(tx)} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-[#f2f0ea] flex items-center justify-center transition-colors" title="Ver Detalhes">
                      <i className="fa-solid fa-eye" />
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => openEdit(tx)} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-[#e3b04b] flex items-center justify-center transition-colors" title="Editar">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button onClick={() => requestDelete(tx)} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-red-400 flex items-center justify-center transition-colors" title="Excluir">
                          <i className="fa-solid fa-trash" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForm(false)}>
          <form className="bg-[#141d1a] border border-white/10 rounded-[24px] p-6 sm:p-8 w-full max-w-[600px] flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-bold text-[#f2f0ea]">{editingId ? 'Editar Transação' : 'Nova Transação'}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"><i className="fa-solid fa-xmark" /></button>
            </div>

            {/* GOLDEN WARNING BANNER PARA PARCELAS */}
            {editingId && editingTx?.groupId && (
              <div className="bg-[#e3b04b]/15 border border-[#e3b04b]/30 p-4 rounded-xl flex flex-col gap-3 shadow-lg mb-2">
                <div className="flex items-center gap-3 text-[#e3b04b]">
                  <i className="fa-solid fa-layer-group text-xl" />
                  <span className="text-[0.95rem] font-bold">Editando parcela {editingTx.installmentIndex} de {editingTx.totalInstallments}</span>
                </div>
                <label className="flex items-center gap-3 cursor-pointer text-[#f2f0ea] text-sm bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <input type="checkbox" className="accent-[#e3b04b] w-4 h-4" checked={updateFuture} onChange={(e) => setUpdateFuture(e.target.checked)} />
                  Aplicar o valor e categoria para as próximas parcelas também?
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Descrição</label>
                <input className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('description')} placeholder="Ex: Supermercado" />
                {errors.description && <span className="text-red-400 text-xs mt-1 block">{errors.description.message as string}</span>}
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Tipo</label>
                <select className="w-full p-3 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('type')}>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Valor {paymentMode === 'installments' && installmentValueType === 'total' ? '(Total)' : ''}</label>
                <input type="number" step="0.01" className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none font-mono" {...register('amount')} placeholder="0.00" />
                {errors.amount && <span className="text-red-400 text-xs mt-1 block">{errors.amount.message as string}</span>}
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Data {paymentMode === 'installments' ? '(1ª Parcela)' : ''}</label>
                <input type="date" className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('date')} />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Categoria</label>
                <input className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('category')} list="tx-categories" placeholder="Ex: Alimentação" />
                <datalist id="tx-categories">{availableCategories.map((c) => <option key={c as string} value={c as string} />)}</datalist>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Forma de Pagamento</label>
                <select className="w-full p-3 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('paymentMethod')}>
                  <option value="account">Conta Corrente</option>
                  <optgroup label="Contas">{accounts.map((a) => <option key={a.id} value={`acc_${a.id}`}>{a.name}</option>)}</optgroup>
                  <optgroup label="Cartões">{cards.map((c) => <option key={c.id} value={`card_${c.id}`}>Cartão {c.name}</option>)}</optgroup>
                </select>
              </div>
            </div>

            {!editingId && watchedType === 'expense' && (
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                <label className="flex items-center gap-3 cursor-pointer text-[#f2f0ea] font-bold">
                  <input type="checkbox" checked={paymentMode === 'installments'} onChange={(e) => setPaymentMode(e.target.checked ? 'installments' : 'single')} className="w-4 h-4 accent-[#e3b04b]" />
                  Parcelar essa compra
                </label>

                {paymentMode === 'installments' && (
                  <div className="grid grid-cols-2 gap-4 mt-4 bg-black/20 p-3 rounded-lg border border-white/5">
                    <div>
                      <label className="block text-xs text-[#8fa39a] mb-1 uppercase font-semibold">Nº Parcelas</label>
                      <input type="number" min="2" max="48" value={installmentsCount} onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)} className="w-full p-2 rounded-md bg-white/5 border border-white/10 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8fa39a] mb-1 uppercase font-semibold">O valor é o</label>
                      <select value={installmentValueType} onChange={(e) => setInstallmentValueType(e.target.value)} className="w-full p-2 rounded-md bg-[#141d1a] border border-white/10 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                        <option value="total">Total da compra</option>
                        <option value="per">Valor da parcela</option>
                      </select>
                    </div>
                    <div className="col-span-2 text-center text-sm font-bold text-[#e3b04b]">
                      {installmentValueType === 'total' 
                        ? `${installmentsCount}x de ${formatCurrency((Number(watchedAmount) || 0) / installmentsCount)}` 
                        : `Total: ${formatCurrency((Number(watchedAmount) || 0) * installmentsCount)}`}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
              <label className="flex items-center gap-3 cursor-pointer text-[#f2f0ea] font-bold">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} className="w-4 h-4 accent-[#e3b04b]" />
                Dividir com outras pessoas
              </label>

              {isSplit ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#8fa39a] uppercase font-semibold">Quem divide:</span>
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
                        <input type="number" step="0.01" disabled={!isChecked} placeholder="0.00" value={splitItems[pName] || ''} onChange={(e) => handleSplitValueChange(pName, e.target.value)} className="w-24 p-1.5 rounded-md bg-white/5 border border-white/10 text-right text-[0.9rem] text-[#f2f0ea] focus:border-[#e3b04b] outline-none disabled:opacity-30 font-mono" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-[0.8rem] font-semibold text-[#8fa39a] mb-1.5 uppercase">Pessoa Titular</label>
                  <input className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#f2f0ea] focus:border-[#e3b04b] outline-none" {...register('person')} placeholder={session?.person} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/[0.06]">
              <button type="button" className="px-5 py-3 rounded-xl text-[#8fa39a] font-medium hover:text-white transition-colors" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-extrabold transition-all hover:scale-105 shadow-lg" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Transação'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detailsTx && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setDetailsTx(null)}>
          <div className="bg-[#141d1a] border border-white/10 rounded-[24px] p-6 sm:p-8 w-full max-w-[500px] shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDetailsTx(null)} className="absolute top-6 right-6 text-[#8fa39a] hover:text-white"><i className="fa-solid fa-xmark text-xl" /></button>
            <h3 className="text-2xl font-bold text-[#f2f0ea] mb-6 border-b border-white/10 pb-4">Detalhes da Transação</h3>
            
            <div className="flex flex-col gap-4 text-[#f2f0ea]">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Descrição</span> <strong className="text-right">{detailsTx.description}</strong>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Valor</span> <strong className={`font-mono text-xl ${detailsTx.type === 'income' ? 'text-[#34d399]' : 'text-[#f2f0ea]'}`}>{formatCurrency(detailsTx.amount)}</strong>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Tipo</span> <span>{detailsTx.type === 'income' ? 'Receita' : 'Despesa'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Data</span> <span>{formatDate(detailsTx.date)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Categoria</span> <span>{detailsTx.category || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-[#8fa39a]">Pessoa Titular</span> <span>{detailsTx.person}</span>
              </div>

              {detailsTx.totalInstallments && (
                <div className="flex flex-col gap-1 border-b border-white/5 pb-2 text-sm text-[#e3b04b]">
                  <div className="flex justify-between"><span>Parcela atual</span> <strong>{detailsTx.installmentIndex} de {detailsTx.totalInstallments}</strong></div>
                  <div className="flex justify-between"><span>Valor Total da Compra</span> <strong>{formatCurrency(detailsTx.totalPurchaseAmount)}</strong></div>
                </div>
              )}

              {detailsTx.isSplit && Array.isArray(detailsTx.splitDetails) && (
                <div className="mt-2 bg-white/5 p-4 rounded-xl border border-white/10">
                  <strong className="block mb-3 text-[#8fa39a] text-sm uppercase tracking-widest">Divisão do Valor:</strong>
                  <div className="flex flex-col gap-2">
                    {detailsTx.splitDetails.map((d: any) => (
                      <div key={d.person} className="flex justify-between items-center text-sm">
                        <span className="font-semibold">{d.person}</span>
                        <span className="font-mono text-[#8fa39a]">{formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-8 flex justify-end">
              <button className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors" onClick={() => setDetailsTx(null)}>Fechar Detalhes</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteId} title="Excluir transação" message="Tem certeza que deseja excluir esta transação permanentemente?" confirmLabel="Excluir" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
      <ConfirmModal isOpen={confirmBulkDelete} title="Excluir transações selecionadas" message={`Tem certeza que deseja excluir ${selectedIds.size} transação(ões)?`} confirmLabel="Excluir todas" onConfirm={handleConfirmBulkDelete} onCancel={() => setConfirmBulkDelete(false)} />

      {groupDeleteTx && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setGroupDeleteTx(null)}>
          <div className="bg-[#141d1a] border border-red-500/30 rounded-[24px] p-6 sm:p-8 w-full max-w-[450px] shadow-[0_10px_40px_rgba(239,68,68,0.2)] text-center relative" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-3xl mx-auto mb-4"><i className="fa-solid fa-triangle-exclamation" /></div>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-3">Excluir Parcelamento</h3>
            <p className="text-[#8fa39a] text-[0.95rem] leading-relaxed mb-8">
              A transação <strong>"{groupDeleteTx.description}"</strong> faz parte de um grupo de parcelas. O que você deseja fazer?
            </p>
            <div className="flex flex-col gap-3">
              <button className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors shadow-lg" onClick={handleDeleteWholeGroup}>Excluir Todas as Parcelas</button>
              <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors" onClick={handleDeleteJustThis}>Excluir Apenas Esta</button>
              <button className="w-full py-3 rounded-xl text-[#8fa39a] font-medium hover:text-white transition-colors" onClick={() => setGroupDeleteTx(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}