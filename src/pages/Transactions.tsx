import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
  if (type === 'transfer_out' || type === 'transfer_in') return 'fa-right-left';
  if (type === 'invoice_payment') return 'fa-file-invoice-dollar';
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [groupDeleteTx, setGroupDeleteTx] = useState<any>(null);
  const [transferDeleteTx, setTransferDeleteTx] = useState<any>(null);
  const [invoicePaymentDeleteTx, setInvoicePaymentDeleteTx] = useState<any>(null);
  const [detailsTx, setDetailsTx] = useState<any>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPerson, setBulkPerson] = useState('');
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calDate, setCalDate] = useState(() => new Date());
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [categoryStyles, setCategoryStyles] = useState<Record<string, { icon: string; color: string }>>({});
  useEffect(() => {
    getDoc(doc(db, 'settings', 'categoryStyles')).then((snap) => {
      if (snap.exists()) setCategoryStyles(snap.data() as Record<string, { icon: string; color: string }>);
    }).catch((e) => console.error('Erro ao carregar estilos de categoria:', e));
  }, []);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [paymentMode, setPaymentMode] = useState('single');
  const [installmentsCount, setInstallmentsCount] = useState(2);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew();
      setSearchParams({}, { replace: true });
      return;
    }
    const detailId = searchParams.get('detail');
    if (detailId && transactions.length > 0) {
      const found = transactions.find((t: any) => t.id === detailId);
      if (found) setDetailsTx(found);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, transactions]);
  const [installmentValueType, setInstallmentValueType] = useState('total');
  const [updateFuture, setUpdateFuture] = useState(false);

  const [isSplit, setIsSplit] = useState(false);
  const [splitItems, setSplitItems] = useState<Record<string, string>>({});
  const [paidBy, setPaidBy] = useState('');

  const canEdit = hasPermission('transactions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const availableCategories = useMemo(() => [...new Set(transactions.map((tx) => tx.category).filter(Boolean))].sort(), [transactions]);
  const allTags = useMemo(() => [...new Set(transactions.flatMap((tx: any) => Array.isArray(tx.tags) ? tx.tags : []))].sort(), [transactions]);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { description: '', amount: '', type: 'expense', category: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'account', person: '', fromAccount: '', toAccount: '' },
  });

  const watchedAmount = watch('amount');
  const watchedType = watch('type');
  const watchedDescription = watch('description');

  const smartSuggestion = useMemo(() => {
    const desc = (watchedDescription || '').trim().toLowerCase();
    if (desc.length < 3 || watchedType === 'transfer') return null;
    const match = [...transactions]
      .filter((t: any) => t.id !== editingId && t.type === watchedType && (t.description || '').trim().toLowerCase() === desc)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return match || null;
  }, [watchedDescription, watchedType, transactions, editingId]);

  function applySuggestion() {
    if (!smartSuggestion) return;
    if (smartSuggestion.category) setValue('category', smartSuggestion.category);
    setValue('amount', String(smartSuggestion.amount));
    setValue('paymentMethod', smartSuggestion.paymentMethod);
  }

  const filteredBase = useMemo(() =>
    [...transactions]
      .filter((tx) => !pendingDeleteIds.has(tx.id as string))
      .filter((tx) => canAccessPerson(tx.person, tx))
      .filter((tx) => typeFilter === 'all' || (typeFilter === 'transfer' ? (tx.type === 'transfer_out' || tx.type === 'transfer_in') : tx.type === typeFilter))
      .filter((tx) => categoryFilter === 'all' || tx.category === categoryFilter)
      .filter((tx: any) => tagFilter === 'all' || (Array.isArray(tx.tags) && tx.tags.includes(tagFilter)))
      .filter((tx) => !search || tx.description?.toLowerCase().includes(search.toLowerCase()) || tx.category?.toLowerCase().includes(search.toLowerCase())),
    [transactions, pendingDeleteIds, canAccessPerson, typeFilter, categoryFilter, tagFilter, search]
  );

  const visible = useMemo(() =>
    filteredBase
      .filter((tx) => !dayFilter || tx.date === dayFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filteredBase, dayFilter]
  );

  const calendarDays = useMemo(() => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = firstDay.getDay();
    const byDay = new Map<string, { income: number; expense: number }>();
    filteredBase.forEach((tx) => {
      const d = new Date(tx.date + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const key = tx.date;
      if (!byDay.has(key)) byDay.set(key, { income: 0, expense: 0 });
      const b = byDay.get(key)!;
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'transfer_in') b.income += amt;
      else if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'invoice_payment') b.expense += amt;
    });
    const cells: ({ day: number; dateStr: string; income: number; expense: number } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const b = byDay.get(dateStr) || { income: 0, expense: 0 };
      cells.push({ day: d, dateStr, income: b.income, expense: b.expense });
    }
    return cells;
  }, [filteredBase, calDate]);

  function resetSplitAndInstallments() {
    setIsSplit(false); setSplitItems({}); setPaidBy(session?.person || ''); setPaymentMode('single'); setInstallmentsCount(2); setInstallmentValueType('total'); setUpdateFuture(false);
  }

  function openNew() {
    reset({ description: '', amount: '', type: 'expense', category: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'account', person: session?.person || '', fromAccount: '', toAccount: '' });
    resetSplitAndInstallments(); setTags([]); setTagInput(''); setEditingTx(null); setEditingId(null); setShowForm(true);
  }

  function openEdit(tx: any) {
    const isTransfer = tx.type === 'transfer_out' || tx.type === 'transfer_in';
    reset({
      description: tx.description || '', amount: tx.installmentAmount ?? tx.amount ?? '',
      type: isTransfer ? 'transfer' : (tx.type || 'expense'), category: tx.category || '', date: tx.date || new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'account', person: tx.person || session?.person || '',
      fromAccount: isTransfer ? (tx.type === 'transfer_out' ? tx.paymentMethod : tx.transferAccountId) : '',
      toAccount: isTransfer ? (tx.type === 'transfer_out' ? tx.transferAccountId : tx.paymentMethod) : '',
    });
    setIsSplit(Boolean(tx.isSplit));
    if (tx.isSplit && Array.isArray(tx.splitDetails)) {
      const items: Record<string, string> = {};
      tx.splitDetails.forEach((d: any) => { items[d.person] = String(d.amount); });
      setSplitItems(items);
    } else setSplitItems({});
    setPaidBy(tx.paidBy || session?.person || '');
    setTags(Array.isArray(tx.tags) ? tx.tags : []); setTagInput('');

    setPaymentMode('single'); setUpdateFuture(false);
    setEditingTx(tx); setEditingId(tx.id); setShowForm(true);
  }

  function handleDuplicate(tx: any) {
    reset({
      description: tx.description || '', amount: tx.installmentAmount ?? tx.amount ?? '',
      type: tx.type === 'income' ? 'income' : 'expense', category: tx.category || '',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'account', person: tx.person || session?.person || '',
      fromAccount: '', toAccount: '',
    });
    resetSplitAndInstallments();
    setEditingTx(null); setEditingId(null); setShowForm(true);
    toast.info('Transação duplicada. Confira os dados e salve.');
  }

  function handleSplitCheck(pName: string, checked: boolean) {
    setSplitItems((prev) => { const copy = { ...prev }; if (checked) copy[pName] = copy[pName] || ''; else delete copy[pName]; return copy; });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(''); return; }
    setTags((prev) => [...prev, t]);
    setTagInput('');
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
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

  function accountNameFor(pm?: string) {
    if (pm?.startsWith('acc_')) {
      const acc = accounts.find((a) => `acc_${a.id}` === pm);
      return acc ? acc.name : 'Conta';
    }
    if (pm?.startsWith('card_')) {
      const c = cards.find((c: any) => `card_${c.id}` === pm);
      return c ? c.name : 'Cartão';
    }
    return 'Principal';
  }

  function computeInvoiceMonth(dateStr: string, pm: string) {
    if (!pm?.startsWith('card_')) return undefined;
    const cardId = pm.replace('card_', '');
    const card = cards.find((c: any) => String(c.id) === cardId);
    return card ? getCardInvoiceMonth(dateStr, card.closeDay) : undefined;
  }

  async function onSubmit(data: any) {
    try {
      if (data.type === 'transfer') {
        const amt = Number(data.amount) || 0;
        if (!data.fromAccount || !data.toAccount) return toast.warning('Selecione as duas contas da transferência.');
        if (data.fromAccount === data.toAccount) return toast.warning('Escolha contas diferentes para a transferência.');
        if (amt <= 0) return toast.warning('Informe um valor de transferência maior que zero.');
        const finalPerson = data.person?.trim() || session?.person;

        if (editingId && editingTx?.transferId) {
          // Edita as duas pontas já existentes, mantendo as contas originais (não é permitido trocar de conta numa edição).
          const sibling = transactions.find((t: any) => t.transferId === editingTx.transferId && t.id !== editingId);
          const updates = [
            saveRecord({ ...editingTx, id: editingId, description: data.description.trim(), amount: amt, date: data.date, person: finalPerson, personKeys: toPersonKeys(finalPerson) } as Transaction),
          ];
          if (sibling) updates.push(saveRecord({ ...sibling, description: data.description.trim(), amount: amt, date: data.date, person: finalPerson, personKeys: toPersonKeys(finalPerson) } as Transaction));
          await Promise.all(updates);
          toast.success('Transferência atualizada!');
        } else {
          const transferId = 'transfer_' + generateId();
          await Promise.all([
            saveRecord({
              transferId, type: 'transfer_out', description: data.description.trim() || 'Transferência entre contas',
              amount: amt, category: 'Transferência', date: data.date, paymentMethod: data.fromAccount,
              transferAccountId: data.toAccount, person: finalPerson, personKeys: toPersonKeys(finalPerson), userId: session?.id,
            } as Transaction),
            saveRecord({
              transferId, type: 'transfer_in', description: data.description.trim() || 'Transferência entre contas',
              amount: amt, category: 'Transferência', date: data.date, paymentMethod: data.toAccount,
              transferAccountId: data.fromAccount, person: finalPerson, personKeys: toPersonKeys(finalPerson), userId: session?.id,
            } as Transaction),
          ]);
          toast.success('Transferência registrada!');
        }
        setShowForm(false);
        return;
      }

      let finalPerson = data.person?.trim() || session?.person;
      let finalSplitDetails = null;
      let finalPaidBy: string | null = null;

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
        finalPaidBy = paidBy || session?.person || null;
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
            isSplit, splitDetails: finalSplitDetails, paidBy: finalPaidBy, tags, userId: session?.id,
          } as Transaction));
        }
        await Promise.all(saves);
        toast.success(`Lançamento parcelado em ${installmentsCount}x de ${formatCurrency(instAmt)}!`);
      } else {
        const record: any = {
          id: editingId || undefined, description: data.description.trim(), amount: Number(data.amount), type: data.type,
          category: data.category?.trim() || '', date: data.date, paymentMethod: data.paymentMethod, person: finalPerson,
          personKeys: toPersonKeys(finalPerson), isSplit, splitDetails: finalSplitDetails, paidBy: finalPaidBy, tags, userId: session?.id,
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

  function requestDelete(tx: any) {
    if (tx.transferId) setTransferDeleteTx(tx);
    else if (tx.paidCardId) setInvoicePaymentDeleteTx(tx);
    else if (tx.groupId) setGroupDeleteTx(tx);
    else setDeleteId(tx.id);
  }

  async function handleConfirmDeleteTransfer() {
    if (!transferDeleteTx) return;
    const sibling = transactions.find((t: any) => t.transferId === transferDeleteTx.transferId && t.id !== transferDeleteTx.id);
    try {
      await Promise.all([
        deleteRecord(transferDeleteTx.id, transferDeleteTx.paymentMethod),
        ...(sibling ? [deleteRecord(sibling.id, sibling.paymentMethod)] : []),
      ]);
      toast.success('Transferência excluída!');
    } catch { toast.error('Erro ao excluir transferência.'); } finally { setTransferDeleteTx(null); }
  }

  function scheduleDelete(id: string, paymentMethod: string | undefined, message: string) {
    setPendingDeleteIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(async () => {
      pendingDeleteTimers.current.delete(id);
      try {
        await deleteRecord(id, paymentMethod);
      } catch {
        toast.error('Erro ao excluir.');
      } finally {
        setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }, 5000);
    pendingDeleteTimers.current.set(id, timer);
    toast.action(message, 'Desfazer', () => {
      const t = pendingDeleteTimers.current.get(id);
      if (t) { clearTimeout(t); pendingDeleteTimers.current.delete(id); }
      setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    });
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;
    const tx = transactions.find((t: any) => t.id === deleteId);
    scheduleDelete(deleteId, tx?.paymentMethod, 'Transação excluída.');
    setDeleteId(null);
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

  async function handleBulkEdit() {
    if (!bulkCategory.trim() && !bulkPerson.trim()) return toast.warning('Preencha categoria e/ou pessoa pra aplicar.');
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => {
        const tx = transactions.find((t: any) => t.id === id);
        if (!tx) return Promise.resolve();
        const updated: any = { ...tx, id };
        if (bulkCategory.trim()) updated.category = bulkCategory.trim();
        if (bulkPerson.trim()) { updated.person = bulkPerson.trim(); updated.personKeys = toPersonKeys(bulkPerson.trim()); }
        return saveRecord(updated as Transaction);
      }));
      toast.success(`${ids.length} transação(ões) atualizada(s)!`);
      setSelectedIds(new Set()); setBulkCategory(''); setBulkPerson(''); setBulkEditOpen(false);
    } catch {
      toast.error('Erro ao editar em massa.');
    }
  }

  async function handleConfirmBulkDelete() {
    const ids = [...selectedIds];
    const count = ids.length;
    ids.forEach((id) => {
      const tx = transactions.find((t: any) => t.id === id);
      setPendingDeleteIds((prev) => new Set(prev).add(id));
      const timer = setTimeout(async () => {
        pendingDeleteTimers.current.delete(id);
        try { await deleteRecord(id, tx?.paymentMethod); }
        catch { /* erro individual não interrompe as demais */ }
        finally { setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; }); }
      }, 5000);
      pendingDeleteTimers.current.set(id, timer);
    });
    toast.action(`${count} transações excluídas.`, 'Desfazer', () => {
      ids.forEach((id) => {
        const t = pendingDeleteTimers.current.get(id);
        if (t) { clearTimeout(t); pendingDeleteTimers.current.delete(id); }
      });
      setPendingDeleteIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    });
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }

    if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="w-10 h-10 border-4 border-[#e3b04b] border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <PageError error={error as Error} title="Erro ao carregar transações" />;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-4 sm:pt-6 animate-in fade-in duration-500">
      
      {/* HEADER E AÇÃO PRINCIPAL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea]">Livro Caixa</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-white/5 rounded-xl p-1 shrink-0">
            <button onClick={() => setViewMode('list')} className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'list' ? 'bg-[#e3b04b] text-black' : 'text-[#8fa39a] hover:text-white'}`}><i className="fa-solid fa-list mr-1.5" />Lista</button>
            <button onClick={() => setViewMode('calendar')} className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'calendar' ? 'bg-[#e3b04b] text-black' : 'text-[#8fa39a] hover:text-white'}`}><i className="fa-solid fa-calendar-days mr-1.5" />Calendário</button>
          </div>
          {canEdit && (
            <button className="flex-1 sm:flex-none px-5 py-3.5 sm:py-3 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-extrabold text-[0.95rem] shadow-[0_4px_14px_rgba(227,176,75,0.25)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2" onClick={openNew}>
              <i className="fa-solid fa-plus" /> Nova Transação
            </button>
          )}
        </div>
      </div>

      {dayFilter && (
        <div className="flex items-center gap-2 mb-4 bg-[#e3b04b]/10 text-[#e3b04b] px-4 py-2.5 rounded-xl text-sm font-bold w-fit">
          <i className="fa-solid fa-calendar-day" /> Filtrado por {formatDate(dayFilter)}
          <button onClick={() => setDayFilter(null)} className="hover:text-white"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}

      {viewMode === 'calendar' && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white flex items-center justify-center"><i className="fa-solid fa-chevron-left" /></button>
            <strong className="text-[#f2f0ea] capitalize">{calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
            <button onClick={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white flex items-center justify-center"><i className="fa-solid fa-chevron-right" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (<div key={i} className="text-center text-[10px] font-bold text-[#8fa39a] uppercase">{d}</div>))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((cell, i) => cell === null ? (
              <div key={`empty-${i}`} />
            ) : (
              <button
                key={cell.dateStr}
                onClick={() => setDayFilter(cell.dateStr === dayFilter ? null : cell.dateStr)}
                className={`aspect-square rounded-lg sm:rounded-xl p-1 sm:p-2 flex flex-col items-center justify-start text-left transition-colors ${dayFilter === cell.dateStr ? 'bg-[#e3b04b]/20 ring-2 ring-[#e3b04b]' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <span className="text-xs sm:text-sm font-bold text-[#f2f0ea]">{cell.day}</span>
                {cell.expense > 0 && <span className="text-[8px] sm:text-[10px] font-mono text-[#f87171] leading-tight mt-auto">-{formatCurrency(cell.expense).replace('R$', '')}</span>}
                {cell.income > 0 && <span className="text-[8px] sm:text-[10px] font-mono text-[#34d399] leading-tight">+{formatCurrency(cell.income).replace('R$', '')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FILTROS RESPONSIVOS */}
      <div className="bg-white/[0.02] border border-white/[0.08] p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#8fa39a]" />
          <input type="text" placeholder="Buscar por descrição ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-colors" />
        </div>
        <div className="flex gap-3">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="flex-1 md:flex-none w-full md:w-[150px] px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none appearance-none">
            <option value="all">Tipos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
            <option value="transfer">Transferências</option>
            <option value="invoice_payment">Pagamentos de Fatura</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="flex-1 md:flex-none w-full md:w-[170px] px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none appearance-none">
            <option value="all">Categorias</option>
            {availableCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="flex-1 md:flex-none w-full md:w-[150px] px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none appearance-none">
              <option value="all">Tags</option>
              {allTags.map((t) => (<option key={t} value={t}>#{t}</option>))}
            </select>
          )}
        </div>
      </div>

      {/* PAINEL DE SELEÇÃO EM MASSA */}
      {selectedIds.size > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <span className="text-red-400 font-bold">{selectedIds.size} selecionada(s)</span>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] hover:bg-[#3b82f6]/30 transition-colors font-semibold flex items-center justify-center gap-2" onClick={() => setBulkEditOpen(true)}>
              <i className="fa-solid fa-pen" /> Editar selecionadas
            </button>
            <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-semibold flex items-center justify-center gap-2" onClick={() => setConfirmBulkDelete(true)}>
              <i className="fa-solid fa-trash" /> Excluir selecionadas
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE TRANSAÇÕES (Substituindo a antiga Tabela HTML) */}
      {viewMode === 'calendar' && !dayFilter ? null : visible.length === 0 ? (
        <EmptyState icon="fa-receipt" title="Nenhuma transação encontrada" description="Ajuste os filtros ou registre um novo lançamento no sistema." actionLabel={canEdit ? 'Nova transação' : undefined} onAction={canEdit ? openNew : undefined} />
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl shadow-xl overflow-hidden">
          {/* Cabeçalho visível só no PC */}
          <div className="hidden md:flex items-center gap-4 p-4 border-b border-white/[0.05] bg-white/[0.02] text-xs font-bold text-[#8fa39a] uppercase tracking-wider">
            {canEdit && (
               <div className="w-10 flex justify-center">
                 <input type="checkbox" checked={selectedIds.size === visible.length} onChange={toggleSelectAll} className="w-4 h-4 accent-[#e3b04b] cursor-pointer" />
               </div>
            )}
            <div className="w-[100px]">Data</div>
            <div className="flex-1 min-w-[200px]">Descrição</div>
            <div className="w-[140px]">Categoria</div>
            <div className="w-[100px] truncate">Pessoa</div>
            <div className="w-[130px] text-right">Valor</div>
            <div className="w-[100px] text-center">Ações</div>
          </div>

          <div className="flex flex-col divide-y divide-white/[0.05]">
            {visible.map((tx) => (
              <div key={tx.id} className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 hover:bg-white/[0.04] transition-colors ${selectedIds.has(tx.id) ? 'bg-white/[0.04]' : ''}`}>
                
                {/* Linha Mobile / Colunas PC */}
                <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                  {canEdit && (
                    <div className="md:w-10 flex justify-center shrink-0">
                      <input type="checkbox" checked={selectedIds.has(tx.id)} onChange={() => toggleSelect(tx.id)} className="w-5 h-5 md:w-4 md:h-4 accent-[#e3b04b] cursor-pointer" />
                    </div>
                  )}
                  
                  {/* Ícone (Mobile + PC) */}
                  <div className={`w-12 h-12 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 text-lg md:text-base ${tx.type === 'income' ? 'bg-[#34d399]/15 text-[#34d399]' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : tx.type === 'invoice_payment' ? 'bg-[#a78bfa]/15 text-[#a78bfa]' : categoryStyles[tx.category] ? '' : 'bg-white/10 text-[#8fa39a]'}`} style={tx.type === 'expense' && categoryStyles[tx.category] ? { backgroundColor: `${categoryStyles[tx.category].color}26`, color: categoryStyles[tx.category].color } : undefined}>
                    <i className={`fa-solid ${tx.type === 'expense' && categoryStyles[tx.category]?.icon ? categoryStyles[tx.category].icon : iconForCategory(tx.category, tx.type)}`} />
                  </div>

                  {/* Descrição e Infos (Cresce) */}
                  <div className="flex-1 min-w-0 md:hidden">
                     <div className="font-bold text-[#f2f0ea] text-base truncate flex items-center gap-2">
                       {tx.description}
                       {tx.groupId && <i className="fa-solid fa-layer-group text-xs text-[#e3b04b]" />}
                     </div>
                     <div className="text-xs text-[#8fa39a] mt-0.5">{formatDate(tx.date)} &bull; {tx.category} &bull; {tx.person}</div>
                     {Array.isArray(tx.tags) && tx.tags.length > 0 && (
                       <div className="flex flex-wrap gap-1 mt-1">
                         {tx.tags.map((t: string) => (<span key={t} className="text-[10px] font-bold bg-[#8b5cf6]/15 text-[#8b5cf6] px-1.5 py-0.5 rounded-full">#{t}</span>))}
                       </div>
                     )}
                  </div>

                  {/* Colunas Exclusivas PC */}
                  <div className="hidden md:block w-[100px] text-sm text-[#8fa39a] font-medium">{formatDate(tx.date)}</div>
                  <div className="hidden md:flex flex-1 min-w-[200px] items-center gap-2 text-[#f2f0ea] font-medium text-[0.95rem] truncate">
                     <span className="truncate">{tx.description}</span>
                     {tx.groupId && <i className="fa-solid fa-layer-group text-[0.7rem] text-[#e3b04b]" title="Parcelamento" />}
                     {Array.isArray(tx.tags) && tx.tags.map((t: string) => (<span key={t} className="text-[10px] font-bold bg-[#8b5cf6]/15 text-[#8b5cf6] px-1.5 py-0.5 rounded-full shrink-0">#{t}</span>))}
                  </div>
                  <div className="hidden md:block w-[140px] text-sm text-[#8fa39a] truncate"><span className="bg-white/5 px-2 py-1 rounded-md">{tx.category}</span></div>
                  <div className="hidden md:block w-[100px] text-sm text-[#8fa39a] truncate">{tx.person}</div>
                </div>

                {/* Valor e Ações */}
                <div className="flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0 pl-[52px] md:pl-0 w-full md:w-auto md:flex-1">
                   <div className="flex-1 md:w-[130px] md:flex-none text-left md:text-right">
                     <strong className={`font-mono text-lg md:text-base ${tx.type === 'income' ? 'text-[#34d399]' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? 'text-[#3b82f6]' : tx.type === 'invoice_payment' ? 'text-[#a78bfa]' : 'text-[#f2f0ea]'}`}>
                       {tx.type === 'income' ? '+ ' : tx.type === 'transfer_out' ? '→ ' : tx.type === 'transfer_in' ? '← ' : '- '}{formatCurrency(tx.amount)}
                     </strong>
                   </div>
                   <div className="flex items-center gap-1 md:w-[100px] justify-end shrink-0">
                     <button onClick={() => setDetailsTx(tx)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"><i className="fa-solid fa-eye" /></button>
                     {canEdit && (
                       <>
                         {!tx.transferId && !tx.paidCardId && (
                           <button onClick={() => handleDuplicate(tx)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-[#e3b04b]/20 hover:text-[#e3b04b] transition-colors flex items-center justify-center" title="Duplicar transação"><i className="fa-solid fa-copy" /></button>
                         )}
                         <button onClick={() => openEdit(tx)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-[#3b82f6]/20 hover:text-[#3b82f6] transition-colors flex items-center justify-center"><i className="fa-solid fa-pen" /></button>
                         <button onClick={() => requestDelete(tx)} className="w-8 h-8 rounded-lg text-[#8fa39a] hover:bg-red-500/20 hover:text-red-400 transition-colors flex items-center justify-center"><i className="fa-solid fa-trash" /></button>
                       </>
                     )}
                   </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE TRANSAÇÃO (FORMULÁRIO FULL RESPONSIVO) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowForm(false)}>
          <form className="w-full max-w-[500px] max-h-[90vh] overflow-y-auto bg-[#141d1a] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-2">{editingId ? 'Editar Transação' : 'Nova Transação'}</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase font-bold text-[#8fa39a]">Descrição</label>
              <input {...register('description')} placeholder="Ex: Supermercado" className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
              {errors.description && <span className="text-red-400 text-xs mt-1">{(errors.description as any).message}</span>}
              {smartSuggestion && (
                <button type="button" onClick={applySuggestion} className="mt-1 text-left text-xs bg-[#e3b04b]/10 text-[#e3b04b] hover:bg-[#e3b04b]/20 rounded-lg px-3 py-2 transition-colors">
                  <i className="fa-solid fa-lightbulb mr-1.5" />
                  Última vez: {smartSuggestion.category || 'sem categoria'} &bull; {formatCurrency(smartSuggestion.amount)} &bull; {accountNameFor(smartSuggestion.paymentMethod)}. Usar esses dados?
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[#8fa39a]">Tipo</label>
                <select {...register('type')} className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                  <option value="expense">Despesa (-)</option><option value="income">Receita (+)</option><option value="transfer">Transferência entre contas</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[#8fa39a]">Data {paymentMode === 'installments' ? '(1ª)' : ''}</label>
                <input type="date" {...register('date')} className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#8fa39a] focus:text-white focus:border-[#e3b04b] outline-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase font-bold text-[#8fa39a]">Valor {paymentMode === 'installments' && installmentValueType === 'total' ? '(Total da compra)' : ''}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8fa39a] font-mono">R$</span>
                <input type="number" step="0.01" {...register('amount')} className="w-full pl-10 pr-4 p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none font-mono text-lg" />
              </div>
              {errors.amount && <span className="text-red-400 text-xs mt-1">{(errors.amount as any).message}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {watchedType !== 'transfer' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase font-bold text-[#8fa39a]">Categoria</label>
                  <input {...register('category')} list="tx-categories" placeholder="Ex: Alimentação" className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
                  <datalist id="tx-categories">{availableCategories.map((c) => (<option key={c} value={c} />))}</datalist>
                </div>
              )}
              {watchedType === 'transfer' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase font-bold text-[#8fa39a]">De (origem)</label>
                    <select {...register('fromAccount')} disabled={!!editingId} className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none disabled:opacity-50">
                      <option value="">Selecione</option>
                      {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase font-bold text-[#8fa39a]">Para (destino)</label>
                    <select {...register('toAccount')} disabled={!!editingId} className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none disabled:opacity-50">
                      <option value="">Selecione</option>
                      {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase font-bold text-[#8fa39a]">Conta / Cartão</label>
                  <select {...register('paymentMethod')} className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                    <option value="account">Principal</option>
                    <optgroup label="Contas">{accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}</optgroup>
                    <optgroup label="Cartões">{cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>{c.name}</option>))}</optgroup>
                  </select>
                </div>
              )}
            </div>

            {/* SEÇÃO PARCELAMENTO */}
            {!editingId && watchedType === 'expense' && (
              <div className="mt-2 p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-[#f2f0ea]">
                  <input type="checkbox" checked={paymentMode === 'installments'} onChange={(e) => setPaymentMode(e.target.checked ? 'installments' : 'single')} className="w-4 h-4 accent-[#e3b04b]" />
                  Parcelar essa compra
                </label>
                {paymentMode === 'installments' && (
                  <div className="flex gap-3 mt-4 animate-in slide-in-from-top-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Parcelas</label>
                      <input type="number" min="2" max="48" value={installmentsCount} onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)} className="w-full p-2.5 rounded-lg border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
                    </div>
                    <div className="flex-[2]">
                      <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Valor informado</label>
                      <select value={installmentValueType} onChange={(e) => setInstallmentValueType(e.target.value)} className="w-full p-2.5 rounded-lg border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                        <option value="total">Total da compra</option><option value="per">Valor da parcela</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO RATEIO (não se aplica a transferência entre contas) */}
            {watchedType !== 'transfer' && (
            <div className="mt-2 p-4 bg-white/[0.03] rounded-2xl border border-white/5">
              <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-[#f2f0ea]">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} className="w-4 h-4 accent-[#e3b04b]" />
                Dividir com outras pessoas
              </label>
              {isSplit ? (
                <div className="mt-4 animate-in slide-in-from-top-2">
                  <div className="mb-3">
                    <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Quem pagou</label>
                    <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="w-full p-2.5 rounded-lg border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                      {availablePersons.map((pName) => (<option key={pName} value={pName}>{pName}</option>))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#8fa39a]">Marque quem participa:</span>
                    <button type="button" onClick={splitEqually} className="text-xs font-bold text-[#e3b04b] bg-[#e3b04b]/10 px-2 py-1 rounded hover:bg-[#e3b04b]/20"><i className="fa-solid fa-calculator" /> Dividir igual</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {availablePersons.map((pName) => {
                      const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                      return (
                        <div key={pName} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                          <label className="flex items-center gap-3 text-sm text-[#f2f0ea] cursor-pointer">
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
                  <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Atribuir a</label>
                  <input {...register('person')} placeholder={session.person} className="w-full p-2.5 rounded-lg border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
                </div>
              )}
            </div>
            )}

            {watchedType !== 'transfer' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[#8fa39a]">Tags</label>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                    placeholder="Ex: viagem (Enter pra adicionar)"
                    className="flex-1 p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none"
                  />
                  <button type="button" onClick={addTag} className="px-4 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white font-bold">Add</button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1.5 bg-[#8b5cf6]/15 text-[#8b5cf6] text-xs font-bold px-2.5 py-1 rounded-full">
                        #{t} <button type="button" onClick={() => removeTag(t)} className="hover:text-white"><i className="fa-solid fa-xmark" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="w-full sm:flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isSubmitting ? <><i className="fa-solid fa-spinner fa-spin" /> Salvando...</> : <><i className="fa-solid fa-check" /> Salvar Transação</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DETALHES, CONFIRMAÇÃO DE EXCLUSÃO E PARCELAMENTO */}
      {/* Como o Tailwind já está 100% nas listas e form, os modais menores continuam com classes de fallback ou você já aplica os visuais aqui se desejar */}
      
      <ConfirmModal isOpen={!!deleteId} title="Excluir" message="Tem certeza que deseja excluir esta transação?" confirmLabel="Excluir" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
      <ConfirmModal isOpen={confirmBulkDelete} title="Excluir selecionadas" message={`Excluir ${selectedIds.size} transação(ões)?`} confirmLabel="Excluir" onConfirm={handleConfirmBulkDelete} onCancel={() => setConfirmBulkDelete(false)} />

      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setBulkEditOpen(false)}>
          <div className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-1">Editar {selectedIds.size} transação(ões)</h3>
            <p className="text-xs text-[#8fa39a] -mt-2">Deixe em branco o que não quiser alterar.</p>
            <div>
              <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Nova categoria</label>
              <input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} list="tx-categories" placeholder="Ex: Alimentação" className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[#8fa39a] block mb-1">Nova pessoa</label>
              <input value={bulkPerson} onChange={(e) => setBulkPerson(e.target.value)} placeholder="Ex: Marcos" className="w-full p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setBulkEditOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button onClick={handleBulkEdit} className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors">Aplicar</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal isOpen={!!transferDeleteTx} title="Excluir transferência" message="Isso remove as duas pontas da transferência (origem e destino). Deseja continuar?" confirmLabel="Excluir" onConfirm={handleConfirmDeleteTransfer} onCancel={() => setTransferDeleteTx(null)} />
      <ConfirmModal isOpen={!!invoicePaymentDeleteTx} title="Excluir pagamento de fatura" message="Isso remove só o registro financeiro. A fatura vai continuar marcada como paga em Cartões, sem o desconto correspondente. Pra desfazer certo, use 'Reabrir fatura' lá. Excluir mesmo assim?" confirmLabel="Excluir" onConfirm={() => { if (invoicePaymentDeleteTx) deleteRecord(invoicePaymentDeleteTx.id, invoicePaymentDeleteTx.paymentMethod); setInvoicePaymentDeleteTx(null); }} onCancel={() => setInvoicePaymentDeleteTx(null)} />

      {groupDeleteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setGroupDeleteTx(null)}>
          <div className="w-full max-w-md bg-[#141d1a] border border-white/10 rounded-3xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 mx-auto bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-3xl mb-4"><i className="fa-solid fa-trash" /></div>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-2">Excluir parcelamento</h3>
            <p className="text-sm text-[#8fa39a] mb-6">"{groupDeleteTx.description}" faz parte de um parcelamento. Você deseja excluir só esta parcela, ou a compra inteira?</p>
            <div className="flex flex-col gap-2">
              <button className="w-full py-3 rounded-xl bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-colors" onClick={handleDeleteWholeGroup}>Excluir Todas as Parcelas</button>
              <button className="w-full py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors" onClick={handleDeleteJustThis}>Só Esta Parcela</button>
              <button className="w-full py-2 text-[#8fa39a] hover:text-white transition-colors text-sm mt-2" onClick={() => setGroupDeleteTx(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detailsTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setDetailsTx(null)}>
          <div className="w-full max-w-sm bg-[#141d1a] border border-white/10 rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-4 pb-4 border-b border-white/5">Detalhes da Transação</h3>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between"><span className="text-[#8fa39a]">Descrição:</span> <strong className="text-[#f2f0ea] text-right">{detailsTx.description}</strong></div>
              <div className="flex justify-between"><span className="text-[#8fa39a]">Valor:</span> <strong className={detailsTx.type === 'income' ? 'text-[#34d399]' : (detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') ? 'text-[#3b82f6]' : detailsTx.type === 'invoice_payment' ? 'text-[#a78bfa]' : 'text-[#f87171]'}>{formatCurrency(detailsTx.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-[#8fa39a]">Tipo:</span> <span className="text-[#f2f0ea]">{detailsTx.type === 'income' ? 'Receita' : detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in' ? 'Transferência' : detailsTx.type === 'invoice_payment' ? 'Pagamento de Fatura' : 'Despesa'}</span></div>
              {(detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') && (
                <div className="flex justify-between"><span className="text-[#8fa39a]">{detailsTx.type === 'transfer_out' ? 'De → Para:' : 'De ← Para:'}</span> <span className="text-[#f2f0ea]">{accountNameFor(detailsTx.paymentMethod)} {detailsTx.type === 'transfer_out' ? '→' : '←'} {accountNameFor(detailsTx.transferAccountId)}</span></div>
              )}
              {detailsTx.type === 'invoice_payment' && (
                <div className="flex justify-between"><span className="text-[#8fa39a]">Pago com:</span> <span className="text-[#f2f0ea]">{accountNameFor(detailsTx.paymentMethod)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-[#8fa39a]">Data:</span> <span className="text-[#f2f0ea]">{formatDate(detailsTx.date)}</span></div>
              {!(detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') && (
                <div className="flex justify-between"><span className="text-[#8fa39a]">Categoria:</span> <span className="text-[#f2f0ea] bg-white/5 px-2 py-0.5 rounded">{detailsTx.category || '-'}</span></div>
              )}
              <div className="flex justify-between"><span className="text-[#8fa39a]">Pessoa:</span> <span className="text-[#f2f0ea]">{detailsTx.person}</span></div>
              
              {detailsTx.totalInstallments && (
                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex justify-between mb-1"><span className="text-[#8fa39a]">Parcela:</span> <strong className="text-[#e3b04b]">{detailsTx.installmentIndex} de {detailsTx.totalInstallments}</strong></div>
                  <div className="flex justify-between"><span className="text-[#8fa39a]">Total:</span> <span className="text-[#f2f0ea]">{formatCurrency(detailsTx.totalPurchaseAmount)}</span></div>
                </div>
              )}

              {(detailsTx.createdBy || detailsTx.updatedBy) && (
                <div className="mt-1 pt-3 border-t border-white/5 text-xs text-[#8fa39a] flex flex-col gap-1">
                  {detailsTx.createdBy && (
                    <span>Criado por <strong className="text-[#f2f0ea]">{detailsTx.createdBy}</strong>{detailsTx.createdAt ? ` em ${formatDate(detailsTx.createdAt)}` : ''}</span>
                  )}
                  {detailsTx.updatedBy && detailsTx.updatedAt !== detailsTx.createdAt && (
                    <span>Editado por <strong className="text-[#f2f0ea]">{detailsTx.updatedBy}</strong>{detailsTx.updatedAt ? ` em ${formatDate(detailsTx.updatedAt)}` : ''}</span>
                  )}
                </div>
              )}
            </div>
            <button className="w-full mt-6 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors" onClick={() => setDetailsTx(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
