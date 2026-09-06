import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, parseTxDate } from '../utils/format';

function getEffectiveAmount(tx) {
  return parseFloat(tx.amount) || 0;
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORY_ICONS = {
  alimentação: 'fa-utensils',
  mercado: 'fa-cart-shopping',
  moradia: 'fa-house',
  transporte: 'fa-car',
  saúde: 'fa-heart-pulse',
  educação: 'fa-graduation-cap',
  lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar',
  investimentos: 'fa-chart-line',
  assinaturas: 'fa-rotate',
  'roupas e acessórios': 'fa-shirt',
};

function iconForCategory(category, type) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

function FlowChart({ days }) {
  const width = 260;
  const height = 90;
  const pad = 6;
  const values = days.map((d) => d.cumulative);
  const min = Math.min(...values);
  const max = Math.max(...values);
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
    <svg viewBox={`0 0 ${width} ${height}`} className="flow-chart">
      <defs>
        <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={trendUp ? 'var(--success)' : 'var(--danger)'} />
          <stop offset="100%" stopColor="var(--accent-primary)" />
        </linearGradient>
      </defs>
      <path d={pathD} className="flow-line" />
      <circle cx={lastX} cy={lastY} r={4} className="flow-dot-end" fill="var(--accent-primary)" />
    </svg>
  );
}

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const frame = useRef(null);

  useEffect(() => {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

// Próxima data de cobrança de uma assinatura ativa a partir de hoje,
// considerando que o dia de cobrança já pode ter passado neste mês.
function nextBillingDate(billingDay, today) {
  const day = Number(billingDay) || 10;
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return candidate;
}

export default function Dashboard() {
  const { session, canAccessPerson } = useAuth();
  const { data: transactions, loading: loadingTx } = useCollection('transactions');
  const { data: accounts, loading: loadingAcc } = useCollection('accounts');
  const { data: subscriptions } = useCollection('subscriptions');
  const { data: cards } = useCollection('cards');

  const [navDate, setNavDate] = useState(() => new Date());

  const navMonth = navDate.getMonth();
  const navYear = navDate.getFullYear();
  const monthLabel = navDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isCurrentMonth = navMonth === new Date().getMonth() && navYear === new Date().getFullYear();

  function goPrevMonth() {
    setNavDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setNavDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function goToday() {
    setNavDate(new Date());
  }

  const visibleAccounts = useMemo(
    () => (session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner))),
    [accounts, session, canAccessPerson]
  );

  const visibleTx = useMemo(
    () => transactions.filter((tx) => canAccessPerson(tx.person, tx)),
    [transactions, canAccessPerson]
  );

  const currentPeriodTxs = useMemo(
    () =>
      visibleTx.filter((tx) => {
        const d = parseTxDate(tx.date);
        return d && d.getMonth() === navMonth && d.getFullYear() === navYear;
      }),
    [visibleTx, navMonth, navYear]
  );

  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    currentPeriodTxs.forEach((tx) => {
      const amt = getEffectiveAmount(tx);
      if (tx.type === 'income') income += amt;
      else expense += amt;
    });
    return { totalIncome: income, totalExpense: expense };
  }, [currentPeriodTxs]);

  // Saldo atual é sempre o saldo real de agora (independe do mês navegado),
  // usa TODAS as transações, não só o período em exibição.
  const currentBalance = useMemo(() => {
    if (visibleAccounts.length === 0) {
      let income = 0;
      let expense = 0;
      visibleTx.forEach((tx) => {
        const amt = getEffectiveAmount(tx);
        if (tx.type === 'income') income += amt;
        else expense += amt;
      });
      return income - expense;
    }
    return visibleAccounts.reduce((sum, acc) => {
      const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
      let accIncome = 0;
      let accExpense = 0;
      visibleTx.forEach((tx) => {
        if (tx.paymentMethod === accIdStr) {
          const amt = getEffectiveAmount(tx);
          if (tx.type === 'income') accIncome += amt;
          else if (tx.type === 'expense') accExpense += amt;
        }
      });
      const initial = parseFloat(acc.balance) || 0;
      return sum + initial + accIncome - accExpense;
    }, 0);
  }, [visibleAccounts, visibleTx]);

  const animatedBalance = useCountUp(currentBalance);

  // Resumo por conta: saldo atual de cada uma + movimentação do mês navegado
  const accountsSummary = useMemo(
    () =>
      visibleAccounts.map((acc) => {
        const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
        let allIncome = 0;
        let allExpense = 0;
        let periodIncome = 0;
        let periodExpense = 0;
        visibleTx.forEach((tx) => {
          if (tx.paymentMethod !== accIdStr) return;
          const amt = getEffectiveAmount(tx);
          const d = parseTxDate(tx.date);
          const inPeriod = d && d.getMonth() === navMonth && d.getFullYear() === navYear;
          if (tx.type === 'income') {
            allIncome += amt;
            if (inPeriod) periodIncome += amt;
          } else {
            allExpense += amt;
            if (inPeriod) periodExpense += amt;
          }
        });
        const balance = (parseFloat(acc.balance) || 0) + allIncome - allExpense;
        return { ...acc, balance, periodNet: periodIncome - periodExpense };
      }),
    [visibleAccounts, visibleTx, navMonth, navYear]
  );

  // Resumo por pessoa no mês navegado
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

  // Alertas de assinatura: cobrança prevista pros próximos 5 dias
  const upcomingSubscriptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (subscriptions || [])
      .filter((s) => s.status !== 'pausada' && canAccessPerson(s.person))
      .map((s) => {
        const due = nextBillingDate(s.billingDay, today);
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        return { ...s, diffDays };
      })
      .filter((s) => s.diffDays >= 0 && s.diffDays <= 5)
      .sort((a, b) => a.diffDays - b.diffDays);
  }, [subscriptions, canAccessPerson]);

  function cardNameFor(paymentMethod) {
    if (!paymentMethod?.startsWith('card_')) return 'Conta corrente';
    const card = cards.find((c) => `card_${c.id}` === paymentMethod);
    return card ? `Cartão ${card.name}` : 'Cartão';
  }

  const last14Days = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), net: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    visibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const key = dayKey(d);
      if (!byKey.has(key)) return;
      const amt = getEffectiveAmount(tx);
      byKey.get(key).net += tx.type === 'income' ? amt : -amt;
    });
    let running = 0;
    return buckets.map((b) => {
      running += b.net;
      return { ...b, cumulative: running };
    });
  }, [visibleTx]);

  const netLast14 = last14Days.length ? last14Days[last14Days.length - 1].cumulative : 0;

  const recentTx = useMemo(
    () =>
      [...currentPeriodTxs]
        .sort((a, b) => (parseTxDate(b.date) || 0) - (parseTxDate(a.date) || 0))
        .slice(0, 10),
    [currentPeriodTxs]
  );

  if (loadingTx || loadingAcc) return <div className="page-loading">Carregando...</div>;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h2>Olá, {session.name.split(' ')[0]}</h2>
        <div className="month-nav">
          <button onClick={goPrevMonth} aria-label="Mês anterior">
            <i className="fa-solid fa-chevron-left" />
          </button>
          <span className="month-nav-label">{monthLabel}</span>
          <button onClick={goNextMonth} aria-label="Próximo mês">
            <i className="fa-solid fa-chevron-right" />
          </button>
          {!isCurrentMonth && (
            <button className="btn btn-ghost month-nav-today" onClick={goToday}>
              Hoje
            </button>
          )}
        </div>
      </div>

      {upcomingSubscriptions.length > 0 && (
        <div className="subscription-alerts">
          {upcomingSubscriptions.map((s) => (
            <div className="subscription-alert" key={s.id}>
              <span className="icon-badge subscription-alert-icon">
                <i className="fa-solid fa-bell" />
              </span>
              <div>
                <strong>Assinatura "{s.name}"</strong>
                <div className="subscription-alert-text">
                  Cobrança de {formatCurrency(s.amount)} prevista para{' '}
                  {s.diffDays === 0 ? 'hoje' : s.diffDays === 1 ? 'amanhã' : `em ${s.diffDays} dias`} no{' '}
                  {cardNameFor(s.paymentMethod)}.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hero-balance">
        <div className="hero-balance-info">
          <span className="hero-balance-label">Saldo atual</span>
          <strong className="hero-balance-value">{formatCurrency(animatedBalance)}</strong>
          <span className={`hero-balance-trend ${netLast14 >= 0 ? 'up' : 'down'}`}>
            <i className={`fa-solid ${netLast14 >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
            {formatCurrency(Math.abs(netLast14))} nos últimos 14 dias
          </span>
        </div>
        <div className="hero-balance-chart">
          <FlowChart days={last14Days} />
        </div>
      </div>

      <div className="stat-chips">
        <div className="stat-chip income">
          <span className="icon-badge">
            <i className="fa-solid fa-arrow-down" />
          </span>
          <div>
            <span>Receitas do mês</span>
            <strong>{formatCurrency(totalIncome)}</strong>
          </div>
        </div>
        <div className="stat-chip expense">
          <span className="icon-badge">
            <i className="fa-solid fa-arrow-up" />
          </span>
          <div>
            <span>Despesas do mês</span>
            <strong>{formatCurrency(totalExpense)}</strong>
          </div>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="recent-tx-card">
          <h3>Transações recentes</h3>
          {recentTx.length === 0 ? (
            <p className="empty-state">Nenhuma transação encontrada no período.</p>
          ) : (
            recentTx.map((tx) => (
              <div className="tx-row" key={tx.id}>
                <span className={`tx-icon ${tx.type === 'income' ? 'income' : 'expense'}`}>
                  <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                </span>
                <div className="tx-row-info">
                  <div className="tx-desc">{tx.description}</div>
                  <div className="tx-date">
                    {formatDate(tx.date)} &bull; {tx.category}
                  </div>
                </div>
                <div className={`tx-amount ${tx.type === 'income' ? 'income' : 'expense'}`}>
                  {tx.type === 'income' ? '+ ' : '- '}
                  {formatCurrency(getEffectiveAmount(tx))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="dashboard-side">
          <div className="recent-tx-card">
            <h3>Por conta</h3>
            {accountsSummary.length === 0 ? (
              <p className="empty-state">Nenhuma conta cadastrada.</p>
            ) : (
              accountsSummary.map((acc) => (
                <div className="summary-line" key={acc.id}>
                  <span>{acc.name}</span>
                  <div className="summary-line-values">
                    <strong>{formatCurrency(acc.balance)}</strong>
                    <small className={acc.periodNet >= 0 ? 'income' : 'expense'}>
                      {acc.periodNet >= 0 ? '+' : ''}
                      {formatCurrency(acc.periodNet)} no mês
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="recent-tx-card">
            <h3>Por pessoa</h3>
            {personsSummary.length === 0 ? (
              <p className="empty-state">Nenhuma movimentação no período.</p>
            ) : (
              personsSummary.map((p) => (
                <div className="summary-line" key={p.person}>
                  <span>{p.person}</span>
                  <div className="summary-line-values">
                    <small className="income">+{formatCurrency(p.income)}</small>
                    <small className="expense">-{formatCurrency(p.expense)}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}