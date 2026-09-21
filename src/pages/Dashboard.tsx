import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, parseTxDate } from '../utils/format';
import { Transaction, Account, User } from '../types';

function getEffectiveAmount(tx: Transaction) { return parseFloat(String(tx.amount)) || 0; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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

function FlowChart({ days }: { days: any[] }) {
  const width = 260; const height = 90; const pad = 6;
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
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full drop-shadow-xl overflow-visible">
      <defs>
        <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={trendUp ? '#34d399' : '#f87171'} />
          <stop offset="100%" stopColor="#e3b04b" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke="url(#flowGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={5} fill="#e3b04b" stroke="#1c1206" strokeWidth="2" />
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

  const [navDate, setNavDate] = useState(() => new Date());
  const navMonth = navDate.getMonth(); const navYear = navDate.getFullYear();
  const monthLabel = navDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isCurrentMonth = navMonth === new Date().getMonth() && navYear === new Date().getFullYear();

  function goPrevMonth() { setNavDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function goNextMonth() { setNavDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
  function goToday() { setNavDate(new Date()); }

  const visibleAccounts = useMemo(() => (session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner))), [accounts, session, canAccessPerson]);
  const visibleTx = useMemo(() => transactions.filter((tx) => canAccessPerson(tx.person, tx)), [transactions, canAccessPerson]);
  const currentPeriodTxs = useMemo(() => visibleTx.filter((tx) => { const d = parseTxDate(tx.date); return d && d.getMonth() === navMonth && d.getFullYear() === navYear; }), [visibleTx, navMonth, navYear]);

  // MOTOR OTIMIZADO 1: Saldo Dinâmico Inteligente com Fallback (Seguro)
  const currentBalance = useMemo(() => {
    let sum = 0;
    let fallbackIncome = 0; let fallbackExpense = 0;
    const fallbackAccs = new Set();

    visibleAccounts.forEach(acc => {
      const initial = parseFloat(acc.balance) || 0;
      if (acc.computedBalance !== undefined) {
        sum += initial + Number(acc.computedBalance);
      } else {
        const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
        fallbackAccs.add(accIdStr);
        sum += initial;
      }
    });

    if (fallbackAccs.size > 0 || visibleAccounts.length === 0) {
      visibleTx.forEach(tx => {
        if (visibleAccounts.length === 0 || fallbackAccs.has(tx.paymentMethod)) {
          const amt = getEffectiveAmount(tx);
          if (tx.type === 'income') fallbackIncome += amt; else fallbackExpense += amt;
        }
      });
      sum += (fallbackIncome - fallbackExpense);
    }
    return sum;
  }, [visibleAccounts, visibleTx]);

  const animatedBalance = useCountUp(currentBalance);

  // MOTOR OTIMIZADO 2: Processamento Single-Pass (Mata 3 loops de vez)
  const { totalIncome, totalExpense, personsSummary, accountsSummary } = useMemo(() => {
    let income = 0; let expense = 0;
    const pMap = new Map();
    const aMap = new Map(visibleAccounts.map(a => [a.id === 'default_account' ? 'account' : `acc_${a.id}`, { ...a, periodIncome: 0, periodExpense: 0, periodNet: 0 }]));

    currentPeriodTxs.forEach((tx) => {
      const amt = getEffectiveAmount(tx);
      const isInc = tx.type === 'income';
      
      if (isInc) income += amt; else expense += amt;
      
      const pLabel = tx.person || 'Sem pessoa';
      if (!pMap.has(pLabel)) pMap.set(pLabel, { person: pLabel, income: 0, expense: 0 });
      if (isInc) pMap.get(pLabel).income += amt; else pMap.get(pLabel).expense += amt;

      if (aMap.has(tx.paymentMethod)) {
         const accSum = aMap.get(tx.paymentMethod);
         if (isInc) accSum.periodIncome += amt; else accSum.periodExpense += amt;
         accSum.periodNet = accSum.periodIncome - accSum.periodExpense;
      }
    });

    // Calcula saldos finais das contas
    const accList = [...aMap.values()].map(acc => {
      const initial = parseFloat(acc.balance) || 0;
      const comp = acc.computedBalance !== undefined ? Number(acc.computedBalance) : acc.periodNet; // simplificado
      return { ...acc, balance: initial + comp };
    });

    return {
      totalIncome: income, totalExpense: expense,
      personsSummary: [...pMap.values()].sort((a, b) => (b.expense + b.income) - (a.expense + a.income)),
      accountsSummary: accList
    };
  }, [currentPeriodTxs, visibleAccounts]);

  const upcomingSubscriptions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (subscriptions || []).filter((s) => s.status !== 'pausada' && canAccessPerson(s.person)).map((s) => {
      const due = nextBillingDate(s.billingDay, today);
      return { ...s, diffDays: Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) };
    }).filter((s) => s.diffDays >= 0 && s.diffDays <= 5).sort((a, b) => a.diffDays - b.diffDays);
  }, [subscriptions, canAccessPerson]);

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
      byKey.get(key)!.net += tx.type === 'income' ? getEffectiveAmount(tx) : -getEffectiveAmount(tx);
    });
    let running = 0;
    return buckets.map((b) => { running += b.net; return { ...b, cumulative: running }; });
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
    <div className="animate-in fade-in duration-500 max-w-[1200px] mx-auto pb-12">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Olá, {session.name.split(' ')[0]}</h2>
        <div className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.08] p-2 rounded-2xl shadow-lg">
          <button onClick={goPrevMonth} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] transition-colors"><i className="fa-solid fa-chevron-left" /></button>
          <span className="font-bold text-[#f2f0ea] min-w-[140px] text-center capitalize tracking-wide">{monthLabel}</span>
          <button onClick={goNextMonth} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] transition-colors"><i className="fa-solid fa-chevron-right" /></button>
          {!isCurrentMonth && <button onClick={goToday} className="px-4 h-10 rounded-xl bg-[#e3b04b]/20 text-[#e3b04b] font-bold hover:bg-[#e3b04b]/30 transition-colors ml-2">Hoje</button>}
        </div>
      </div>

      {upcomingSubscriptions.length > 0 && (
        <div className="mb-8 flex flex-col gap-3">
          {upcomingSubscriptions.map((s) => (
            <div key={s.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in slide-in-from-top-2">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 text-yellow-500 flex items-center justify-center text-xl shrink-0"><i className="fa-solid fa-bell animate-pulse" /></div>
              <div>
                <strong className="text-yellow-500 block mb-1">Assinatura "{s.name}"</strong>
                <p className="text-sm text-yellow-200/80">Cobrança de {formatCurrency(s.amount)} prevista para {s.diffDays === 0 ? 'hoje' : s.diffDays === 1 ? 'amanhã' : `em ${s.diffDays} dias`} no {cardNameFor(s.paymentMethod)}.</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gradient-to-br from-[#1a2320] to-[#141d1a] border border-white/[0.08] rounded-3xl p-6 sm:p-10 mb-8 shadow-2xl flex flex-col md:flex-row justify-between gap-8 relative overflow-hidden">
        <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-[#e3b04b]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col justify-center relative z-10">
          <span className="text-[#8fa39a] font-semibold tracking-widest uppercase text-sm mb-2 flex items-center gap-2"><i className="fa-solid fa-wallet" /> Saldo atual</span>
          <strong className="text-5xl sm:text-6xl font-black text-[#f2f0ea] font-mono tracking-tighter mb-4 drop-shadow-md">{formatCurrency(animatedBalance)}</strong>
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold w-fit ${netLast14 >= 0 ? 'bg-[#34d399]/20 text-[#34d399]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>
            <i className={`fa-solid ${netLast14 >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
            {formatCurrency(Math.abs(netLast14))} nos últimos 14 dias
          </span>
        </div>
        <div className="w-full md:w-[320px] h-[120px] relative z-10 mt-4 md:mt-0 opacity-90"><FlowChart days={last14Days} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 flex items-center gap-5 relative overflow-hidden hover:-translate-y-1 transition-transform">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#34d399]" />
          <div className="w-14 h-14 rounded-2xl bg-[#34d399]/10 text-[#34d399] flex items-center justify-center text-2xl shrink-0"><i className="fa-solid fa-arrow-down" /></div>
          <div><span className="block text-[#8fa39a] text-sm uppercase tracking-wider font-semibold mb-1">Receitas do mês</span><strong className="text-2xl font-bold text-[#f2f0ea] font-mono">{formatCurrency(totalIncome)}</strong></div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 flex items-center gap-5 relative overflow-hidden hover:-translate-y-1 transition-transform">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f87171]" />
          <div className="w-14 h-14 rounded-2xl bg-[#f87171]/10 text-[#f87171] flex items-center justify-center text-2xl shrink-0"><i className="fa-solid fa-arrow-up" /></div>
          <div><span className="block text-[#8fa39a] text-sm uppercase tracking-wider font-semibold mb-1">Despesas do mês</span><strong className="text-2xl font-bold text-[#f2f0ea] font-mono">{formatCurrency(totalExpense)}</strong></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl">
          <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-clock-rotate-left text-[#e3b04b]" /> Transações recentes</h3>
          {recentTx.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-[#8fa39a]"><i className="fa-solid fa-receipt text-4xl mb-4 opacity-50" /><p>Nenhuma transação encontrada no período.</p></div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentTx.map((tx) => (
                <div key={tx.id} className="group p-3 rounded-2xl hover:bg-white/5 transition-colors flex items-center justify-between gap-4 border border-transparent hover:border-white/5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center text-lg shrink-0 ${tx.type === 'income' ? 'bg-[#34d399]/15 text-[#34d399]' : 'bg-white/10 text-[#8fa39a]'}`}><i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} /></div>
                    <div className="min-w-0">
                      <div className="font-bold text-[#f2f0ea] truncate text-[1.05rem]">{tx.description}</div>
                      <div className="text-xs text-[#8fa39a] truncate mt-0.5">{formatDate(tx.date)} &bull; {tx.category}</div>
                    </div>
                  </div>
                  <strong className={`font-mono text-lg shrink-0 ${tx.type === 'income' ? 'text-[#34d399]' : 'text-[#f2f0ea]'}`}>{tx.type === 'income' ? '+ ' : '- '}{formatCurrency(getEffectiveAmount(tx))}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl">
            <h3 className="text-[1.1rem] font-bold text-[#f2f0ea] mb-5 flex items-center gap-2"><i className="fa-solid fa-wallet text-[#8b5cf6]" /> Por conta</h3>
            {accountsSummary.length === 0 ? (
              <p className="text-sm text-[#8fa39a] text-center py-4">Nenhuma conta cadastrada.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {accountsSummary.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between">
                    <span className="text-[#f2f0ea] font-medium text-[0.95rem]">{acc.name}</span>
                    <div className="text-right">
                      <strong className="block text-[#f2f0ea] font-mono">{formatCurrency(acc.balance)}</strong>
                      <small className={`font-bold ${acc.periodNet >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{acc.periodNet >= 0 ? '+' : ''}{formatCurrency(acc.periodNet)} no mês</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl">
            <h3 className="text-[1.1rem] font-bold text-[#f2f0ea] mb-5 flex items-center gap-2"><i className="fa-solid fa-users text-[#ec4899]" /> Por pessoa</h3>
            {personsSummary.length === 0 ? (
              <p className="text-sm text-[#8fa39a] text-center py-4">Nenhuma movimentação no período.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {personsSummary.map((p) => (
                  <div key={p.person} className="flex items-center justify-between">
                    <span className="text-[#f2f0ea] font-medium text-[0.95rem] truncate max-w-[120px]">{p.person}</span>
                    <div className="flex items-center gap-3 font-mono text-sm">
                      <span className="text-[#34d399] bg-[#34d399]/10 px-2 py-0.5 rounded">+{formatCurrency(p.income)}</span>
                      <span className="text-[#f87171] bg-[#f87171]/10 px-2 py-0.5 rounded">-{formatCurrency(p.expense)}</span>
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
