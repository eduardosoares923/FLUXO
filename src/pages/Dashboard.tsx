import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, parseTxDate } from '../utils/format';
import { Transaction, Account, User } from '../types';

function getEffectiveAmount(tx: any) {
  return parseFloat(tx.amount) || 0;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORY_ICONS: Record<string, string> = {
  alimentação: 'fa-utensils', mercado: 'fa-cart-shopping', moradia: 'fa-house', transporte: 'fa-car',
  saúde: 'fa-heart-pulse', educação: 'fa-graduation-cap', lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar', investimentos: 'fa-chart-line', assinaturas: 'fa-rotate',
  'roupas e acessórios': 'fa-shirt',
};

function iconForCategory(category: string, type: string) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

function FlowChart({ days }: { days: any[] }) {
  const width = 260; const height = 90; const pad = 6;
  const values = days.map((d) => d.cumulative);
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;

  const points = days.map((d, i) => {
    const x = pad + (i / (days.length - 1)) * (width - pad * 2);
    const y = height - pad - ((d.cumulative - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];
  const trendUp = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-[180px] h-[65px] md:w-[240px] md:h-[80px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <defs>
        <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={trendUp ? '#34d399' : '#f87171'} />
          <stop offset="100%" stopColor="#e3b04b" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke="url(#flowGradient)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4.5} fill="#e3b04b" className="animate-pulse" />
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
    return () => cancelAnimationFrame(frame.current!);
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
  const { session, canAccessPerson } = useAuth() as { session: User; canAccessPerson: (p?: string | null, tx?: any) => boolean };
  const { data: transactions, loading: loadingTx } = useCollection<Transaction>('transactions');
  const { data: accounts, loading: loadingAcc } = useCollection<Account>('accounts');
  const { data: subscriptions } = useCollection<any>('subscriptions');
  const { data: cards } = useCollection<any>('cards');

  const [navDate, setNavDate] = useState(() => new Date());

  const navMonth = navDate.getMonth();
  const navYear = navDate.getFullYear();
  const monthLabel = navDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isCurrentMonth = navMonth === new Date().getMonth() && navYear === new Date().getFullYear();

  const visibleAccounts = useMemo(() => (session?.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner))), [accounts, session, canAccessPerson]);
  const visibleTx = useMemo(() => transactions.filter((tx) => canAccessPerson(tx.person, tx)), [transactions, canAccessPerson]);

  const currentPeriodTxs = useMemo(() => visibleTx.filter((tx) => {
    const d = parseTxDate(tx.date);
    return d && d.getMonth() === navMonth && d.getFullYear() === navYear;
  }), [visibleTx, navMonth, navYear]);

  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0; let expense = 0;
    currentPeriodTxs.forEach((tx) => {
      const amt = getEffectiveAmount(tx);
      if (tx.type === 'income') income += amt;
      else expense += amt;
    });
    return { totalIncome: income, totalExpense: expense };
  }, [currentPeriodTxs]);

  const currentBalance = useMemo(() => {
    if (visibleAccounts.length === 0) {
      let income = 0; let expense = 0;
      visibleTx.forEach((tx) => {
        const amt = getEffectiveAmount(tx);
        if (tx.type === 'income') income += amt;
        else expense += amt;
      });
      return income - expense;
    }
    return visibleAccounts.reduce((sum, acc) => {
      const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
      let accIncome = 0; let accExpense = 0;
      visibleTx.forEach((tx) => {
        if (tx.paymentMethod === accIdStr) {
          const amt = getEffectiveAmount(tx);
          if (tx.type === 'income') accIncome += amt;
          else if (tx.type === 'expense') accExpense += amt;
        }
      });
      const initial = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance || 0;
      return sum + initial + accIncome - accExpense;
    }, 0);
  }, [visibleAccounts, visibleTx]);

  const animatedBalance = useCountUp(currentBalance);

  const accountsSummary = useMemo(() => visibleAccounts.map((acc) => {
    const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
    let allIncome = 0; let allExpense = 0; let periodIncome = 0; let periodExpense = 0;
    visibleTx.forEach((tx) => {
      if (tx.paymentMethod !== accIdStr) return;
      const amt = getEffectiveAmount(tx);
      const d = parseTxDate(tx.date);
      const inPeriod = d && d.getMonth() === navMonth && d.getFullYear() === navYear;
      if (tx.type === 'income') { allIncome += amt; if (inPeriod) periodIncome += amt; } 
      else { allExpense += amt; if (inPeriod) periodExpense += amt; }
    });
    const balance = (typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance || 0) + allIncome - allExpense;
    return { ...acc, balance, periodNet: periodIncome - periodExpense };
  }), [visibleAccounts, visibleTx, navMonth, navYear]);

  const personsSummary = useMemo(() => {
    const map = new Map();
    currentPeriodTxs.forEach((tx) => {
      const label = tx.person || 'Sem pessoa';
      if (!map.has(label)) map.set(label, { person: label, income: 0, expense: 0 });
      const entry = map.get(label);
      const amt = getEffectiveAmount(tx);
      if (tx.type === 'income') entry.income += amt;
      else entry.expense += amt;
    });
    return [...map.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
  }, [currentPeriodTxs]);

  const upcomingSubscriptions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (subscriptions || [])
      .filter((s: any) => s.status !== 'pausada' && canAccessPerson(s.person))
      .map((s: any) => {
        const due = nextBillingDate(s.billingDay, today);
        const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...s, diffDays };
      })
      .filter((s: any) => s.diffDays >= 0 && s.diffDays <= 5)
      .sort((a: any, b: any) => a.diffDays - b.diffDays);
  }, [subscriptions, canAccessPerson]);

  function cardNameFor(paymentMethod: string) {
    if (!paymentMethod?.startsWith('card_')) return 'Conta corrente';
    const card = cards.find((c: any) => `card_${c.id}` === paymentMethod);
    return card ? `Cartão ${card.name}` : 'Cartão';
  }

  const last14Days = useMemo(() => {
    const now = new Date(); const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), net: 0, cumulative: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    visibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const key = dayKey(d);
      if (!byKey.has(key)) return;
      const amt = getEffectiveAmount(tx);
      byKey.get(key)!.net += tx.type === 'income' ? amt : -amt;
    });
    let running = 0;
    return buckets.map((b) => { running += b.net; return { ...b, cumulative: running }; });
  }, [visibleTx]);

  const netLast14 = last14Days.length ? last14Days[last14Days.length - 1].cumulative : 0;
  const recentTx = useMemo(() => [...currentPeriodTxs].sort((a, b) => (parseTxDate(b.date)?.getTime() || 0) - (parseTxDate(a.date)?.getTime() || 0)).slice(0, 10), [currentPeriodTxs]);

  if (loadingTx || loadingAcc) return <div className="flex items-center justify-center h-[60vh] text-[#8fa39a] animate-pulse">Carregando painel...</div>;

  return (
    <div className="animate-in fade-in duration-500 max-w-[1200px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Olá, {session?.name.split(' ')[0]}</h2>
        
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-1.5 shadow-lg">
          <button onClick={() => setNavDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="w-10 h-10 rounded-xl hover:bg-white/10 text-[#8fa39a] hover:text-[#f2f0ea] transition-all flex items-center justify-center">
            <i className="fa-solid fa-chevron-left" />
          </button>
          <span className="min-w-[140px] text-center font-bold text-[#f2f0ea] capitalize tracking-wide">{monthLabel}</span>
          <button onClick={() => setNavDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="w-10 h-10 rounded-xl hover:bg-white/10 text-[#8fa39a] hover:text-[#f2f0ea] transition-all flex items-center justify-center">
            <i className="fa-solid fa-chevron-right" />
          </button>
          {!isCurrentMonth && (
            <button onClick={() => setNavDate(new Date())} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold ml-1 transition-colors">
              Hoje
            </button>
          )}
        </div>
      </div>

      {upcomingSubscriptions.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {upcomingSubscriptions.map((s: any) => (
            <div key={s.id} className="flex items-center gap-4 bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl text-blue-100 shadow-lg">
              <span className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg shrink-0">
                <i className="fa-solid fa-bell" />
              </span>
              <div>
                <strong className="block text-[#f2f0ea] text-[1.05rem]">Assinatura "{s.name}"</strong>
                <span className="text-[0.85rem] text-blue-200/80">
                  Cobrança de {formatCurrency(s.amount)} prevista para {s.diffDays === 0 ? 'hoje' : s.diffDays === 1 ? 'amanhã' : `em ${s.diffDays} dias`} no {cardNameFor(s.paymentMethod)}.
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hero Balance Card */}
      <div className="bg-gradient-to-br from-[#1a2320] to-[#0f1614] border border-white/[0.08] rounded-[24px] p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-[-50%] right-[-10%] w-[300px] h-[300px] bg-[#e3b04b] rounded-full blur-[120px] opacity-[0.15] pointer-events-none" />
        
        <div className="flex flex-col z-10 w-full md:w-auto">
          <span className="text-[#8fa39a] font-semibold tracking-widest uppercase text-sm mb-2">Saldo Atual Consolidado</span>
          <strong className="text-[2.8rem] md:text-[3.5rem] font-bold font-mono tracking-tighter text-[#f2f0ea] leading-none mb-4">
            {formatCurrency(animatedBalance)}
          </strong>
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold w-fit ${netLast14 >= 0 ? 'bg-[#34d399]/15 text-[#34d399]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
            <i className={`fa-solid ${netLast14 >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
            {formatCurrency(Math.abs(netLast14))} nos últimos 14 dias
          </span>
        </div>

        <div className="z-10 flex-shrink-0">
          <FlowChart days={last14Days} />
        </div>
      </div>

      {/* KPI Chips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 flex items-center gap-5 transition-all hover:bg-white/[0.05]">
          <span className="w-14 h-14 rounded-2xl bg-[#34d399]/15 text-[#34d399] flex items-center justify-center text-2xl shrink-0">
            <i className="fa-solid fa-arrow-down" />
          </span>
          <div>
            <span className="block text-[#8fa39a] text-sm font-semibold uppercase tracking-wider mb-1">Receitas do mês</span>
            <strong className="text-2xl font-bold font-mono text-[#f2f0ea]">{formatCurrency(totalIncome)}</strong>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 flex items-center gap-5 transition-all hover:bg-white/[0.05]">
          <span className="w-14 h-14 rounded-2xl bg-[#f87171]/15 text-[#f87171] flex items-center justify-center text-2xl shrink-0">
            <i className="fa-solid fa-arrow-up" />
          </span>
          <div>
            <span className="block text-[#8fa39a] text-sm font-semibold uppercase tracking-wider mb-1">Despesas do mês</span>
            <strong className="text-2xl font-bold font-mono text-[#f2f0ea]">{formatCurrency(totalExpense)}</strong>
          </div>
        </div>
      </div>

      {/* Dashboard Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Transactions List */}
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.08] rounded-[24px] p-6 md:p-8">
          <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3">
            <i className="fa-solid fa-clock-rotate-left text-[#e3b04b]" /> Transações Recentes
          </h3>
          
          {recentTx.length === 0 ? (
            <div className="text-center py-12 text-[#8fa39a] bg-white/[0.02] rounded-2xl border border-white/5 border-dashed">Nenhuma transação no período.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentTx.map((tx) => (
                <div key={tx.id} className="flex items-center gap-4 p-3 hover:bg-white/[0.04] rounded-2xl transition-colors group cursor-default border border-transparent hover:border-white/5">
                  <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center text-lg shrink-0 transition-transform group-hover:scale-110 ${tx.type === 'income' ? 'bg-[#34d399]/15 text-[#34d399]' : 'bg-white/10 text-[#8fa39a]'}`}>
                    <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-[#f2f0ea] text-[1.05rem] truncate">{tx.description}</strong>
                    <span className="text-[#8fa39a] text-[0.8rem] truncate block mt-0.5">{formatDate(tx.date)} &bull; {tx.category}</span>
                  </div>
                  <strong className={`font-mono text-[1.1rem] ${tx.type === 'income' ? 'text-[#34d399]' : 'text-[#f2f0ea]'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(getEffectiveAmount(tx))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Cards */}
        <div className="flex flex-col gap-6">
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-[24px] p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3">
              <i className="fa-solid fa-building-columns text-[#4d8dff]" /> Por Conta
            </h3>
            {accountsSummary.length === 0 ? (
              <p className="text-center py-6 text-[#8fa39a] text-sm">Nenhuma conta cadastrada.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {accountsSummary.map((acc) => (
                  <div key={acc.id} className="flex justify-between items-center p-3 rounded-xl hover:bg-white/[0.04] transition-colors border border-transparent hover:border-white/5">
                    <span className="font-semibold text-[#f2f0ea] text-[0.95rem]">{acc.name}</span>
                    <div className="text-right">
                      <strong className="block font-mono text-[#f2f0ea] text-[1.05rem]">{formatCurrency(acc.balance)}</strong>
                      <span className={`text-[0.7rem] font-bold ${acc.periodNet >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                        {acc.periodNet >= 0 ? '+' : ''}{formatCurrency(acc.periodNet)} no mês
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/[0.08] rounded-[24px] p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3">
              <i className="fa-solid fa-users text-[#a855f7]" /> Por Pessoa
            </h3>
            {personsSummary.length === 0 ? (
              <p className="text-center py-6 text-[#8fa39a] text-sm">Nenhuma movimentação.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {personsSummary.map((p) => (
                  <div key={p.person} className="flex justify-between items-center p-3 rounded-xl hover:bg-white/[0.04] transition-colors border border-transparent hover:border-white/5">
                    <span className="font-semibold text-[#f2f0ea] text-[0.95rem]">{p.person}</span>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-[0.7rem] px-2 py-0.5 rounded bg-[#34d399]/20 text-[#34d399] font-mono font-bold leading-none">+{formatCurrency(p.income)}</span>
                      <span className="text-[0.7rem] px-2 py-0.5 rounded bg-[#f87171]/20 text-[#f87171] font-mono font-bold leading-none">-{formatCurrency(p.expense)}</span>
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