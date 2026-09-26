import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, parseTxDate, maskCurrency, getCardInvoiceMonth } from '../utils/format';
import { db } from '../firebase';
import { useUIStore } from '../stores/useUIStore';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

function getEffectiveAmount(tx: Transaction) { return parseFloat(String(tx.amount)) || 0; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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

function FlowChart({ days }: { days: any[] }) {
  const width = 260; const height = 70; const pad = 6;
  if (!days || days.length === 0) return null;
  const values = days.map((d) => d.cumulative);
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;

  const points = days.map((d, i) => {
    const x = pad + (i / (days.length - 1)) * (width - pad * 2);
    const y = height - pad - ((d.cumulative - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1] || [0, 0];
  const trendUp = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full drop-shadow-lg overflow-visible preserve-3d">
      <defs>
        <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={trendUp ? '#34d399' : '#f87171'} />
          <stop offset="100%" stopColor="#e3b04b" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke="url(#flowGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4} fill="#e3b04b" stroke="#1c1206" strokeWidth="2" />
    </svg>
  );
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [target, duration]);

  return value;
}

function nextBillingDate(billingDay: number, today: Date) {
  const day = Number(billingDay) || 10;
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return candidate;
}

export default function Dashboard() {
  const { session, canAccessPerson } = useAuth() as { session: User; canAccessPerson: (p?: string, tx?: any) => boolean };
  const { data: transactions, loading: loadingTx } = useCollection<Transaction>('transactions');
  const { data: accounts, loading: loadingAcc } = useCollection<any>('accounts');
  const { data: subscriptions } = useCollection<any>('subscriptions');
  const { data: cards } = useCollection<any>('cards');
  const { data: paidInvoices } = useCollection<any>('paidInvoices');
  const { data: personsList } = useCollection<{ id?: string; name?: string }>('persons');
  const { privacyMode, togglePrivacyMode, selectedPerson, setSelectedPerson } = useUIStore();

  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [categoryStyles, setCategoryStyles] = useState<Record<string, { icon: string; color: string }>>({});
  useEffect(() => {
    getDoc(doc(db, 'settings', 'budgets')).then((snap) => {
      if (snap.exists()) setBudgets(snap.data() as Record<string, number>);
    }).catch((e) => console.error('Erro ao carregar metas:', e));
    getDoc(doc(db, 'settings', 'categoryStyles')).then((snap) => {
      if (snap.exists()) setCategoryStyles(snap.data() as Record<string, { icon: string; color: string }>);
    }).catch((e) => console.error('Erro ao carregar estilos de categoria:', e));
  }, []);

  const [navDate, setNavDate] = useState(() => new Date());
  const navMonth = navDate.getMonth(); const navYear = navDate.getFullYear();
  const monthLabel = navDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isCurrentMonth = navMonth === new Date().getMonth() && navYear === new Date().getFullYear();

  async function handleCopySummary() {
    const linhas = [
      `📊 Resumo financeiro — ${monthLabel}`,
      '',
      `💰 Saldo atual: ${formatCurrency(currentBalance)}`,
      `📈 Receitas: ${formatCurrency(totalIncome)}`,
      `📉 Despesas: ${formatCurrency(totalExpense)}`,
    ];
    if (personsSummary.length > 0) {
      linhas.push('', '👤 Por pessoa:');
      personsSummary.forEach((p) => {
        linhas.push(`- ${p.person}: +${formatCurrency(p.income)} / -${formatCurrency(p.expense)}`);
      });
    }
    const texto = linhas.join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Resumo copiado! Já pode colar no WhatsApp.');
    } catch {
      toast.error('Não foi possível copiar o resumo.');
    }
  }

  function goPrevMonth() { setNavDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function goNextMonth() { setNavDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
  function goToday() { setNavDate(new Date()); }

  const visibleAccounts = useMemo(() => (session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner))), [accounts, session, canAccessPerson]);
  const visibleTx = useMemo(() =>
    transactions
      .filter((tx) => canAccessPerson(tx.person, tx))
      .filter((tx) => selectedPerson === 'all' || tx.person === selectedPerson),
    [transactions, canAccessPerson, selectedPerson]);
  const currentPeriodTxs = useMemo(() => visibleTx.filter((tx) => { const d = parseTxDate(tx.date); return d && d.getMonth() === navMonth && d.getFullYear() === navYear; }), [visibleTx, navMonth, navYear]);

  const personOptions = useMemo(() => (personsList || []).map((p) => p.name).filter((n): n is string => Boolean(n) && canAccessPerson(n)), [personsList, canAccessPerson]);

  const currentBalance = useMemo(() => {
    let sum = 0; let fallbackIncome = 0; let fallbackExpense = 0; const fallbackAccs = new Set();
    visibleAccounts.forEach(acc => {
      const initial = parseFloat(acc.balance) || 0;
      if (acc.computedBalance !== undefined) sum += initial + Number(acc.computedBalance);
      else { fallbackAccs.add(acc.id === 'default_account' ? 'account' : `acc_${acc.id}`); sum += initial; }
    });
    if (fallbackAccs.size > 0 || visibleAccounts.length === 0) {
      visibleTx.forEach(tx => {
        if (visibleAccounts.length === 0 || fallbackAccs.has(tx.paymentMethod)) {
          const amt = getEffectiveAmount(tx);
          if (tx.type === 'income' || tx.type === 'transfer_in') fallbackIncome += amt;
          else if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'invoice_payment') fallbackExpense += amt;
        }
      });
      sum += (fallbackIncome - fallbackExpense);
    }
    return sum;
  }, [visibleAccounts, visibleTx]);

  const animatedBalance = useCountUp(currentBalance);

  const { totalIncome, totalExpense, personsSummary, accountsSummary, categoryTotals } = useMemo(() => {
    let income = 0; let expense = 0;
    const pMap = new Map();
    const aMap = new Map(visibleAccounts.map(a => [a.id === 'default_account' ? 'account' : `acc_${a.id}`, { ...a, periodIncome: 0, periodExpense: 0, periodNet: 0 }]));
    const catMap: Record<string, number> = {};

    currentPeriodTxs.forEach((tx) => {
      const amt = getEffectiveAmount(tx);
      const isTransfer = tx.type === 'transfer_out' || tx.type === 'transfer_in';
      const isInvoicePayment = tx.type === 'invoice_payment';
      const isInc = tx.type === 'income' || tx.type === 'transfer_in';

      // Transferência entre contas e pagamento de fatura não são receita/despesa nova da família:
      // a compra do cartão já foi contada como despesa quando aconteceu; pagar a fatura só move o dinheiro.
      if (!isTransfer && !isInvoicePayment) {
        if (isInc) income += amt; else expense += amt;
        const pLabel = tx.person || 'Sem pessoa';
        if (!pMap.has(pLabel)) pMap.set(pLabel, { person: pLabel, income: 0, expense: 0 });
        if (isInc) pMap.get(pLabel).income += amt; else pMap.get(pLabel).expense += amt;
        if (!isInc && tx.category) {
          catMap[tx.category] = (catMap[tx.category] || 0) + amt;
        }
      }

      // O saldo de cada conta continua contando transferência e pagamento de fatura normalmente.
      if (aMap.has(tx.paymentMethod)) {
         const accSum = aMap.get(tx.paymentMethod);
         if (isInc) accSum.periodIncome += amt; else accSum.periodExpense += amt;
         accSum.periodNet = accSum.periodIncome - accSum.periodExpense;
      }
    });

    const accList = [...aMap.values()].map(acc => {
      const initial = parseFloat(acc.balance) || 0;
      const comp = acc.computedBalance !== undefined ? Number(acc.computedBalance) : acc.periodNet;
      return { ...acc, balance: initial + comp };
    });

    return { totalIncome: income, totalExpense: expense, personsSummary: [...pMap.values()].sort((a, b) => (b.expense + b.income) - (a.expense + a.income)), accountsSummary: accList, categoryTotals: catMap };
  }, [currentPeriodTxs, visibleAccounts]);

  const budgetedCategories = useMemo(
    () => Object.keys(budgets).filter((cat) => (budgets[cat] || 0) > 0).map((cat) => ({ category: cat, spent: categoryTotals[cat] || 0, limit: budgets[cat] })),
    [budgets, categoryTotals]
  );

  const upcomingSubscriptions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (subscriptions || []).filter((s) => s.status !== 'pausada' && canAccessPerson(s.person)).map((s) => {
      const due = nextBillingDate(s.billingDay, today);
      return { ...s, diffDays: Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) };
    }).filter((s) => s.diffDays >= 0 && s.diffDays <= 5).sort((a, b) => a.diffDays - b.diffDays);
  }, [subscriptions, canAccessPerson]);

  const upcomingInvoices = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (cards || []).filter((c) => canAccessPerson(c.owner)).map((c) => {
      const due = nextBillingDate(c.dueDay, today);
      const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const dayBeforeDue = new Date(due); dayBeforeDue.setDate(dayBeforeDue.getDate() - 1);
      const monthStr = getCardInvoiceMonth(dayBeforeDue.toISOString().slice(0, 10), c.closeDay);
      const isPaid = (paidInvoices || []).some((p) => p.id === `inv_${c.id}_${monthStr}`);
      return { ...c, diffDays, isPaid };
    }).filter((c) => !c.isPaid && c.diffDays >= 0 && c.diffDays <= 5).sort((a, b) => a.diffDays - b.diffDays);
  }, [cards, paidInvoices, canAccessPerson]);

  const last14Days = useMemo(() => {
    const now = new Date(); const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), net: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    visibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date); if (!d) return;
      const key = dayKey(d); if (!byKey.has(key)) return;
      if (tx.type === 'transfer_out' || tx.type === 'transfer_in' || tx.type === 'invoice_payment') return;
      byKey.get(key)!.net += tx.type === 'income' ? getEffectiveAmount(tx) : -getEffectiveAmount(tx);
    });
    let running = 0; return buckets.map((b) => { running += b.net; return { ...b, cumulative: running }; });
  }, [visibleTx]);

  const netLast14 = last14Days.length ? last14Days[last14Days.length - 1].cumulative : 0;
  const recentTx = useMemo(() => [...currentPeriodTxs].sort((a, b) => (parseTxDate(b.date)?.getTime() || 0) - (parseTxDate(a.date)?.getTime() || 0)).slice(0, 10), [currentPeriodTxs]);

  function cardNameFor(pm: string) {
    if (!pm?.startsWith('card_')) return 'Conta corrente';
    const card = cards.find((c) => `card_${c.id}` === pm);
    return card ? `Cartão ${card.name}` : 'Cartão';
  }

  if (loadingTx || loadingAcc) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 border-4 border-[#e3b04b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 sm:pt-6 animate-in fade-in duration-500">
      
      {/* HEADER RESPONSIVO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea] truncate w-full sm:w-auto">
          Olá, {session.name.split(' ')[0]}
        </h2>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        {personOptions.length > 0 && (
          <select value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)} className="px-3 h-10 rounded-xl border border-white/10 bg-white/5 text-[#f2f0ea] text-xs sm:text-sm font-bold outline-none focus:border-[#e3b04b]" title="Filtrar painel por pessoa">
            <option value="all">Todos</option>
            {personOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
          </select>
        )}
        <button onClick={handleCopySummary} className="flex items-center gap-2 px-3 sm:px-4 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white font-bold text-xs sm:text-sm transition-colors shrink-0" title="Copiar resumo do mês pro WhatsApp">
          <i className="fa-brands fa-whatsapp text-[#34d399]" /> <span className="hidden sm:inline">Copiar resumo</span>
        </button>
        <div className="flex items-center justify-between w-full sm:w-auto gap-2 bg-white/[0.03] border border-white/[0.08] p-1.5 sm:p-2 rounded-2xl shadow-lg">
          <button onClick={goPrevMonth} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] transition-colors shrink-0">
            <i className="fa-solid fa-chevron-left" />
          </button>
          <span className="font-bold text-[#f2f0ea] min-w-[110px] sm:min-w-[140px] text-center capitalize tracking-wide text-sm sm:text-base truncate">
            {monthLabel}
          </span>
          <button onClick={goNextMonth} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] transition-colors shrink-0">
            <i className="fa-solid fa-chevron-right" />
          </button>
          {!isCurrentMonth && (
            <button onClick={goToday} className="px-3 sm:px-4 h-10 rounded-xl bg-[#e3b04b]/20 text-[#e3b04b] font-bold hover:bg-[#e3b04b]/30 transition-colors ml-1 sm:ml-2 text-sm">
              Hoje
            </button>
          )}
        </div>
        </div>
      </div>

      {/* ALERTAS DE ASSINATURA */}
      {upcomingSubscriptions.length > 0 && (
        <div className="mb-6 sm:mb-8 flex flex-col gap-3">
          {upcomingSubscriptions.map((s) => (
            <div key={s.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-yellow-500/20 text-yellow-500 flex items-center justify-center text-lg sm:text-xl shrink-0">
                <i className="fa-solid fa-bell animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-yellow-500 block mb-0.5 sm:mb-1 text-sm sm:text-base truncate">"{s.name}"</strong>
                <p className="text-xs sm:text-sm text-yellow-200/80 leading-snug">
                  Cobrança de {formatCurrency(s.amount)} para {s.diffDays === 0 ? 'hoje' : s.diffDays === 1 ? 'amanhã' : `em ${s.diffDays} dias`} ({cardNameFor(s.paymentMethod)}).
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALERTAS DE FATURA */}
      {upcomingInvoices.length > 0 && (
        <div className="mb-6 sm:mb-8 flex flex-col gap-3">
          {upcomingInvoices.map((c) => (
            <div key={c.id} className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-lg sm:text-xl shrink-0">
                <i className="fa-solid fa-credit-card" />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-orange-400 block mb-0.5 sm:mb-1 text-sm sm:text-base truncate">Fatura "{c.name}"</strong>
                <p className="text-xs sm:text-sm text-orange-200/80 leading-snug">
                  Vence {c.diffDays === 0 ? 'hoje' : c.diffDays === 1 ? 'amanhã' : `em ${c.diffDays} dias`} e ainda não foi marcada como paga.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HERO BALANCE - ADAPTADO PARA MOBILE */}
      <div className="bg-gradient-to-br from-[#1a2320] to-[#141d1a] border border-white/[0.08] rounded-[24px] sm:rounded-3xl p-5 sm:p-8 mb-6 sm:mb-8 shadow-2xl flex flex-col md:flex-row justify-between gap-6 md:gap-8 relative overflow-hidden">
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 sm:w-64 sm:h-64 bg-[#e3b04b]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col justify-center relative z-10 w-full">
          <span className="text-[#8fa39a] font-semibold tracking-widest uppercase text-xs sm:text-sm mb-2 flex items-center gap-2">
            <i className="fa-solid fa-wallet" /> Saldo atual
            <button onClick={togglePrivacyMode} className="text-[#8fa39a] hover:text-white ml-1" title={privacyMode ? 'Mostrar valores' : 'Esconder valores'}>
              <i className={`fa-solid ${privacyMode ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </span>
          <strong className="text-[2rem] sm:text-5xl md:text-6xl font-black text-[#f2f0ea] font-mono tracking-tighter mb-4 drop-shadow-md break-all leading-none">
            {maskCurrency(animatedBalance, privacyMode)}
          </strong>
          <span className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold w-fit ${netLast14 >= 0 ? 'bg-[#34d399]/20 text-[#34d399]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>
            <i className={`fa-solid ${netLast14 >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
            {maskCurrency(Math.abs(netLast14), privacyMode)} em 14d
          </span>
        </div>
        <div className="w-full md:w-[280px] h-[80px] sm:h-[100px] relative z-10 mt-2 md:mt-0 opacity-90 shrink-0">
          <FlowChart days={last14Days} />
        </div>
      </div>

      {/* STAT CHIPS - 2 COLUNAS NO MOBILE */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 mb-6 sm:mb-8">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-[20px] sm:rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5 relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#34d399]" />
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#34d399]/10 text-[#34d399] flex items-center justify-center text-lg sm:text-2xl shrink-0"><i className="fa-solid fa-arrow-down" /></div>
          <div className="min-w-0">
            <span className="block text-[#8fa39a] text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-0.5 sm:mb-1 truncate">Receitas</span>
            <strong className="text-lg sm:text-2xl font-bold text-[#f2f0ea] font-mono truncate block">{maskCurrency(totalIncome, privacyMode)}</strong>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-[20px] sm:rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5 relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f87171]" />
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#f87171]/10 text-[#f87171] flex items-center justify-center text-lg sm:text-2xl shrink-0"><i className="fa-solid fa-arrow-up" /></div>
          <div className="min-w-0">
            <span className="block text-[#8fa39a] text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-0.5 sm:mb-1 truncate">Despesas</span>
            <strong className="text-lg sm:text-2xl font-bold text-[#f2f0ea] font-mono truncate block">{maskCurrency(totalExpense, privacyMode)}</strong>
          </div>
        </div>
      </div>

      {budgetedCategories.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-[24px] sm:rounded-3xl p-5 sm:p-8 shadow-xl mb-6 sm:mb-8">
          <h3 className="text-lg sm:text-xl font-bold text-[#f2f0ea] mb-5 flex items-center gap-3">
            <i className="fa-solid fa-bullseye text-[#f59e0b]" /> Metas do mês
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {budgetedCategories.map(({ category, spent, limit }) => {
              const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
              const over = spent > limit;
              return (
                <div key={category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#f2f0ea] font-medium">{category}</span>
                    <span className={`font-mono ${over ? 'text-red-400' : 'text-[#8fa39a]'}`}>{formatCurrency(spent)} / {formatCurrency(limit)}</span>
                  </div>
                  <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-yellow-300' : 'bg-[#34d399]'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* COLUNAS PRINCIPAIS: TRANSAÇÕES VS CONTA/PESSOA */}
      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
        
        {/* TRANSAÇÕES RECENTES */}
        <div className="w-full lg:w-[60%] xl:w-[65%] bg-white/[0.02] border border-white/[0.08] rounded-[24px] sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <h3 className="text-lg sm:text-xl font-bold text-[#f2f0ea] mb-5 sm:mb-6 flex items-center gap-3">
            <i className="fa-solid fa-clock-rotate-left text-[#e3b04b]" /> Recentes
          </h3>
          {recentTx.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-[#8fa39a] text-sm sm:text-base text-center"><i className="fa-solid fa-receipt text-3xl sm:text-4xl mb-3 sm:mb-4 opacity-50" /><p>Nenhuma transação no período.</p></div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentTx.map((tx) => (
                <div key={tx.id} className="group p-3 sm:p-4 rounded-[16px] sm:rounded-2xl bg-black/10 hover:bg-white/5 transition-colors flex items-center justify-between gap-3 sm:gap-4 border border-white/[0.02] hover:border-white/10">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-base sm:text-lg shrink-0 ${tx.type === 'income' ? 'bg-[#34d399]/15 text-[#34d399]' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : tx.type === 'invoice_payment' ? 'bg-[#a78bfa]/15 text-[#a78bfa]' : categoryStyles[tx.category] ? '' : 'bg-white/10 text-[#8fa39a]'}`} style={tx.type === 'expense' && categoryStyles[tx.category] ? { backgroundColor: `${categoryStyles[tx.category].color}26`, color: categoryStyles[tx.category].color } : undefined}>
                      <i className={`fa-solid ${tx.type === 'expense' && categoryStyles[tx.category]?.icon ? categoryStyles[tx.category].icon : iconForCategory(tx.category, tx.type)}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#f2f0ea] truncate text-[0.95rem] sm:text-[1.05rem] leading-tight">{tx.description}</div>
                      <div className="text-[10px] sm:text-xs text-[#8fa39a] truncate mt-1">{formatDate(tx.date)} &bull; {tx.category}</div>
                    </div>
                  </div>
                  <strong className={`font-mono text-sm sm:text-lg shrink-0 pl-2 ${tx.type === 'income' ? 'text-[#34d399]' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? 'text-[#3b82f6]' : tx.type === 'invoice_payment' ? 'text-[#a78bfa]' : 'text-[#f2f0ea]'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'transfer_out' ? '→' : tx.type === 'transfer_in' ? '←' : '-'}{formatCurrency(getEffectiveAmount(tx))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SIDEBAR: CONTAS E PESSOAS */}
        <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col gap-6 sm:gap-8">
          
          {/* POR CONTA */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-[24px] sm:rounded-3xl p-5 sm:p-6 shadow-xl">
            <h3 className="text-base sm:text-lg font-bold text-[#f2f0ea] mb-4 sm:mb-5 flex items-center gap-2"><i className="fa-solid fa-wallet text-[#8b5cf6]" /> Por conta</h3>
            {accountsSummary.length === 0 ? (
              <p className="text-xs sm:text-sm text-[#8fa39a] text-center py-3">Nenhuma conta cadastrada.</p>
            ) : (
              <div className="flex flex-col gap-3 sm:gap-4">
                {accountsSummary.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between gap-2">
                    <span className="text-[#f2f0ea] font-medium text-[0.85rem] sm:text-[0.95rem] truncate">{acc.name}</span>
                    <div className="text-right shrink-0">
                      <strong className="block text-[#f2f0ea] font-mono text-[0.9rem] sm:text-base">{maskCurrency(acc.balance, privacyMode)}</strong>
                      <small className={`font-bold text-[10px] sm:text-xs ${acc.periodNet >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{acc.periodNet >= 0 ? '+' : ''}{maskCurrency(acc.periodNet, privacyMode)} no mês</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* POR PESSOA */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-[24px] sm:rounded-3xl p-5 sm:p-6 shadow-xl">
            <h3 className="text-base sm:text-lg font-bold text-[#f2f0ea] mb-4 sm:mb-5 flex items-center gap-2"><i className="fa-solid fa-users text-[#ec4899]" /> Por pessoa</h3>
            {personsSummary.length === 0 ? (
              <p className="text-xs sm:text-sm text-[#8fa39a] text-center py-3">Sem movimentação.</p>
            ) : (
              <div className="flex flex-col gap-3 sm:gap-4">
                {personsSummary.map((p) => (
                  <div key={p.person} className="flex items-center justify-between gap-2">
                    <span className="text-[#f2f0ea] font-medium text-[0.85rem] sm:text-[0.95rem] truncate max-w-[100px] sm:max-w-[140px]">{p.person}</span>
                    <div className="flex items-center gap-2 font-mono text-[10px] sm:text-xs shrink-0">
                      <span className="text-[#34d399] bg-[#34d399]/10 px-1.5 sm:px-2 py-0.5 rounded">+{maskCurrency(p.income, privacyMode)}</span>
                      <span className="text-[#f87171] bg-[#f87171]/10 px-1.5 sm:px-2 py-0.5 rounded">-{maskCurrency(p.expense, privacyMode)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
