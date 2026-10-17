import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useForm, Controller } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth, toPersonKeys, generateId } from '../utils/format';
import * as Popover from '@radix-ui/react-popover';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { DatePicker, MonthPicker, MoneyField, NumberField, Tooltip } from '../components/ui';
import { useUIStore } from '../stores/useUIStore';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';
import { useTripState, getTripCurrencySymbol, formatTripRate } from '../utils/travelMode';


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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: 'US$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  ARS: 'ARS',
};

function formatForeignCurrency(tx: Transaction): string | null {
  if (!tx.originalAmount || !tx.currency) return null;
  const code = String(tx.currency).toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] || code;
  const origStr = Number(tx.originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tx.fxRate && Number(tx.fxRate) > 0) {
    const rate = Number(tx.fxRate);
    const decimals = rate < 0.1 ? 4 : 2;
    const rateStr = rate.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${sym} ${origStr} a R$ ${rateStr}`;
  }
  return `${sym} ${origStr}`;
}

function formatForeignCurrencyShort(tx: Transaction): string | null {
  if (!tx.originalAmount || !tx.currency) return null;
  const code = String(tx.currency).toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] || code;
  const origStr = Number(tx.originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym} ${origStr}`;
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
  const { trip, isActive: isTripActiveNow } = useTripState();
  const [txCurrency, setTxCurrency] = useState<string>('BRL');

  const canEdit = hasPermission('transactions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const availableCategories = useMemo(() => [...new Set(transactions.map((tx) => tx.category).filter(Boolean))].sort(), [transactions]);
  const allTags = useMemo(() => [...new Set(transactions.flatMap((tx: any) => Array.isArray(tx.tags) ? tx.tags : []))].sort(), [transactions]);

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors, isSubmitting } } = useForm({
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

  const selectedPeriod = useUIStore((s) => s.selectedPeriod);
  const setSelectedPeriod = useUIStore((s) => s.setSelectedPeriod);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function formatDayHeader(dateStr: string) {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const monthShort = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    if (dateStr === todayStr) {
      return `Hoje, ${d} ${monthShort}`;
    }
    return `${d} ${monthShort}`;
  }

  const filteredBase = useMemo(() =>
    [...transactions]
      .filter((tx) => !pendingDeleteIds.has(tx.id as string))
      .filter((tx) => canAccessPerson(tx.person, tx))
      .filter((tx) => {
        if (!selectedPeriod) return true;
        return (tx.date || '').startsWith(selectedPeriod);
      })
      .filter((tx) => typeFilter === 'all' || (typeFilter === 'transfer' ? (tx.type === 'transfer_out' || tx.type === 'transfer_in') : tx.type === typeFilter))
      .filter((tx) => categoryFilter === 'all' || tx.category === categoryFilter)
      .filter((tx: any) => tagFilter === 'all' || (Array.isArray(tx.tags) && tx.tags.includes(tagFilter)))
      .filter((tx) => !search || tx.description?.toLowerCase().includes(search.toLowerCase()) || tx.category?.toLowerCase().includes(search.toLowerCase())),
    [transactions, pendingDeleteIds, canAccessPerson, selectedPeriod, typeFilter, categoryFilter, tagFilter, search]
  );

  const { summaryIncome, summaryExpense, summaryBalance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredBase.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'transfer_in') inc += amt;
      else if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'invoice_payment') exp += amt;
    });
    return { summaryIncome: inc, summaryExpense: exp, summaryBalance: inc - exp };
  }, [filteredBase]);

  const visible = useMemo(() =>
    filteredBase
      .filter((tx) => !dayFilter || tx.date === dayFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filteredBase, dayFilter]
  );

  const groupedByDay = useMemo(() => {
    const groups: { date: string; dateLabel: string; total: number; items: Transaction[] }[] = [];
    const map = new Map<string, { date: string; dateLabel: string; total: number; items: Transaction[] }>();

    visible.forEach((tx) => {
      const key = tx.date || '';
      if (!map.has(key)) {
        const g = {
          date: key,
          dateLabel: formatDayHeader(key),
          total: 0,
          items: [],
        };
        map.set(key, g);
        groups.push(g);
      }
      const g = map.get(key)!;
      g.items.push(tx);
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'transfer_in') {
        g.total += amt;
      } else {
        g.total -= amt;
      }
    });

    return groups;
  }, [visible, todayStr]);

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
    resetSplitAndInstallments();
    setTxCurrency(isTripActiveNow ? trip.code : 'BRL');
    setTags(isTripActiveNow && trip.tagOn ? ['Viagem'] : []);
    setTagInput(''); setEditingTx(null); setEditingId(null); setShowForm(true);
  }

  function openEdit(tx: any) {
    const isTransfer = tx.type === 'transfer_out' || tx.type === 'transfer_in';
    reset({
      description: tx.description || '', amount: tx.originalAmount ?? tx.installmentAmount ?? tx.amount ?? '',
      type: isTransfer ? 'transfer' : (tx.type || 'expense'), category: tx.category || '', date: tx.date || new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'account', person: tx.person || session?.person || '',
      fromAccount: isTransfer ? (tx.type === 'transfer_out' ? tx.paymentMethod : tx.transferAccountId) : '',
      toAccount: isTransfer ? (tx.type === 'transfer_out' ? tx.transferAccountId : tx.paymentMethod) : '',
    });
    setTxCurrency(tx.currency && tx.currency !== 'BRL' ? tx.currency : 'BRL');
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

      const isForeignExpense = data.type === 'expense' && txCurrency !== 'BRL' && Number(trip.rate) > 0;
      const rawTypedAmt = Number(data.amount) || 0;
      const convertedBrlAmt = isForeignExpense ? Number((rawTypedAmt * Number(trip.rate)).toFixed(2)) : rawTypedAmt;
      const finalTagsList =
        isTripActiveNow && trip.tagOn && data.type === 'expense' && !tags.includes('Viagem')
          ? [...tags, 'Viagem']
          : tags;

      if (paymentMode === 'installments' && installmentsCount >= 2 && !editingId) {
        const rawAmt = convertedBrlAmt;
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
            isSplit, splitDetails: finalSplitDetails, paidBy: finalPaidBy, tags: finalTagsList, userId: session?.id,
          } as Transaction));
        }
        await Promise.all(saves);
        toast.success(`Lançamento parcelado em ${installmentsCount}x de ${formatCurrency(instAmt)}!`);
      } else {
        const record: any = {
          id: editingId || undefined, description: data.description.trim(), amount: convertedBrlAmt, type: data.type,
          category: data.category?.trim() || '', date: data.date, paymentMethod: data.paymentMethod, person: finalPerson,
          personKeys: toPersonKeys(finalPerson), isSplit, splitDetails: finalSplitDetails, paidBy: finalPaidBy, tags: finalTagsList, userId: session?.id,
          invoiceMonth: computeInvoiceMonth(data.date, data.paymentMethod),
          ...(isForeignExpense
            ? {
                originalAmount: rawTypedAmt,
                currency: txCurrency,
                fxRate: Number(trip.rate),
              }
            : {}),
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

    if (loading) return <PageLoading />;
  if (error) return <PageError error={error as Error} title={'Erro ao carregar transações'} />;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-4 sm:pt-6 animate-in fade-in duration-500">
      
      {/* HEADER E AÇÃO PRINCIPAL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink">Transações</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <MonthPicker value={selectedPeriod} onChange={setSelectedPeriod} />
          {canEdit && (
            <button
              onClick={openNew}
              className="px-4 py-2.5 rounded-full bg-pri text-white font-medium text-sm shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
            >
              <i className="fa-solid fa-plus text-xs" /> Nova transação
            </button>
          )}
        </div>
      </div>

      {/* QUADROS DE RESUMO (Receitas, Despesas, Saldo do mês) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-xs font-medium text-muted block mb-1">Receitas</span>
          <strong className="text-xl sm:text-2xl font-bold font-heading text-pri">
            {formatCurrency(summaryIncome)}
          </strong>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-xs font-medium text-muted block mb-1">Despesas</span>
          <strong className="text-xl sm:text-2xl font-bold font-heading text-spendText">
            {formatCurrency(summaryExpense)}
          </strong>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-xs font-medium text-muted block mb-1">Saldo do mês</span>
          <strong className="text-xl sm:text-2xl font-bold font-heading text-ink">
            {formatCurrency(summaryBalance)}
          </strong>
        </div>
      </div>

      {/* ABAS, BUSCA E FILTROS */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6">
        {/* Abas em Cápsula */}
        <div className="flex items-center bg-card border border-border p-1 rounded-full overflow-x-auto scrollbar-none shrink-0">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'expense', label: 'Despesas' },
            { id: 'income', label: 'Receitas' },
            { id: 'transfer', label: 'Transferências' },
          ].map((tab) => {
            const active = typeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setTypeFilter(tab.id); setDayFilter(null); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-pri text-white shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Busca e Botão de Filtros */}
        <div className="flex items-center gap-2 flex-1 md:max-w-md">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-xs" />
            <input
              type="text"
              placeholder="Buscar por descrição, categoria ou tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full border border-border bg-card text-ink text-sm outline-none focus:border-pri transition-colors placeholder:text-muted/70"
            />
          </div>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="px-4 py-2 rounded-full border border-border bg-card text-ink text-sm font-medium hover:bg-priSoft/20 transition-colors flex items-center gap-1.5 shrink-0">
                <i className="fa-solid fa-sliders text-xs text-muted" />
                Filtros
                {(categoryFilter !== 'all' || tagFilter !== 'all' || viewMode === 'calendar') && (
                  <span className="w-2 h-2 rounded-full bg-pri" />
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 w-72 p-4 bg-card border border-border rounded-2xl shadow-xl animate-in fade-in zoom-in-95 text-ink flex flex-col gap-3"
                sideOffset={8}
                align="end"
              >
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-sm font-bold font-heading">Filtros</span>
                  {(categoryFilter !== 'all' || tagFilter !== 'all' || viewMode === 'calendar' || search) && (
                    <button
                      onClick={() => { setCategoryFilter('all'); setTagFilter('all'); setViewMode('list'); setSearch(''); }}
                      className="text-xs text-pri hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-muted uppercase">Visualização</label>
                  <div className="flex bg-border/30 rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                        viewMode === 'list' ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <i className="fa-solid fa-list" /> Lista
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('calendar')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                        viewMode === 'calendar' ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <i className="fa-solid fa-calendar-days" /> Calendário
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-muted uppercase">Categoria</label>
                  <CustomSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="all">Todas as categorias</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </CustomSelect>
                </div>

                {allTags.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-muted uppercase">Tag</label>
                    <CustomSelect value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                      <option value="all">Todas as tags</option>
                      {allTags.map((t) => (
                        <option key={t} value={t}>#{t}</option>
                      ))}
                    </CustomSelect>
                  </div>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      {dayFilter && (
        <div className="flex items-center gap-2 mb-4 bg-priSoft/40 text-pri px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold w-fit">
          <i className="fa-solid fa-calendar-day" /> Filtrado por {formatDate(dayFilter)}
          <button onClick={() => setDayFilter(null)} className="hover:opacity-75 ml-2"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}

      {viewMode === 'calendar' && (
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="w-9 h-9 rounded-lg bg-card border border-border hover:bg-priSoft/20 text-muted hover:text-ink flex items-center justify-center"><i className="fa-solid fa-chevron-left text-xs" /></button>
            <strong className="text-ink capitalize font-heading">{calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
            <button onClick={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="w-9 h-9 rounded-lg bg-card border border-border hover:bg-priSoft/20 text-muted hover:text-ink flex items-center justify-center"><i className="fa-solid fa-chevron-right text-xs" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (<div key={i} className="text-center text-[10px] font-bold text-muted uppercase">{d}</div>))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((cell, i) => cell === null ? (
              <div key={`empty-${i}`} />
            ) : (
              <button
                key={cell.dateStr}
                onClick={() => setDayFilter(cell.dateStr === dayFilter ? null : cell.dateStr)}
                className={`aspect-square rounded-xl p-1 sm:p-2 flex flex-col items-center justify-start text-left transition-colors ${dayFilter === cell.dateStr ? 'bg-priSoft/50 ring-2 ring-pri' : 'bg-card border border-border hover:bg-priSoft/20'}`}
              >
                <span className="text-xs sm:text-sm font-bold text-ink">{cell.day}</span>
                {cell.expense > 0 && <span className="text-[8px] sm:text-[10px] font-medium text-spendText leading-tight mt-auto">-{formatCurrency(cell.expense).replace('R$', '')}</span>}
                {cell.income > 0 && <span className="text-[8px] sm:text-[10px] font-medium text-pri leading-tight">+{formatCurrency(cell.income).replace('R$', '')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PAINEL DE SELEÇÃO EM MASSA */}
      {selectedIds.size > 0 && (
        <div className="bg-spendSoft/20 border border-spendText/20 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <span className="text-spendText font-bold">{selectedIds.size} selecionada(s)</span>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button className="w-full sm:w-auto px-4 py-2 rounded-xl bg-card border border-border text-ink hover:bg-border/30 transition-colors font-semibold text-xs flex items-center justify-center gap-2" onClick={() => setBulkEditOpen(true)}>
              <i className="fa-solid fa-pen" /> Editar selecionadas
            </button>
            <button className="w-full sm:w-auto px-4 py-2 rounded-xl bg-spendText text-white hover:opacity-90 transition-opacity font-semibold text-xs flex items-center justify-center gap-2" onClick={() => setConfirmBulkDelete(true)}>
              <i className="fa-solid fa-trash" /> Excluir selecionadas
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE TRANSAÇÕES AGRUPADA POR DIA */}
      {viewMode === 'calendar' && !dayFilter ? null : visible.length === 0 ? (
        <EmptyState icon="fa-receipt" title={'Nenhuma transação encontrada'} description="Ajuste os filtros ou registre um novo lançamento no sistema." actionLabel={canEdit ? 'Nova transação' : undefined} onAction={canEdit ? openNew : undefined} />
      ) : (
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-xs divide-y divide-border/60">
          {groupedByDay.map((group) => (
            <div key={group.date} className="pt-4 first:pt-0 pb-2">
              {/* Header do dia */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold font-heading text-ink">{group.dateLabel}</span>
                <span className="text-xs font-medium text-muted">
                  {group.total > 0 ? `+ ${formatCurrency(group.total)}` : group.total < 0 ? `- ${formatCurrency(Math.abs(group.total))}` : formatCurrency(0)}
                </span>
              </div>

              {/* Lançamentos do dia */}
              <div className="flex flex-col divide-y divide-border/30">
                {group.items.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => setDetailsTx(tx)}
                    className="group flex items-center justify-between gap-3 py-3 px-2 sm:px-3 -mx-2 sm:-mx-3 rounded-xl hover:bg-priSoft/20 transition-colors cursor-pointer"
                  >
                    {/* Ícone + Descrição e Categoria */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base ${
                        tx.type === 'income'
                          ? 'bg-priSoft/50 text-pri'
                          : (tx.type === 'transfer_out' || tx.type === 'transfer_in')
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : tx.type === 'invoice_payment'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          : 'bg-spendSoft/30 text-spendText'
                      }`}>
                        <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-sm sm:text-base truncate">{tx.description}</span>
                          {tx.groupId && (
                            <span className="inline-flex items-center text-[10px] text-muted font-medium">
                              <i className="fa-solid fa-layer-group text-[9px]" />
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted truncate">{tx.category || (tx.type === 'income' ? 'Receita' : 'Geral')}</span>
                      </div>
                    </div>

                    {/* Meio: Conta / Cartão e Etiquetas */}
                    <div className="hidden md:flex items-center gap-2 min-w-0 shrink-0">
                      <span className="text-xs text-muted truncate">{accountNameFor(tx.paymentMethod)}</span>
                      {tx.person && tx.person !== session?.person && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-border/40 text-muted">{tx.person}</span>
                      )}
                      {Array.isArray(tx.tags) && tx.tags.map((t: string) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-priSoft/30 text-pri">#{t}</span>
                      ))}
                    </div>

                    {/* Direita: Valor, Câmbio e Ações */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <strong className={`block text-sm sm:text-base font-bold font-heading ${
                          tx.type === 'income'
                            ? 'text-pri'
                            : (tx.type === 'transfer_out' || tx.type === 'transfer_in')
                            ? 'text-ink'
                            : 'text-spendText'
                        }`}>
                          {tx.type === 'income' ? '+ ' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? '' : '- '}
                          {formatCurrency(tx.amount)}
                        </strong>
                        {formatForeignCurrencyShort(tx) && (
                          <span className="text-xs text-muted block -mt-0.5">
                            {formatForeignCurrencyShort(tx)}
                          </span>
                        )}
                      </div>

                      {/* Botões de Ação ao Passar o Mouse */}
                      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <>
                            {!tx.transferId && !tx.paidCardId && (
                              <Tooltip content="Duplicar">
                                <button
                                  onClick={() => handleDuplicate(tx)}
                                  className="w-7 h-7 rounded-lg text-muted hover:text-ink hover:bg-card flex items-center justify-center transition-colors"
                                  aria-label="Duplicar"
                                >
                                  <i className="fa-solid fa-copy text-xs" />
                                </button>
                              </Tooltip>
                            )}
                            <button
                              onClick={() => openEdit(tx)}
                              className="w-7 h-7 rounded-lg text-muted hover:text-ink hover:bg-card flex items-center justify-center transition-colors"
                              aria-label="Editar"
                            >
                              <i className="fa-solid fa-pen text-xs" />
                            </button>
                            <button
                              onClick={() => requestDelete(tx)}
                              className="w-7 h-7 rounded-lg text-muted hover:text-spendText hover:bg-card flex items-center justify-center transition-colors"
                              aria-label="Excluir"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE TRANSAÇÃO (FORMULÁRIO FULL RESPONSIVO) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowForm(false)}>
          <form className="w-full max-w-[500px] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 text-ink" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3 className="text-xl font-bold font-heading text-ink mb-2">{editingId ? 'Editar Transação' : 'Nova Transação'}</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase font-bold text-muted">Descrição</label>
              <input {...register('description')} placeholder="Ex: Supermercado" className="w-full p-3 rounded-xl border border-border bg-card text-ink focus:border-pri outline-none transition-colors" />
              {errors.description && <span className="text-spendText text-xs mt-1">{(errors.description as any).message}</span>}
              {smartSuggestion && (
                <button type="button" onClick={applySuggestion} className="mt-1 text-left text-xs bg-priSoft/40 text-pri hover:bg-priSoft/60 rounded-lg px-3 py-2 transition-colors">
                  <i className="fa-solid fa-lightbulb mr-1.5" />
                  Última vez: {smartSuggestion.category || 'sem categoria'} &bull; {formatCurrency(smartSuggestion.amount)} &bull; {accountNameFor(smartSuggestion.paymentMethod)}. Usar esses dados?
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-muted">Tipo</label>
                <Controller name="type" control={control} render={({ field }) => (
                  <CustomSelect value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    <option value="expense">Despesa (-)</option><option value="income">Receita (+)</option><option value="transfer">Transferência entre contas</option>
                  </CustomSelect>
                )} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-muted">Data {paymentMode === 'installments' ? '(1ª)' : ''}</label>
                <Controller name="date" control={control} render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} />
                )} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs uppercase font-bold text-muted">
                  Valor {paymentMode === 'installments' && installmentValueType === 'total' ? '(Total da compra)' : ''}
                  {watchedType === 'expense' && txCurrency !== 'BRL' ? ` (${getTripCurrencySymbol(txCurrency)})` : ''}
                </label>
                {isTripActiveNow && watchedType === 'expense' && (
                  <div className="inline-flex items-center gap-1 rounded-pill bg-seg p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTxCurrency('BRL')}
                      className={`px-2.5 py-0.5 rounded-pill transition-colors ${
                        txCurrency === 'BRL' ? 'bg-segOn text-ink shadow-xs' : 'text-muted'
                      }`}
                    >
                      R$ (BRL)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxCurrency(trip.code)}
                      className={`px-2.5 py-0.5 rounded-pill transition-colors ${
                        txCurrency === trip.code ? 'bg-segOn text-ink shadow-xs' : 'text-muted'
                      }`}
                    >
                      {getTripCurrencySymbol(trip.code)} ({trip.code})
                    </button>
                  </div>
                )}
              </div>
              <Controller name="amount" control={control} render={({ field }) => (
                <MoneyField value={field.value} onChange={(e) => field.onChange(e.target.value)} />
              )} />
              {watchedType === 'expense' && txCurrency !== 'BRL' && Number(watchedAmount) > 0 && (
                <span className="text-xs font-semibold text-pri mt-0.5">
                  Converte para {formatCurrency(Number(watchedAmount) * Number(trip.rate))} ({formatTripRate(trip.rate)})
                </span>
              )}
              {errors.amount && <span className="text-spendText text-xs mt-1">{(errors.amount as any).message}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {watchedType !== 'transfer' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase font-bold text-muted">Categoria</label>
                  <input {...register('category')} placeholder="Ex: Alimentação" className="w-full p-3 rounded-xl border border-border bg-card text-ink focus:border-pri outline-none transition-colors" />
                </div>
              )}
              {watchedType === 'transfer' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase font-bold text-muted">De (origem)</label>
                    <Controller name="fromAccount" control={control} render={({ field }) => (
                      <CustomSelect value={field.value} onChange={(e) => field.onChange(e.target.value)} disabled={!!editingId}>
                        <option value="">Selecione</option>
                        {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}
                      </CustomSelect>
                    )} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase font-bold text-muted">Para (destino)</label>
                    <Controller name="toAccount" control={control} render={({ field }) => (
                      <CustomSelect value={field.value} onChange={(e) => field.onChange(e.target.value)} disabled={!!editingId}>
                        <option value="">Selecione</option>
                        {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}
                      </CustomSelect>
                    )} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase font-bold text-muted">Conta / Cartão</label>
                  <Controller name="paymentMethod" control={control} render={({ field }) => (
                    <CustomSelect value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                      <option value="account">Principal</option>
                      <optgroup label="Contas">{accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}</optgroup>
                      <optgroup label="Cartões">{cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>{c.name}</option>))}</optgroup>
                    </CustomSelect>
                  )} />
                </div>
              )}
            </div>

            {/* SEÇÃO PARCELAMENTO */}
            {!editingId && watchedType === 'expense' && (
              <div className="mt-2 p-4 bg-border/20 rounded-2xl border border-border">
                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-ink">
                  <input type="checkbox" checked={paymentMode === 'installments'} onChange={(e) => setPaymentMode(e.target.checked ? 'installments' : 'single')} className="w-4 h-4 accent-pri" />
                  Parcelar essa compra
                </label>
                {paymentMode === 'installments' && (
                  <div className="flex gap-3 mt-4 animate-in slide-in-from-top-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-muted block mb-1">Parcelas</label>
                      <NumberField min={2} max={48} value={installmentsCount} onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)} />
                    </div>
                    <div className="flex-[2]">
                      <label className="text-[10px] uppercase font-bold text-muted block mb-1">Valor informado</label>
                      <CustomSelect value={installmentValueType} onChange={(e) => setInstallmentValueType(e.target.value)}>
                        <option value="total">Total da compra</option><option value="per">Valor da parcela</option>
                      </CustomSelect>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO RATEIO */}
            {watchedType !== 'transfer' && (
            <div className="mt-2 p-4 bg-border/20 rounded-2xl border border-border">
              <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-ink">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} className="w-4 h-4 accent-pri" />
                Dividir com outras pessoas
              </label>
              {isSplit ? (
                <div className="mt-4 animate-in slide-in-from-top-2">
                  <div className="mb-3">
                    <label className="text-[10px] uppercase font-bold text-muted block mb-1">Quem pagou</label>
                    <CustomSelect value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                      {availablePersons.map((pName) => (<option key={pName} value={pName}>{pName}</option>))}
                    </CustomSelect>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted">Marque quem participa:</span>
                    <button type="button" onClick={splitEqually} className="text-xs font-bold text-pri bg-priSoft/40 px-2 py-1 rounded hover:bg-priSoft/60 transition-colors"><i className="fa-solid fa-calculator" /> Dividir igual</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {availablePersons.map((pName) => {
                      const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                      return (
                        <div key={pName} className="flex items-center justify-between p-2 rounded-lg hover:bg-border/30">
                          <label className="flex items-center gap-3 text-sm text-ink cursor-pointer">
                            <input type="checkbox" checked={isChecked} onChange={(e) => handleSplitCheck(pName, e.target.checked)} className="accent-pri" /> {pName}
                          </label>
                          <div className="w-32">
                            <MoneyField disabled={!isChecked} value={splitItems[pName] || ''} onChange={(e) => handleSplitValueChange(pName, e.target.value)} placeholder="0,00" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="text-[10px] uppercase font-bold text-muted block mb-1">Atribuir a</label>
                  <input {...register('person')} placeholder={session.person} className="w-full p-2.5 rounded-lg border border-border bg-card text-ink focus:border-pri outline-none transition-colors" />
                </div>
              )}
            </div>
            )}

            {watchedType !== 'transfer' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-muted">Tags</label>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                    placeholder="Ex: viagem (Enter pra adicionar)"
                    className="flex-1 p-2.5 rounded-xl border border-border bg-card text-ink focus:border-pri outline-none transition-colors"
                  />
                  <button type="button" onClick={addTag} className="px-4 rounded-xl bg-border/40 hover:bg-border/60 text-ink font-bold">Add</button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1.5 bg-priSoft/40 text-pri text-xs font-bold px-2.5 py-1 rounded-full">
                        #{t} <button type="button" onClick={() => removeTag(t)} className="hover:opacity-75"><i className="fa-solid fa-xmark" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-6 py-3 rounded-full border border-border text-ink font-semibold hover:bg-border/20 transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="w-full sm:flex-1 px-6 py-3 rounded-full bg-pri text-white font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isSubmitting ? <><i className="fa-solid fa-spinner fa-spin" /> Salvando...</> : <><i className="fa-solid fa-check" /> Salvar Transação</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAIS: CONFIRMAÇÃO DE EXCLUSÃO, EDIÇÃO EM MASSA E DETALHES */}
      <ConfirmModal isOpen={!!deleteId} title={'Excluir'} message="Tem certeza que deseja excluir esta transação?" confirmLabel="Excluir" onConfirm={handleConfirmDelete} onCancel={() => setDeleteId(null)} />
      <ConfirmModal isOpen={confirmBulkDelete} title={'Excluir selecionadas'} message={`Excluir ${selectedIds.size} transação(ões)?`} confirmLabel="Excluir" onConfirm={handleConfirmBulkDelete} onCancel={() => setConfirmBulkDelete(false)} />

      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setBulkEditOpen(false)}>
          <div className="bg-card border border-border p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-heading mb-1">Editar {selectedIds.size} transação(ões)</h3>
            <p className="text-xs text-muted -mt-2">Deixe em branco o que não quiser alterar.</p>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted block mb-1">Nova categoria</label>
              <input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="Ex: Alimentação" className="w-full p-3 rounded-xl border border-border bg-card text-ink focus:border-pri outline-none transition-colors" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted block mb-1">Nova pessoa</label>
              <input value={bulkPerson} onChange={(e) => setBulkPerson(e.target.value)} placeholder="Ex: Marcos" className="w-full p-3 rounded-xl border border-border bg-card text-ink focus:border-pri outline-none transition-colors" />
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setBulkEditOpen(false)} className="flex-1 border border-border hover:bg-border/20 py-3 rounded-full font-bold transition-colors">Cancelar</button>
              <button onClick={handleBulkEdit} className="flex-1 bg-pri text-white font-bold py-3 rounded-full hover:opacity-95 transition-opacity">Aplicar</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal isOpen={!!transferDeleteTx} title={'Excluir transferência'} message="Isso remove as duas pontas da transferência (origem e destino). Deseja continuar?" confirmLabel="Excluir" onConfirm={handleConfirmDeleteTransfer} onCancel={() => setTransferDeleteTx(null)} />
      <ConfirmModal isOpen={!!invoicePaymentDeleteTx} title={'Excluir pagamento de fatura'} message="Isso remove só o registro financeiro. A fatura vai continuar marcada como paga em Cartões, sem o desconto correspondente. Pra desfazer certo, use 'Reabrir fatura' lá. Excluir mesmo assim?" confirmLabel="Excluir" onConfirm={() => { if (invoicePaymentDeleteTx) deleteRecord(invoicePaymentDeleteTx.id, invoicePaymentDeleteTx.paymentMethod); setInvoicePaymentDeleteTx(null); }} onCancel={() => setInvoicePaymentDeleteTx(null)} />

      {groupDeleteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setGroupDeleteTx(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl text-center text-ink" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 mx-auto bg-spendSoft/30 text-spendText rounded-full flex items-center justify-center text-3xl mb-4"><i className="fa-solid fa-trash" /></div>
            <h3 className="text-xl font-bold font-heading text-ink mb-2">Excluir parcelamento</h3>
            <p className="text-sm text-muted mb-6">"{groupDeleteTx.description}" faz parte de um parcelamento. Você deseja excluir só esta parcela, ou a compra inteira?</p>
            <div className="flex flex-col gap-2">
              <button className="w-full py-3 rounded-full bg-spendText text-white font-bold hover:opacity-90 transition-opacity" onClick={handleDeleteWholeGroup}>Excluir Todas as Parcelas</button>
              <button className="w-full py-3 rounded-full border border-border text-ink font-bold hover:bg-border/20 transition-colors" onClick={handleDeleteJustThis}>Só Esta Parcela</button>
              <button className="w-full py-2 text-muted hover:text-ink transition-colors text-sm mt-2" onClick={() => setGroupDeleteTx(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detailsTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setDetailsTx(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-2xl text-ink" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-heading text-ink mb-4 pb-4 border-b border-border">Detalhes da Transação</h3>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Descrição:</span> <strong className="text-ink text-right">{detailsTx.description}</strong></div>
              <div className="flex justify-between"><span className="text-muted">Valor:</span> <strong className={detailsTx.type === 'income' ? 'text-pri' : (detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') ? 'text-ink' : detailsTx.type === 'invoice_payment' ? 'text-purple-600 dark:text-purple-400' : 'text-spendText'}>{formatCurrency(detailsTx.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-muted">Tipo:</span> <span className="text-ink">{detailsTx.type === 'income' ? 'Receita' : detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in' ? 'Transferência' : detailsTx.type === 'invoice_payment' ? 'Pagamento de Fatura' : 'Despesa'}</span></div>
              {(detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') && (
                <div className="flex justify-between"><span className="text-muted">{detailsTx.type === 'transfer_out' ? 'De → Para:' : 'De ← Para:'}</span> <span className="text-ink">{accountNameFor(detailsTx.paymentMethod)} {detailsTx.type === 'transfer_out' ? '→' : '←'} {accountNameFor(detailsTx.transferAccountId)}</span></div>
              )}
              {detailsTx.type === 'invoice_payment' && (
                <div className="flex justify-between"><span className="text-muted">Pago com:</span> <span className="text-ink">{accountNameFor(detailsTx.paymentMethod)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted">Data:</span> <span className="text-ink">{formatDate(detailsTx.date)}</span></div>
              {!(detailsTx.type === 'transfer_out' || detailsTx.type === 'transfer_in') && (
                <div className="flex justify-between"><span className="text-muted">Categoria:</span> <span className="text-ink bg-border/30 px-2 py-0.5 rounded">{detailsTx.category || '-'}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted">Pessoa:</span> <span className="text-ink">{detailsTx.person}</span></div>
              
              {detailsTx.totalInstallments && (
                <div className="mt-2 p-3 bg-border/20 rounded-xl border border-border">
                  <div className="flex justify-between mb-1"><span className="text-muted">Parcela:</span> <strong className="text-pri">{detailsTx.installmentIndex} de {detailsTx.totalInstallments}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">Total:</span> <span className="text-ink">{formatCurrency(detailsTx.totalPurchaseAmount)}</span></div>
                </div>
              )}

              {(detailsTx.createdBy || detailsTx.updatedBy) && (
                <div className="mt-1 pt-3 border-t border-border text-xs text-muted flex flex-col gap-1">
                  {detailsTx.createdBy && (
                    <span>Criado por <strong className="text-ink">{detailsTx.createdBy}</strong>{detailsTx.createdAt ? ` em ${formatDate(detailsTx.createdAt)}` : ''}</span>
                  )}
                  {detailsTx.updatedBy && detailsTx.updatedAt !== detailsTx.createdAt && (
                    <span>Editado por <strong className="text-ink">{detailsTx.updatedBy}</strong>{detailsTx.updatedAt ? ` em ${formatDate(detailsTx.updatedAt)}` : ''}</span>
                  )}
                </div>
              )}
            </div>
            <button className="w-full mt-6 py-3 rounded-full border border-border text-ink font-bold hover:bg-border/20 transition-colors" onClick={() => setDetailsTx(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
