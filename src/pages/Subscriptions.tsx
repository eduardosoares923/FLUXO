import React, { useState, useMemo, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../stores/useUIStore';
import {
  formatCurrency,
  maskCurrency,
  getCardInvoiceMonth,
  normalize,
  toPersonKeys,
} from '../utils/format';
import { toast } from '../stores/useToastStore';
import { Account, Card, Person, Transaction, SplitDetail } from '../types';
import { Select } from '../components/ui/Select';
import { MoneyField } from '../components/ui/MoneyField';
import { NumberField } from '../components/ui/NumberField';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Switch } from '../components/ui/Switch';
import { useTripState } from '../utils/travelMode';

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const DEFAULT_CATEGORIES = [
  'Assinaturas',
  'Moradia',
  'Contas Fixas',
  'Educação',
  'Saúde',
  'Lazer',
  'Transporte',
  'Alimentação',
  'Outros',
];

interface SubscriptionItem {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  category: string;
  paymentMethod: string;
  person: string;
  personKeys?: string[];
  active: boolean;
  isSplit?: boolean;
  splitDetails?: SplitDetail[];
  launchedMonths?: string[];
  createdAt?: string;
}

export function Subscriptions() {
  const { data: subscriptions, add, update, remove } = useCollection<SubscriptionItem>('subscriptions');
  const { data: accounts, update: updateAccount } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<Card>('cards');
  const { data: personsList } = useCollection<Person>('persons');
  const { data: transactions, add: addTx } = useCollection<Transaction>('transactions');
  const { data: settingsData } = useCollection<any>('settings');

  const {
    session,
    canAccessPerson,
    canAccessTransaction,
    canAccessAccount,
    canAccessCard,
  } = useAuth();
  const { privacyMode, selectedPeriod } = useUIStore();
  const { trip, isActive: isTripActiveNow } = useTripState();

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'accounts' | 'cards'>('all');
  const [personFilter, setPersonFilter] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionItem | null>(null);
  const [launchingMonth, setLaunchingMonth] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [dueDay, setDueDay] = useState<number>(10);
  const [category, setCategory] = useState('Assinaturas');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [person, setPerson] = useState(session?.person || '');
  const [active, setActive] = useState(true);
  const [isSplit, setIsSplit] = useState(false);
  const [splitPeople, setSplitPeople] = useState<string[]>([]);

  const currentMonthStr = useMemo(() => {
    if (selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)) {
      return selectedPeriod;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedPeriod]);

  const [viewYear, viewMonth0] = useMemo(() => {
    const [y, m] = currentMonthStr.split('-').map(Number);
    return [y, (m || 1) - 1];
  }, [currentMonthStr]);

  const nextMonthName = useMemo(() => {
    const d = new Date(viewYear, viewMonth0 + 1, 1);
    return MONTH_NAMES[d.getMonth()];
  }, [viewYear, viewMonth0]);

  const currentMonthName = MONTH_NAMES[viewMonth0] || 'mês';

  const visibleAccounts = useMemo(
    () => (accounts || []).filter((a) => canAccessAccount(a)),
    [accounts, canAccessAccount]
  );
  const visibleCards = useMemo(
    () => (cards || []).filter((c) => canAccessCard(c)),
    [cards, canAccessCard]
  );

  const allPersonNames = useMemo(
    () => (personsList || []).map((p) => p.name).filter((n): n is string => Boolean(n)),
    [personsList]
  );

  const accessiblePersonNames = useMemo(
    () => allPersonNames.filter((n) => canAccessPerson(n)),
    [allPersonNames, canAccessPerson]
  );

  useEffect(() => {
    if (accessiblePersonNames.length === 1) {
      setPersonFilter(accessiblePersonNames[0]);
    } else if (personFilter !== 'all' && !accessiblePersonNames.includes(personFilter)) {
      setPersonFilter('all');
    }
  }, [accessiblePersonNames, personFilter]);

  const categoriesList = useMemo(() => {
    const catDoc = (settingsData || []).find((d: any) => d.id === 'categories');
    const custom: string[] = Array.isArray(catDoc?.list) ? catDoc.list : [];
    const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...custom]));
    return combined;
  }, [settingsData]);

  const accessibleSubs = useMemo(() => {
    return (subscriptions || []).filter((s) => {
      if (s.person && canAccessPerson(s.person)) return true;
      if (s.isSplit && Array.isArray(s.splitDetails)) {
        return s.splitDetails.some((d) => canAccessPerson(d.person));
      }
      return canAccessTransaction(s as any);
    });
  }, [subscriptions, canAccessPerson, canAccessTransaction]);

  const isLaunchedInMonth = (sub: SubscriptionItem, ym: string) => {
    const inArray = Array.isArray(sub.launchedMonths) && sub.launchedMonths.includes(ym);
    const inTx = (transactions || []).some(
      (tx) =>
        (tx.subscriptionId === sub.id ||
          (tx.isSubscription && normalize(tx.description) === normalize(sub.name))) &&
        String(tx.date || '').startsWith(ym)
    );
    return inArray || inTx;
  };

  const getMyShare = (sub: SubscriptionItem): { isShared: boolean; otherNames: string[]; myAmount: number } => {
    const total = Number(sub.amount) || 0;
    if (!sub.isSplit || !Array.isArray(sub.splitDetails) || sub.splitDetails.length <= 1) {
      return { isShared: false, otherNames: [], myAmount: total };
    }
    const myPerson = session?.person || sub.person || '';
    const myDetail = sub.splitDetails.find((d) => normalize(d.person) === normalize(myPerson));
    const others = sub.splitDetails
      .map((d) => d.person)
      .filter((p) => normalize(p) !== normalize(myPerson));
    return {
      isShared: true,
      otherNames: others,
      myAmount: myDetail ? Number(myDetail.amount) : total / sub.splitDetails.length,
    };
  };

  const filteredSubs = useMemo(() => {
    return accessibleSubs
      .filter((s) => {
        if (personFilter !== 'all') {
          const inMain = normalize(s.person) === normalize(personFilter);
          const inSplit =
            s.isSplit &&
            Array.isArray(s.splitDetails) &&
            s.splitDetails.some((d) => normalize(d.person) === normalize(personFilter));
          if (!inMain && !inSplit) return false;
        }
        if (methodFilter === 'accounts' && !String(s.paymentMethod || '').startsWith('acc_')) {
          return false;
        }
        if (methodFilter === 'cards' && !String(s.paymentMethod || '').startsWith('card_')) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = normalize(searchQuery);
          const matchName = normalize(s.name).includes(q);
          const matchCat = normalize(s.category).includes(q);
          if (!matchName && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => (Number(a.dueDay) || 1) - (Number(b.dueDay) || 1));
  }, [accessibleSubs, personFilter, methodFilter, searchQuery]);

  const stats = useMemo(() => {
    const activeList = filteredSubs.filter((s) => s.active !== false);
    let expectedTotal = 0;
    let launchedTotal = 0;
    let launchedCount = 0;
    let pendingTotal = 0;
    let dueSoonCount = 0;

    const now = new Date();
    const todayDay = now.getDate();
    const cutoffDay = Math.min(31, todayDay + 7);

    activeList.forEach((s) => {
      const val = Number(s.amount) || 0;
      expectedTotal += val;
      if (isLaunchedInMonth(s, currentMonthStr)) {
        launchedTotal += val;
        launchedCount += 1;
      } else {
        pendingTotal += val;
        const day = Number(s.dueDay) || 1;
        if (day <= cutoffDay) {
          dueSoonCount += 1;
        }
      }
    });

    return {
      activeCount: activeList.length,
      expectedTotal,
      launchedTotal,
      launchedCount,
      pendingTotal,
      dueSoonCount,
      cutoffDay,
    };
  }, [filteredSubs, currentMonthStr, transactions]);

  const getPaymentMethodLabel = (pm?: string) => {
    if (!pm) return 'Sem conta';
    if (pm.startsWith('acc_')) {
      const id = pm.replace('acc_', '');
      const acc = (accounts || []).find((a) => a.id === id);
      return acc ? acc.name : 'Conta';
    }
    if (pm.startsWith('card_')) {
      const id = pm.replace('card_', '');
      const card = (cards || []).find((c) => c.id === id);
      return card ? `Cartão ${card.name}` : 'Cartão';
    }
    return pm;
  };

  const getStatusBadge = (sub: SubscriptionItem) => {
    if (sub.active === false) {
      return {
        label: 'Pausada',
        className: 'bg-neutral text-muted',
      };
    }
    if (isLaunchedInMonth(sub, currentMonthStr)) {
      return {
        label: 'Lançada',
        className: 'bg-priSoft text-priInk',
      };
    }
    const now = new Date();
    const nowYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const due = Number(sub.dueDay) || 1;

    if (currentMonthStr === nowYM) {
      const diff = due - now.getDate();
      if (diff === 0) {
        return { label: 'Vence hoje', className: 'bg-spendSoft text-spendText' };
      }
      if (diff > 0 && diff <= 7) {
        return {
          label: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`,
          className: 'bg-spendSoft text-spendText',
        };
      }
      if (diff < 0) {
        return {
          label: `Dia ${String(due).padStart(2, '0')}`,
          className: 'bg-spendSoft text-spendText',
        };
      }
    }

    return {
      label: 'Aguardando',
      className: 'bg-neutral text-muted',
    };
  };

  // Calendar grid for right column
  const calendarCells = useMemo(() => {
    const firstDayWeek = new Date(viewYear, viewMonth0, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth0 + 1, 0).getDate();
    const activeSubs = filteredSubs.filter((s) => s.active !== false);

    const cells: ({
      day: number;
      status: 'none' | 'launched' | 'pending';
    } | null)[] = [];

    for (let i = 0; i < firstDayWeek; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const subsOnDay = activeSubs.filter((s) => (Number(s.dueDay) || 1) === d);
      if (subsOnDay.length === 0) {
        cells.push({ day: d, status: 'none' });
      } else {
        const allLaunched = subsOnDay.every((s) => isLaunchedInMonth(s, currentMonthStr));
        cells.push({
          day: d,
          status: allLaunched ? 'launched' : 'pending',
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth0, filteredSubs, currentMonthStr, transactions]);

  const openNewModal = () => {
    setEditingSub(null);
    setName('');
    setAmount(0);
    setDueDay(10);
    setCategory('Assinaturas');
    const defaultMethod = visibleAccounts[0]?.id
      ? `acc_${visibleAccounts[0].id}`
      : visibleCards[0]?.id
        ? `card_${visibleCards[0].id}`
        : '';
    setPaymentMethod(defaultMethod);
    const defaultPerson = session?.person || accessiblePersonNames[0] || '';
    setPerson(defaultPerson);
    setActive(true);
    setIsSplit(false);
    setSplitPeople(defaultPerson ? [defaultPerson] : []);
    setIsModalOpen(true);
  };

  const openEditModal = (sub: SubscriptionItem) => {
    setEditingSub(sub);
    setName(sub.name || '');
    setAmount(Number(sub.amount) || 0);
    setDueDay(Number(sub.dueDay) || 10);
    setCategory(sub.category || 'Assinaturas');
    setPaymentMethod(sub.paymentMethod || '');
    setPerson(sub.person || session?.person || '');
    setActive(sub.active !== false);
    const hasSplit = Boolean(sub.isSplit && Array.isArray(sub.splitDetails) && sub.splitDetails.length > 0);
    setIsSplit(hasSplit);
    if (hasSplit && sub.splitDetails) {
      setSplitPeople(sub.splitDetails.map((d) => d.person));
    } else {
      setSplitPeople(sub.person ? [sub.person] : []);
    }
    setIsModalOpen(true);
  };

  const toggleSplitPerson = (pName: string) => {
    setSplitPeople((prev) =>
      prev.includes(pName) ? prev.filter((x) => x !== pName) : [...prev, pName]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || amount <= 0) {
      toast.warning('Preencha o nome e um valor maior que zero.');
      return;
    }
    if (!paymentMethod) {
      toast.warning('Selecione uma conta ou cartão.');
      return;
    }

    const safeDay = Math.min(31, Math.max(1, Number(dueDay) || 1));
    let splitDetails: SplitDetail[] = [];
    if (isSplit && splitPeople.length > 0) {
      const share = Number((amount / splitPeople.length).toFixed(2));
      splitDetails = splitPeople.map((p) => ({ person: p, amount: share }));
    }

    const personField = isSplit && splitPeople.length > 0 ? splitPeople.join(', ') : person;
    const payload: any = {
      name: name.trim(),
      amount: Number(amount),
      dueDay: safeDay,
      category: category || 'Assinaturas',
      paymentMethod,
      person: personField,
      personKeys: toPersonKeys(personField),
      active,
      isSplit: Boolean(isSplit && splitPeople.length > 0),
      splitDetails,
    };

    try {
      if (editingSub?.id) {
        await update(editingSub.id, payload);
        toast.success('Fixa atualizada.');
      } else {
        payload.launchedMonths = [];
        payload.createdAt = new Date().toISOString();
        await add(payload);
        toast.success('Nova fixa cadastrada.');
      }
      setIsModalOpen(false);
    } catch {
      toast.error('Não foi possível salvar a fixa.');
    }
  };

  const launchSingleSub = async (sub: SubscriptionItem, silent = false): Promise<boolean> => {
    if (isLaunchedInMonth(sub, currentMonthStr)) {
      if (!silent) toast.info('Esta fixa já foi lançada neste mês.');
      return false;
    }

    const daysInTargetMonth = new Date(viewYear, viewMonth0 + 1, 0).getDate();
    const clampedDay = Math.min(daysInTargetMonth, Math.max(1, Number(sub.dueDay) || 1));
    const txDate = `${currentMonthStr}-${String(clampedDay).padStart(2, '0')}`;

    let invoiceMonth = '';
    if (String(sub.paymentMethod || '').startsWith('card_')) {
      const cardId = sub.paymentMethod.replace('card_', '');
      const cardObj = (cards || []).find((c) => c.id === cardId);
      invoiceMonth = getCardInvoiceMonth(txDate, cardObj?.closeDay || 28);
    }

    const personField =
      sub.isSplit && Array.isArray(sub.splitDetails) && sub.splitDetails.length > 0
        ? sub.splitDetails.map((d) => d.person).join(', ')
        : sub.person || session?.person || 'Geral';

    const txPayload: any = {
      description: sub.name,
      amount: Number(sub.amount),
      type: 'expense',
      category: sub.category || 'Assinaturas',
      date: txDate,
      paymentMethod: sub.paymentMethod,
      person: personField,
      personKeys: toPersonKeys(personField),
      isSplit: Boolean(sub.isSplit),
      splitDetails: sub.splitDetails || [],
      paidBy: sub.person || session?.person || '',
      subscriptionId: sub.id,
      isSubscription: true,
      invoiceMonth,
      createdAt: new Date().toISOString(),
    };

    await addTx(txPayload);

    if (String(sub.paymentMethod || '').startsWith('acc_')) {
      const accId = sub.paymentMethod.replace('acc_', '');
      const acc = (accounts || []).find((a) => a.id === accId);
      if (acc && acc.id) {
        const prevBal = acc.computedBalance !== undefined ? Number(acc.computedBalance) : Number(acc.balance || 0);
        await updateAccount(acc.id, {
          computedBalance: Number((prevBal - Number(sub.amount)).toFixed(2)),
        });
      }
    }

    const nextMonths = Array.from(new Set([...(sub.launchedMonths || []), currentMonthStr]));
    await update(sub.id, { launchedMonths: nextMonths });
    if (!silent) toast.success(`"${sub.name}" lançada no mês.`);
    return true;
  };

  const handleLaunchMonth = async () => {
    if (isTripActiveNow && trip.pauseFixed) {
      toast.warning('As fixas estão pausadas durante o Modo viagem.');
      return;
    }

    const pendingSubs = filteredSubs.filter(
      (s) => s.active !== false && !isLaunchedInMonth(s, currentMonthStr)
    );

    if (pendingSubs.length === 0) {
      toast.info('Todas as fixas ativas já foram lançadas neste mês.');
      return;
    }

    setLaunchingMonth(true);
    try {
      let count = 0;
      for (const s of pendingSubs) {
        const ok = await launchSingleSub(s, true);
        if (ok) count += 1;
      }
      toast.success(`${count} ${count === 1 ? 'fixa lançada' : 'fixas lançadas'} no mês.`);
    } catch {
      toast.error('Erro ao lançar fixas do mês.');
    } finally {
      setLaunchingMonth(false);
    }
  };

  const handleToggleActive = async (sub: SubscriptionItem) => {
    try {
      const next = sub.active === false;
      await update(sub.id, { active: next });
      toast.info(next ? `"${sub.name}" reativada.` : `"${sub.name}" pausada.`);
    } catch {
      toast.error('Erro ao alterar estado da fixa.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await remove(deleteTarget.id);
      toast.success('Fixa excluída.');
    } catch {
      toast.error('Erro ao excluir fixa.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {accessiblePersonNames.length === 1 ? (
            <span className="px-3.5 py-2 rounded-pill bg-card border border-border text-xs font-bold text-ink">
              {accessiblePersonNames[0]}
            </span>
          ) : accessiblePersonNames.length > 1 ? (
            <div className="w-44">
              <Select
                size="sm"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                ariaLabel="Filtrar por pessoa"
              >
                <option value="all">Todas as pessoas</option>
                {accessiblePersonNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          <button
            type="button"
            disabled={launchingMonth}
            onClick={handleLaunchMonth}
            className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-sm hover:border-pri/40 transition-colors disabled:opacity-50"
          >
            {launchingMonth ? 'Lançando...' : 'Lançar mês'}
          </button>
          <button
            type="button"
            onClick={openNewModal}
            className="px-4 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm flex items-center gap-2 shadow-sm hover:opacity-95 transition-opacity"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Nova fixa</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Previsto no mês</div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-ink tracking-tight">
            {maskCurrency(stats.expectedTotal, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-muted mt-1">
            {stats.activeCount} {stats.activeCount === 1 ? 'fixa ativa' : 'fixas ativas'}
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Já lançado</div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-pri tracking-tight">
            {maskCurrency(stats.launchedTotal, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-pri mt-1">
            {stats.launchedCount} de {stats.activeCount}
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Falta lançar</div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-spendText tracking-tight">
            {maskCurrency(stats.pendingTotal, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-spendText mt-1">
            {stats.dueSoonCount} {stats.dueSoonCount === 1 ? 'vence' : 'vencem'} até o dia {stats.cutoffDay}
          </div>
        </div>
      </div>

      {/* Main 2-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left list card */}
        <div className="lg:col-span-8 rounded-[24px] bg-card border border-border p-4 md:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="relative flex-1">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar fixa"
                aria-label="Buscar fixa"
                className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-pill bg-neutral border border-transparent focus:border-pri text-sm text-ink placeholder:text-muted outline-none transition-colors"
              />
            </div>

            <div className="inline-flex items-center gap-1 rounded-pill bg-seg p-1 shrink-0">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'accounts', label: 'Contas' },
                  { id: 'cards', label: 'Cartões' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMethodFilter(tab.id)}
                  className={`px-3.5 min-h-[34px] rounded-pill text-xs font-bold transition-colors ${
                    methodFilter === tab.id
                      ? 'bg-segOn text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredSubs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-bold text-ink">Nenhuma fixa encontrada</p>
              <p className="text-xs text-muted mt-1">
                Cadastre contas recorrentes e assinaturas para acompanhar os vencimentos do mês.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredSubs.map((sub) => {
                const status = getStatusBadge(sub);
                const shareInfo = getMyShare(sub);
                const methodLabel = getPaymentMethodLabel(sub.paymentMethod);
                const launched = isLaunchedInMonth(sub, currentMonthStr);

                return (
                  <div
                    key={sub.id}
                    className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-opacity ${
                      sub.active === false ? 'opacity-55' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-[14px] bg-neutral flex flex-col items-center justify-center shrink-0 border border-border/60">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted leading-none">
                          DIA
                        </span>
                        <span className="font-display text-sm font-bold text-ink leading-tight mt-0.5">
                          {String(sub.dueDay || 1).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-ink truncate">{sub.name}</div>
                        <div className="text-xs text-muted truncate mt-0.5">
                          {sub.category || 'Assinaturas'}
                          {shareInfo.isShared && shareInfo.otherNames.length > 0 && (
                            <>
                              {`, dividida com ${shareInfo.otherNames.join(', ')} · `}
                              <span className="font-semibold text-ink">
                                Sua parte {maskCurrency(shareInfo.myAmount, privacyMode)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-14 sm:pl-0 shrink-0">
                      <span className="text-xs font-medium text-muted hidden md:inline">
                        {methodLabel}
                      </span>

                      <span
                        className={`px-2.5 py-1 rounded-pill text-[11px] font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>

                      <div className="font-display font-bold text-sm md:text-base text-ink min-w-[92px] text-right">
                        {maskCurrency(sub.amount, privacyMode)}
                      </div>

                      <div className="flex items-center gap-1">
                        {!launched && sub.active !== false && (
                          <button
                            type="button"
                            aria-label={`Lançar ${sub.name}`}
                            onClick={() => launchSingleSub(sub)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-pri hover:bg-priSoft transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Editar ${sub.name}`}
                          onClick={() => openEditModal(sub)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={sub.active === false ? `Ativar ${sub.name}` : `Pausar ${sub.name}`}
                          onClick={() => handleToggleActive(sub)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
                        >
                          {sub.active === false ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir ${sub.name}`}
                          onClick={() => setDeleteTarget(sub)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-spend hover:bg-spendSoft transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right calendar card */}
        <div className="lg:col-span-4 rounded-[24px] bg-card border border-border p-5 shadow-xs space-y-4">
          <h2 className="font-display text-base font-bold text-ink">
            Vencimentos de {currentMonthName}
          </h2>

          <div>
            <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-[11px] font-bold text-muted py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-9" />;
                }
                const badgeStyle =
                  cell.status === 'launched'
                    ? 'bg-priSoft text-priInk font-bold'
                    : cell.status === 'pending'
                      ? 'bg-spendSoft text-spendText font-bold'
                      : 'text-ink font-medium';
                return (
                  <div
                    key={cell.day}
                    className={`h-9 rounded-[12px] text-xs flex items-center justify-center ${badgeStyle}`}
                  >
                    {cell.day}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pri inline-block" />
              Lançada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-spend inline-block" />
              A vencer
            </span>
          </div>

          <div className="rounded-[18px] bg-priSoft p-3.5 text-xs font-semibold text-priInk leading-relaxed">
            Se nada mudar, {nextMonthName} fecha com{' '}
            <span className="font-bold">{maskCurrency(stats.expectedTotal, privacyMode)}</span> em
            fixas.
          </div>
        </div>
      </div>

      {/* Modal Nova / Editar Fixa */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[480px] max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                {editingSub ? 'Editar fixa' : 'Nova fixa'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Formulário para cadastrar ou editar despesa fixa mensal.
            </Dialog.Description>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aluguel, Internet fibra, Netflix"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Valor</label>
                  <MoneyField value={amount} onValueChange={setAmount} ariaLabel="Valor da fixa" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Dia do vencimento</label>
                  <NumberField
                    value={dueDay}
                    onValueChange={setDueDay}
                    min={1}
                    max={31}
                    placeholder="10"
                    ariaLabel="Dia do vencimento"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Categoria</label>
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    ariaLabel="Categoria"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Conta ou cartão</label>
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    ariaLabel="Conta ou cartão"
                  >
                    <option value="">Selecionar</option>
                    {visibleAccounts.length > 0 && (
                      <optgroup label="Contas">
                        {visibleAccounts.map((acc) => (
                          <option key={acc.id} value={`acc_${acc.id}`}>
                            {acc.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {visibleCards.length > 0 && (
                      <optgroup label="Cartões">
                        {visibleCards.map((c) => (
                          <option key={c.id} value={`card_${c.id}`}>
                            Cartão {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </div>
              </div>

              {allPersonNames.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Responsável</label>
                  <Select
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    ariaLabel="Pessoa responsável"
                  >
                    {allPersonNames.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {allPersonNames.length > 1 && (
                <div className="rounded-[18px] bg-neutral p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-ink">Dividir entre pessoas</div>
                      <div className="text-[11px] text-muted">
                        Reparte o valor igualmente no acerto do mês.
                      </div>
                    </div>
                    <Switch
                      checked={isSplit}
                      onCheckedChange={(checked) => {
                        setIsSplit(checked);
                        if (checked && splitPeople.length === 0) {
                          setSplitPeople(person ? [person] : [allPersonNames[0]]);
                        }
                      }}
                      ariaLabel="Dividir entre pessoas"
                    />
                  </div>

                  {isSplit && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {allPersonNames.map((pName) => {
                        const selected = splitPeople.includes(pName);
                        return (
                          <button
                            key={pName}
                            type="button"
                            onClick={() => toggleSplitPerson(pName)}
                            className={`px-3 py-1.5 rounded-pill text-xs font-bold transition-colors ${
                              selected
                                ? 'bg-priSoft text-priInk border border-pri/30'
                                : 'bg-card text-muted border border-border'
                            }`}
                          >
                            {pName}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isSplit && splitPeople.length > 0 && amount > 0 && (
                    <div className="text-xs font-semibold text-priInk">
                      Parte de cada pessoa: {formatCurrency(amount / splitPeople.length)}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-ink">Fixa ativa</span>
                <Switch checked={active} onCheckedChange={setActive} ariaLabel="Fixa ativa" />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={'Excluir fixa'}
        message={
          deleteTarget
            ? `Deseja excluir "${deleteTarget.name}"? O que já foi lançado nos meses anteriores continua no histórico.`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default Subscriptions;
