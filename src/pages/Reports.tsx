import React, { useState, useMemo, useEffect } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../stores/useUIStore';
import {
  formatCurrency,
  maskCurrency,
  parseTxDate,
  formatDate,
  normalize,
} from '../utils/format';
import { Transaction, Person, Card } from '../types';
import { toast } from '../stores/useToastStore';
import { auth } from '../firebase';
import { Select } from '../components/ui/Select';
import { MoneyField } from '../components/ui/MoneyField';
import { NumberField } from '../components/ui/NumberField';

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

const MONTH_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function Reports() {
  const { data: transactions } = useCollection<Transaction>('transactions');
  const { data: personsList } = useCollection<Person>('persons');
  const { data: cards } = useCollection<Card>('cards');
  const { data: settingsData } = useCollection<any>('settings');
  const { canAccessTransaction, canAccessPerson, canAccessCard } = useAuth();
  const { privacyMode, selectedPeriod } = useUIStore();

  const [selectedPerson, setSelectedPerson] = useState('todos');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Simulador de compra parcelada
  const [simTotal, setSimTotal] = useState<number>(1800);
  const [simInstallments, setSimInstallments] = useState<number>(10);

  const reportMonth = useMemo(() => {
    if (selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)) {
      return selectedPeriod;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedPeriod]);

  const personOptions = useMemo(
    () =>
      (personsList || [])
        .map((p) => p.name)
        .filter((n): n is string => Boolean(n) && canAccessPerson(n)),
    [personsList, canAccessPerson]
  );

  useEffect(() => {
    if (personOptions.length === 1) {
      setSelectedPerson(personOptions[0]);
    } else if (selectedPerson !== 'todos' && !personOptions.includes(selectedPerson)) {
      setSelectedPerson('todos');
    }
  }, [personOptions, selectedPerson]);

  const budgetsMap = useMemo<Record<string, number>>(() => {
    const doc = (settingsData || []).find((d: any) => d.id === 'budgets');
    if (doc && doc.limits && typeof doc.limits === 'object') {
      return doc.limits;
    }
    return {};
  }, [settingsData]);

  const visibleTxs = useMemo(
    () => (transactions || []).filter((t) => canAccessTransaction(t)),
    [transactions, canAccessTransaction]
  );

  const filterByMonthAndPerson = (ym: string) => {
    const [yr, mo] = ym.split('-').map(Number);
    return visibleTxs.filter((tx) => {
      if (tx.type === 'transfer_in' || tx.type === 'transfer_out' || tx.type === 'invoice_payment') {
        return false;
      }
      const d = parseTxDate(tx.date);
      if (!d) return false;
      if (d.getFullYear() !== yr || d.getMonth() !== mo - 1) return false;

      if (selectedPerson !== 'todos') {
        const target = normalize(selectedPerson);
        const inMain = normalize(tx.person) === target;
        const inSplit =
          tx.isSplit &&
          Array.isArray(tx.splitDetails) &&
          tx.splitDetails.some((s) => normalize(s.person) === target);
        if (!inMain && !inSplit) return false;
      }
      return true;
    });
  };

  const getEffectiveAmount = (tx: Transaction): number => {
    const raw = Number(tx.amount) || 0;
    if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
      const detail = tx.splitDetails.find(
        (s) => normalize(s.person) === normalize(selectedPerson)
      );
      if (detail) return Number(detail.amount) || 0;
    }
    return raw;
  };

  const filteredTxs = useMemo(
    () => filterByMonthAndPerson(reportMonth),
    [visibleTxs, reportMonth, selectedPerson]
  );

  const prevMonthInfo = useMemo(() => {
    const [y, m] = reportMonth.split('-').map(Number);
    const prevDate = new Date(y, (m || 1) - 2, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevName = MONTH_NAMES[prevDate.getMonth()] || 'mês anterior';
    const txs = filterByMonthAndPerson(prevYM);
    let income = 0;
    let expense = 0;
    txs.forEach((tx) => {
      const val = getEffectiveAmount(tx);
      if (tx.type === 'income') income += val;
      else if (tx.type === 'expense') expense += val;
    });
    return { prevYM, prevName, income, expense };
  }, [visibleTxs, reportMonth, selectedPerson]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};

    filteredTxs.forEach((tx) => {
      const val = getEffectiveAmount(tx);
      if (tx.type === 'income') {
        income += val;
      } else if (tx.type === 'expense') {
        expense += val;
        const cat = tx.category || 'Outros';
        byCategory[cat] = (byCategory[cat] || 0) + val;
      }
    });

    const balance = income - expense;
    const savedPct = income > 0 ? Math.round((balance / income) * 100) : 0;
    const committedPct = income > 0 ? Math.round((expense / income) * 100) : expense > 0 ? 100 : 0;

    // Nota do mês
    let grade = 'A+';
    let gradeTitle = 'Ótimo controle';
    let ringProgress = 92;
    if (income <= 0 && expense <= 0) {
      grade = 'A';
      gradeTitle = 'Mês sem gastos';
      ringProgress = 100;
    } else if (committedPct <= 45) {
      grade = 'A+';
      gradeTitle = 'Ótimo controle';
      ringProgress = Math.max(70, 100 - Math.round(committedPct * 0.5));
    } else if (committedPct <= 65) {
      grade = 'A';
      gradeTitle = 'Bom equilíbrio';
      ringProgress = 78;
    } else if (committedPct <= 80) {
      grade = 'B+';
      gradeTitle = 'Dentro do esperado';
      ringProgress = 65;
    } else if (committedPct <= 95) {
      grade = 'B';
      gradeTitle = 'Atenção aos gastos';
      ringProgress = 50;
    } else if (committedPct <= 105) {
      grade = 'C';
      gradeTitle = 'No limite da renda';
      ringProgress = 35;
    } else {
      grade = 'D';
      gradeTitle = 'Acima da renda';
      ringProgress = 20;
    }

    const catEntries = Object.entries(byCategory)
      .map(([name, val]) => {
        const limit = Number(budgetsMap[name]) || 0;
        const pct =
          limit > 0
            ? Math.min(100, (val / limit) * 100)
            : expense > 0
              ? Math.min(100, (val / expense) * 100)
              : 0;
        const isOver = limit > 0 && val > limit;
        return { name, val, limit, pct, isOver };
      })
      .sort((a, b) => b.val - a.val);

    const top5Expenses = filteredTxs
      .filter((tx) => tx.type === 'expense')
      .map((tx) => ({
        id: tx.id || `${tx.description}-${tx.date}`,
        description: tx.description,
        amount: getEffectiveAmount(tx),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      income,
      expense,
      balance,
      savedPct,
      committedPct,
      grade,
      gradeTitle,
      ringProgress,
      catEntries,
      top5Expenses,
    };
  }, [filteredTxs, budgetsMap, selectedPerson]);

  const incomeDiffLabel = useMemo(() => {
    if (prevMonthInfo.income <= 0) {
      return summary.income > 0
        ? `Sem receitas em ${prevMonthInfo.prevName}`
        : `Igual a ${prevMonthInfo.prevName}`;
    }
    const pct = ((summary.income - prevMonthInfo.income) / prevMonthInfo.income) * 100;
    const formatted = Math.abs(pct).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    if (pct >= 0) {
      return `+${formatted}% a mais que ${prevMonthInfo.prevName}`;
    }
    return `-${formatted}% a menos que ${prevMonthInfo.prevName}`;
  }, [summary.income, prevMonthInfo]);

  const expenseDiffInfo = useMemo(() => {
    if (prevMonthInfo.expense <= 0) {
      return {
        text:
          summary.expense > 0
            ? `Sem despesas em ${prevMonthInfo.prevName}`
            : `Igual a ${prevMonthInfo.prevName}`,
        positive: summary.expense <= 0,
      };
    }
    const pct = ((summary.expense - prevMonthInfo.expense) / prevMonthInfo.expense) * 100;
    const formatted = Math.abs(pct).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    if (pct <= 0) {
      return {
        text: `-${formatted}% a menos que ${prevMonthInfo.prevName}`,
        positive: true,
      };
    }
    return {
      text: `+${formatted}% a mais que ${prevMonthInfo.prevName}`,
      positive: false,
    };
  }, [summary.expense, prevMonthInfo]);

  // Acerto do mês (compensação líquida entre pares)
  const settlements = useMemo(() => {
    const [yr, mo] = reportMonth.split('-').map(Number);
    const monthAllTxs = visibleTxs.filter((tx) => {
      if (tx.type !== 'expense') return false;
      const d = parseTxDate(tx.date);
      return d && d.getFullYear() === yr && d.getMonth() === mo - 1;
    });

    // netMatrix[debtor][creditor] = valor
    const pairDebts: Record<string, Record<string, number>> = {};

    monthAllTxs.forEach((tx) => {
      if (!tx.isSplit || !Array.isArray(tx.splitDetails) || tx.splitDetails.length === 0) return;
      const payer = (tx.paidBy || tx.person?.split(',')[0] || '').trim();
      if (!payer) return;

      tx.splitDetails.forEach((sd) => {
        const debtor = (sd.person || '').trim();
        const share = Number(sd.amount) || 0;
        if (!debtor || share <= 0 || normalize(debtor) === normalize(payer)) return;
        if (!pairDebts[debtor]) pairDebts[debtor] = {};
        pairDebts[debtor][payer] = (pairDebts[debtor][payer] || 0) + share;
      });
    });

    const people = Array.from(
      new Set([
        ...Object.keys(pairDebts),
        ...Object.values(pairDebts).flatMap((m) => Object.keys(m)),
      ])
    );

    const results: { from: string; to: string; amount: number }[] = [];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const pA = people[i];
        const pB = people[j];
        const aOwesB = pairDebts[pA]?.[pB] || 0;
        const bOwesA = pairDebts[pB]?.[pA] || 0;
        const net = Number((aOwesB - bOwesA).toFixed(2));
        if (net > 0.01) {
          results.push({ from: pA, to: pB, amount: net });
        } else if (net < -0.01) {
          results.push({ from: pB, to: pA, amount: Math.abs(net) });
        }
      }
    }

    return results.sort((a, b) => b.amount - a.amount);
  }, [visibleTxs, reportMonth]);

  // Projeção de parcelas (próximos 6 meses a partir do mês selecionado)
  const installmentProjection = useMemo(() => {
    const [yr, mo] = reportMonth.split('-').map(Number);
    const buckets: { ym: string; label: string; total: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(yr, (mo || 1) - 1 + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = MONTH_SHORT[d.getMonth()];

      let sum = 0;
      visibleTxs.forEach((tx) => {
        if (tx.type !== 'expense') return;
        const totalInst = Number(tx.totalInstallments) || 1;
        if (totalInst <= 1) return;
        const txD = parseTxDate(tx.date);
        if (!txD) return;
        const txYM = `${txD.getFullYear()}-${String(txD.getMonth() + 1).padStart(2, '0')}`;
        if (txYM === ym || tx.invoiceMonth === ym) {
          sum += getEffectiveAmount(tx);
        }
      });

      buckets.push({ ym, label, total: sum });
    }

    const maxVal = Math.max(...buckets.map((b) => b.total), 1);
    return buckets.map((b, idx) => ({
      ...b,
      heightPct: b.total > 0 ? Math.max(16, Math.round((b.total / maxVal) * 100)) : 8,
      isPrimary: idx < 2,
    }));
  }, [visibleTxs, reportMonth, selectedPerson]);

  // Simulador
  const simResult = useMemo(() => {
    const n = Math.max(1, Number(simInstallments) || 1);
    const total = Math.max(0, Number(simTotal) || 0);
    const perMonth = total / n;
    const pctIncome =
      summary.income > 0
        ? ((perMonth / summary.income) * 100).toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
        : null;
    return { n, total, perMonth, pctIncome };
  }, [simTotal, simInstallments, summary.income]);

  const handleExportCSV = () => {
    if (filteredTxs.length === 0) {
      toast.warning('Não há transações no período selecionado.');
      return;
    }
    let csv = 'Data;Descricao;Categoria;Pessoa;Tipo;Valor\n';
    filteredTxs.forEach((t) => {
      const d = formatDate(t.date);
      const desc = `"${(t.description || '').replace(/"/g, '""')}"`;
      const cat = `"${t.category || ''}"`;
      const p = `"${t.person || ''}"`;
      const type = t.type === 'income' ? 'Receita' : 'Despesa';
      const val = getEffectiveAmount(t).toFixed(2).replace('.', ',');
      csv += `${d};${desc};${cat};${p};${type};${val}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${reportMonth}_${selectedPerson}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado.');
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    const user = auth?.currentUser;
    if (!user) {
      toast.error('Sua sessão no Firebase expirou. Saia e entre novamente.');
      return;
    }
    setExportingExcel(true);
    setExportMenuOpen(false);
    toast.info('Gerando planilha Excel...');
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/export-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          period: reportMonth,
          person: selectedPerson,
        }),
      });
      if (!resp.ok) {
        let msg = `Erro ${resp.status} ao gerar o Excel.`;
        try {
          const errJson = await resp.json();
          if (errJson?.error) msg = errJson.error;
        } catch {
          // ignora
        }
        toast.error(msg);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Wynd-Relatorio-${reportMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Planilha Excel baixada.');
    } catch {
      toast.error('Não foi possível conectar à função de exportação.');
    } finally {
      setExportingExcel(false);
    }
  };

  const circleRadius = 22;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset =
    circleCircumference - (summary.ringProgress / 100) * circleCircumference;

  return (
    <div className="space-y-5 pb-8">
      {/* Header Filters & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          {personOptions.length === 1 ? (
            <span className="px-4 min-h-[42px] inline-flex items-center rounded-[18px] bg-card border border-border text-sm font-bold text-ink">
              {personOptions[0]}
            </span>
          ) : (
            <div className="w-48">
              <Select
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                ariaLabel="Filtrar por pessoa"
              >
                <option value="todos">Todas as pessoas</option>
                {personOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          <div className="relative">
            <button
              type="button"
              disabled={exportingExcel}
              onClick={() => setExportMenuOpen((v) => !v)}
              className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-sm flex items-center gap-2 hover:border-pri/40 transition-colors disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              <span>{exportingExcel ? 'Gerando...' : 'Exportar'}</span>
            </button>

            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-60 rounded-[20px] bg-card border border-border shadow-2xl z-50 p-1.5">
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="w-full text-left px-3.5 py-2.5 rounded-[14px] text-sm font-semibold text-ink hover:bg-neutral flex items-center gap-2.5 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-pri shrink-0" />
                    <div>
                      <div>Excel formatado (.xlsx)</div>
                      <div className="text-[11px] text-muted font-normal">
                        Resumo, categorias e lançamentos
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      handleExportCSV();
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-[14px] text-sm font-semibold text-ink hover:bg-neutral flex items-center gap-2.5 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
                    <div>
                      <div>CSV simples (.csv)</div>
                      <div className="text-[11px] text-muted font-normal">
                        Lista rápida de transações
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-sm flex items-center gap-2 hover:border-pri/40 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Receitas</div>
          <div className="font-display text-2xl font-bold text-ink tracking-tight">
            {maskCurrency(summary.income, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-pri mt-1.5">{incomeDiffLabel}</div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Despesas</div>
          <div className="font-display text-2xl font-bold text-ink tracking-tight">
            {maskCurrency(summary.expense, privacyMode)}
          </div>
          <div
            className={`text-xs font-semibold mt-1.5 ${
              expenseDiffInfo.positive ? 'text-pri' : 'text-spendText'
            }`}
          >
            {expenseDiffInfo.text}
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">Saldo do mês</div>
          <div
            className={`font-display text-2xl font-bold tracking-tight ${
              summary.balance >= 0 ? 'text-pri' : 'text-spendText'
            }`}
          >
            {maskCurrency(summary.balance, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-pri mt-1.5">
            {summary.income > 0
              ? summary.balance >= 0
                ? `Sobrou ${summary.savedPct}% da renda`
                : `Excedeu ${Math.abs(summary.savedPct)}% da renda`
              : 'Sem receitas registradas'}
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs flex items-center gap-4">
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r={circleRadius}
                fill="none"
                stroke="var(--track)"
                strokeWidth="5"
              />
              <circle
                cx="28"
                cy="28"
                r={circleRadius}
                fill="none"
                stroke={summary.committedPct > 95 ? 'var(--spend)' : 'var(--pri)'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <span className="absolute font-display text-sm font-bold text-ink">
              {summary.grade}
            </span>
          </div>

          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted">Nota do mês</div>
            <div className="font-display text-base font-bold text-ink truncate">
              {summary.gradeTitle}
            </div>
            <div className="text-xs text-muted mt-0.5">
              Compromete {summary.committedPct}% da renda
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Gastos por categoria (with budgets) & Top 5 maiores gastos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <h2 className="font-display text-base font-bold text-ink mb-4">
            Gastos por categoria
          </h2>

          {summary.catEntries.length === 0 ? (
            <p className="text-xs text-muted py-8 text-center">
              Nenhuma despesa registrada neste mês.
            </p>
          ) : (
            <div className="space-y-4">
              {summary.catEntries.map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink">{item.name}</span>
                    <span
                      className={
                        item.isOver
                          ? 'font-bold text-spendText'
                          : 'font-semibold text-muted'
                      }
                    >
                      {item.limit > 0
                        ? `${maskCurrency(item.val, privacyMode)} de ${maskCurrency(item.limit, privacyMode)}`
                        : maskCurrency(item.val, privacyMode)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-track overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.isOver ? 'bg-spend' : 'bg-pri'
                      }`}
                      style={{ width: `${Math.max(4, item.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <h2 className="font-display text-base font-bold text-ink mb-4">
            Top 5 maiores gastos
          </h2>

          {summary.top5Expenses.length === 0 ? (
            <p className="text-xs text-muted py-8 text-center">
              Sem gastos lançados neste mês.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {summary.top5Expenses.map((tx, idx) => (
                <div
                  key={tx.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted w-4">{idx + 1}</span>
                    <span className="text-sm font-bold text-ink truncate">
                      {tx.description}
                    </span>
                  </div>
                  <span className="font-display text-sm font-bold text-spendText shrink-0">
                    {maskCurrency(tx.amount, privacyMode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Acerto do mês | Projeção de parcelas | Simular compra parcelada */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Acerto do mês */}
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">Acerto do mês</h2>
            <p className="text-xs text-muted mt-1">
              Despesas divididas entre as pessoas da família.
            </p>
          </div>

          {settlements.length === 0 ? (
            <div className="rounded-[18px] bg-priSoft p-4 flex items-center justify-between">
              <span className="text-xs font-bold text-priInk">
                Nenhum acerto pendente no mês
              </span>
              <span className="font-display text-sm font-bold text-priInk">R$ 0,00</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {settlements.map((s, i) => (
                <div
                  key={`${s.from}-${s.to}-${i}`}
                  className="rounded-[18px] bg-priSoft p-4 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-bold text-priInk">
                    {s.from} deve a {s.to}
                  </span>
                  <span className="font-display text-base font-bold text-priInk shrink-0">
                    {maskCurrency(s.amount, privacyMode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projeção de parcelas */}
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs flex flex-col justify-between gap-4">
          <h2 className="font-display text-base font-bold text-ink">
            Projeção de parcelas
          </h2>

          <div className="grid grid-cols-6 gap-2.5 items-end h-28 pt-2">
            {installmentProjection.map((bar) => (
              <div
                key={bar.ym}
                className="flex flex-col items-center justify-end h-full gap-1.5"
              >
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-[8px] transition-all ${
                      bar.isPrimary ? 'bg-pri' : 'bg-pri/45'
                    }`}
                    style={{ height: `${bar.heightPct}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-muted">{bar.label}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">Parcelas a pagar nos próximos meses.</p>
        </div>

        {/* Simular compra parcelada */}
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs flex flex-col justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">
            Simular compra parcelada
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted mb-1">
                Valor da compra
              </label>
              <MoneyField
                value={simTotal}
                onValueChange={setSimTotal}
                ariaLabel="Valor da compra"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1">
                Em quantas vezes
              </label>
              <NumberField
                value={simInstallments}
                onValueChange={setSimInstallments}
                min={1}
                max={48}
                ariaLabel="Em quantas vezes"
              />
            </div>
          </div>

          <div className="rounded-[18px] bg-priSoft p-3.5 text-xs font-semibold text-priInk leading-relaxed">
            {formatCurrency(simResult.total)} em {simResult.n}x são{' '}
            <span className="font-bold">{formatCurrency(simResult.perMonth)}</span> por mês
            {simResult.pctIncome ? `, ${simResult.pctIncome}% da renda.` : '.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;
