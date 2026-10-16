import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, parseTxDate, maskCurrency, getCardInvoiceMonth } from '../utils/format';
import { useUIStore } from '../stores/useUIStore';
import { CustomSelect } from '../components/CustomSelect';
import { Tooltip, MonthPicker } from '../components/ui';
import { AndroidAppBanner } from '../components/AndroidAppBanner';
import { Transaction, Account, Card, User } from '../types';

function getEffectiveAmount(tx: Transaction) {
  return parseFloat(String(tx.amount)) || 0;
}

const CATEGORY_ICONS: Record<string, string> = {
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

function iconForCategory(category?: string, type?: string) {
  if (type === 'transfer_out' || type === 'transfer_in') return 'fa-right-left';
  if (type === 'invoice_payment') return 'fa-file-invoice-dollar';
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

function TargetSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 text-pri"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PlusSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M12 5V19" />
      <path d="M5 12H19" />
    </svg>
  );
}

function EyeSvg({ show }: { show: boolean }) {
  if (show) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { session, canAccessPerson } = useAuth() as {
    session: User;
    canAccessPerson: (p?: string, tx?: any) => boolean;
  };
  const { data: transactions, loading: loadingTx } = useCollection<Transaction>('transactions');
  const { data: accounts, loading: loadingAcc } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<Card>('cards');
  const { data: paidInvoices } = useCollection<any>('paidInvoices');
  const { data: goals } = useCollection<any>('goals');
  const { data: personsList } = useCollection<{ id?: string; name?: string }>('persons');

  const { privacyMode, togglePrivacyMode, selectedPeriod, setSelectedPeriod, selectedPerson, setSelectedPerson } =
    useUIStore();

  const [categoryStyles, setCategoryStyles] = useState<Record<string, { icon: string; color: string }>>({});
  useEffect(() => {
    getDoc(doc(db, 'settings', 'categoryStyles'))
      .then((snap) => {
        if (snap.exists()) setCategoryStyles(snap.data() as Record<string, { icon: string; color: string }>);
      })
      .catch((e) => console.error('Erro ao carregar estilos de categoria:', e));
  }, []);

  const [periodYear, periodMonth] = useMemo(() => {
    if (selectedPeriod && selectedPeriod.includes('-')) {
      const parts = selectedPeriod.split('-');
      return [parseInt(parts[0], 10), parseInt(parts[1], 10) - 1];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth()];
  }, [selectedPeriod]);

  const visibleAccounts = useMemo(
    () => (session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.ownerUid || a.owner))),
    [accounts, session, canAccessPerson]
  );

  const visibleTx = useMemo(
    () =>
      transactions
        .filter((tx) => canAccessPerson(tx.person, tx))
        .filter((tx) => selectedPerson === 'all' || tx.person === selectedPerson),
    [transactions, canAccessPerson, selectedPerson]
  );

  const currentPeriodTxs = useMemo(
    () =>
      visibleTx.filter((tx) => {
        const d = parseTxDate(tx.date);
        return d && d.getMonth() === periodMonth && d.getFullYear() === periodYear;
      }),
    [visibleTx, periodMonth, periodYear]
  );

  const personOptions = useMemo(
    () => (personsList || []).map((p) => p.name).filter((n): n is string => Boolean(n) && canAccessPerson(n)),
    [personsList, canAccessPerson]
  );

  useEffect(() => {
    if (selectedPerson !== 'all' && personOptions.length > 0 && !personOptions.includes(selectedPerson)) {
      setSelectedPerson('all');
    }
  }, [personOptions, selectedPerson, setSelectedPerson]);

  const { totalIncome, totalExpense, categoryTotals } = useMemo(() => {
    let income = 0;
    let expense = 0;
    const catMap: Record<string, number> = {};

    currentPeriodTxs.forEach((tx) => {
      const amt = getEffectiveAmount(tx);
      const isTransfer = tx.type === 'transfer_out' || tx.type === 'transfer_in';
      const isInvoicePayment = tx.type === 'invoice_payment';
      const isInc = tx.type === 'income' || tx.type === 'transfer_in';

      if (!isTransfer && !isInvoicePayment) {
        if (isInc) income += amt;
        else {
          expense += amt;
          const cat = tx.category || 'Outros';
          catMap[cat] = (catMap[cat] || 0) + amt;
        }
      }
    });

    return { totalIncome: income, totalExpense: expense, categoryTotals: catMap };
  }, [currentPeriodTxs]);

  const periodBalance = totalIncome - totalExpense;

  // Dias restantes no mês do período
  const daysRemainingInMonth = useMemo(() => {
    const now = new Date();
    const lastDayOfMonth = new Date(periodYear, periodMonth + 1, 0).getDate();
    if (now.getFullYear() === periodYear && now.getMonth() === periodMonth) {
      return Math.max(0, lastDayOfMonth - now.getDate());
    }
    return 0;
  }, [periodYear, periodMonth]);

  // Percentual gasto do que entrou
  const spentPct = useMemo(() => {
    if (totalIncome <= 0) return totalExpense > 0 ? 100 : 0;
    return Math.round((totalExpense / totalIncome) * 100);
  }, [totalIncome, totalExpense]);

  // Cartão com maior fatura aberta ou principal
  const openInvoiceCard = useMemo(() => {
    if (!cards || cards.length === 0) return null;
    const periodKey = `${periodYear}-${String(periodMonth + 1).padStart(2, '0')}`;

    const evaluatedCards = cards.map((c) => {
      const limit = Number(c.limit) || 5000;
      const isPaid = (paidInvoices || []).some(
        (p: any) => String(p.cardId) === String(c.id) && p.month === periodKey
      );
      const openTotal = transactions
        .filter(
          (t) =>
            t.paymentMethod === `card_${c.id}` &&
            (t.invoiceMonth ? t.invoiceMonth === periodKey : (t.date || '').startsWith(periodKey))
        )
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const usedPct = limit > 0 ? Math.min(100, Math.round((openTotal / limit) * 100)) : 0;

      return {
        card: c,
        isPaid,
        openTotal,
        limit,
        usedPct,
        dueDay: c.dueDay || 15,
      };
    });

    // Prefere cartão com fatura aberta > 0, senão o primeiro cartão
    const withOpen = evaluatedCards.find((ec) => !ec.isPaid && ec.openTotal > 0);
    return withOpen || evaluatedCards[0];
  }, [cards, paidInvoices, transactions, periodYear, periodMonth]);

  // Lista de "Para onde foi" (Top 5 categorias ordenadas)
  const topCategories = useMemo(() => {
    const list = Object.entries(categoryTotals).map(([name, amount]) => ({
      name,
      amount,
      pct: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }));
    return list.sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [categoryTotals, totalExpense]);

  // 5 últimas transações
  const recentTransactions = useMemo(() => {
    return [...currentPeriodTxs]
      .sort((a, b) => (parseTxDate(b.date)?.getTime() || 0) - (parseTxDate(a.date)?.getTime() || 0))
      .slice(0, 5);
  }, [currentPeriodTxs]);

  function accountNameFor(pm?: string) {
    if (!pm) return 'Principal';
    if (pm.startsWith('card_')) {
      const found = cards.find((c) => `card_${c.id}` === pm);
      return found ? found.name : 'Cartão';
    }
    if (pm.startsWith('acc_')) {
      const found = visibleAccounts.find((a) => `acc_${a.id}` === pm);
      return found ? found.name : 'Conta';
    }
    return 'Principal';
  }

  // Meta em destaque
  const featuredGoal = useMemo(() => {
    if (!goals || goals.length === 0) return null;
    const sorted = [...goals].sort((a, b) => {
      const targetA = Number(a.targetAmount ?? a.target ?? 1);
      const curA = Number(a.currentAmount ?? a.current ?? 0);
      const targetB = Number(b.targetAmount ?? b.target ?? 1);
      const curB = Number(b.currentAmount ?? b.current ?? 0);
      return curB / targetB - curA / targetA;
    });
    const g = sorted[0];
    const target = Number(g.targetAmount ?? g.target ?? 0);
    const current = Number(g.currentAmount ?? g.current ?? 0);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return { name: g.name || 'Meta Viagem', target, current, pct };
  }, [goals]);

  if (loadingTx || loadingAcc) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-pri border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 sm:pt-6 animate-in fade-in duration-500">
      <AndroidAppBanner />

      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {personOptions.length > 1 && (
            <CustomSelect
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="w-auto shrink-0"
              ariaLabel="Filtrar painel por pessoa"
            >
              <option value="all">Todos</option>
              {personOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </CustomSelect>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <MonthPicker value={selectedPeriod} onChange={setSelectedPeriod} />
          <button
            type="button"
            onClick={() => navigate('/transactions?new=1')}
            onContextMenu={(e) => e.preventDefault()}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-pill bg-fab text-fabIcon font-bold text-sm shadow-sm hover:opacity-95 active:scale-95 transition-all"
          >
            <PlusSvg />
            <span>Nova transação</span>
          </button>
        </div>
      </div>

      {/* LINHA SUPERIOR: Saldo do mês (Verde Hero) + Fatura Aberta */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        {/* Cartão verde com Saldo do mês (Bricolage 56 px) */}
        <div className="lg:col-span-8 rounded-card p-6 sm:p-8 bg-gradient-to-br from-heroStart to-heroEnd text-heroInk shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-heroMuted">
                Saldo do mês
              </span>
              <Tooltip content={privacyMode ? 'Mostrar valores' : 'Esconder valores'}>
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={privacyMode ? 'Mostrar valores' : 'Esconder valores'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-heroMuted hover:text-white transition-colors"
                >
                  <EyeSvg show={!privacyMode} />
                </button>
              </Tooltip>
            </div>

            <div className="font-display text-[40px] sm:text-[56px] font-bold text-white tracking-tight leading-none mb-3 break-all">
              {maskCurrency(periodBalance, privacyMode)}
            </div>

            <p className="text-xs sm:text-sm text-heroMuted mb-3">
              {spentPct > 0 ? `Gastou ${spentPct}% do que entrou` : 'Sem gastos no mês'}
              {daysRemainingInMonth > 0 && `, faltam ${daysRemainingInMonth} dias para fechar o mês`}
            </p>

            {/* Barra de gasto */}
            <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden mb-6">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${Math.min(100, spentPct)}%` }}
              />
            </div>
          </div>

          {/* Receitas e Despesas */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/15">
            <div>
              <span className="block text-xs text-heroMuted font-medium mb-1">Receitas</span>
              <strong className="font-display text-lg sm:text-2xl font-bold text-white">
                {maskCurrency(totalIncome, privacyMode)}
              </strong>
            </div>
            <div>
              <span className="block text-xs text-heroMuted font-medium mb-1">Despesas</span>
              <strong className="font-display text-lg sm:text-2xl font-bold text-white">
                {maskCurrency(totalExpense, privacyMode)}
              </strong>
            </div>
          </div>
        </div>

        {/* Cartão da fatura aberta */}
        <div className="lg:col-span-4 rounded-card p-6 bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <strong className="text-base font-bold text-ink truncate">
                {openInvoiceCard ? openInvoiceCard.card.name : 'Cartão principal'}
              </strong>
              <span className="px-2.5 py-0.5 rounded-pill bg-neutral text-ink text-[11px] font-bold shrink-0">
                {openInvoiceCard?.isPaid ? 'Paga' : 'Aberta'}
              </span>
            </div>

            <p className="text-xs text-muted mb-3">
              {openInvoiceCard
                ? `Fatura de ${new Date(periodYear, periodMonth, 1).toLocaleDateString('pt-BR', { month: 'long' })}, vence dia ${openInvoiceCard.dueDay}`
                : 'Nenhum cartão cadastrado'}
            </p>

            <div className="font-display text-[32px] sm:text-[36px] font-bold text-ink tracking-tight mb-4">
              {maskCurrency(openInvoiceCard?.openTotal || 0, privacyMode)}
            </div>

            {/* Barra de limite usado */}
            <div className="w-full h-2 rounded-full bg-track overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-pri transition-all duration-500"
                style={{ width: `${openInvoiceCard?.usedPct || 0}%` }}
              />
            </div>

            <span className="text-xs text-muted">
              Limite usado {openInvoiceCard?.usedPct || 0}% de{' '}
              {maskCurrency(openInvoiceCard?.limit || 5000, privacyMode)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/cards')}
            onContextMenu={(e) => e.preventDefault()}
            className="text-xs font-bold text-pri hover:underline text-left mt-5"
          >
            Ver faturas
          </button>
        </div>
      </div>

      {/* LINHA DO MEIO: "Para onde foi" + "Últimas transações" */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* "Para onde foi" com barras por categoria */}
        <div className="rounded-card p-6 bg-card border border-border shadow-sm flex flex-col">
          <h3 className="font-display text-lg font-bold text-ink mb-5">Para onde foi</h3>

          {topCategories.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">Nenhuma despesa registrada neste mês.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {topCategories.map((c) => (
                <div key={c.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink truncate">{c.name}</span>
                    <span className="font-mono text-xs font-semibold text-muted shrink-0">
                      {maskCurrency(c.amount, privacyMode)} &bull; {c.pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-track overflow-hidden">
                    <div
                      className="h-full rounded-full bg-pri transition-all duration-500"
                      style={{
                        width: `${c.pct}%`,
                        backgroundColor: categoryStyles[c.name]?.color || undefined,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* "Últimas transações" */}
        <div className="rounded-card p-6 bg-card border border-border shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-ink">Últimas transações</h3>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              onContextMenu={(e) => e.preventDefault()}
              className="text-xs font-bold text-pri hover:underline"
            >
              Ver todas
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">Nenhuma transação no período selecionado.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {recentTransactions.map((tx) => {
                const isInc = tx.type === 'income' || tx.type === 'transfer_in';
                const isTrans = tx.type === 'transfer_out' || tx.type === 'transfer_in';
                const sign = isInc ? '+' : isTrans ? '→' : '-';
                return (
                  <div
                    key={tx.id}
                    onClick={() => navigate(`/transactions?detail=${tx.id}`)}
                    onContextMenu={(e) => e.preventDefault()}
                    className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-neutral/50 -mx-2 px-2 rounded-[14px] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          isInc ? 'bg-priSoft/40 text-pri' : 'bg-spendSoft/40 text-spendText'
                        }`}
                      >
                        <i className={`fa-solid ${categoryStyles[tx.category]?.icon || iconForCategory(tx.category, tx.type)} text-sm`} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-ink truncate">{tx.description}</div>
                        <div className="text-xs text-muted truncate mt-0.5">
                          {formatDate(tx.date)} &bull; {accountNameFor(tx.paymentMethod)}
                        </div>
                      </div>
                    </div>

                    <strong
                      className={`font-mono text-sm font-bold shrink-0 ${
                        isInc ? 'text-pri' : 'text-spendText'
                      }`}
                    >
                      {sign} {maskCurrency(tx.amount, privacyMode)}
                    </strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* LINHA INFERIOR: Cartão da meta em destaque */}
      <div className="rounded-card p-5 bg-card border border-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <div className="w-11 h-11 rounded-2xl bg-neutral flex items-center justify-center shrink-0">
            <TargetSvg />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-ink truncate">
              {featuredGoal ? featuredGoal.name : 'Meta Viagem'}
            </h4>
            <p className="text-xs text-muted mt-0.5">
              {featuredGoal
                ? `Guardado ${maskCurrency(featuredGoal.current, privacyMode)} de ${maskCurrency(featuredGoal.target, privacyMode)}`
                : 'Defina suas metas para acompanhar aqui'}
            </p>
          </div>
        </div>

        <div className="w-full sm:flex-1 max-w-[400px] flex items-center gap-3.5">
          <div className="flex-1 h-3 rounded-full bg-track overflow-hidden">
            <div
              className="h-full rounded-full bg-pri transition-all duration-500"
              style={{ width: `${featuredGoal?.pct || 50}%` }}
            />
          </div>
          <span className="font-display text-lg font-bold text-ink shrink-0">
            {featuredGoal?.pct || 50}%
          </span>
        </div>
      </div>
    </div>
  );
}
