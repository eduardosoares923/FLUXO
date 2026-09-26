import React, { useMemo, useState, Suspense, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, parseTxDate } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

const ReportsCharts = lazy(() => import('../components/ReportsCharts'));

export default function Reports() {
  const { session, canAccessPerson } = useAuth() as { session: User; canAccessPerson: (p?: string, tx?: any) => boolean };
  const { data: transactions, loading, error } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: personsList } = useCollection<any>('persons');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedPerson, setSelectedPerson] = useState('todos');
  const [simAmount, setSimAmount] = useState('');
  const [simInstallments, setSimInstallments] = useState(1);

  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean);
    const base = list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
    return base.filter((p) => session.role === 'admin' || canAccessPerson(p));
  }, [personsList, session, canAccessPerson]);

  const accessibleTx = useMemo(() => transactions.filter((tx) => canAccessPerson(tx.person, tx)), [transactions, canAccessPerson]);

  // Tendência dos últimos 6 meses (Receitas x Despesas), pro gráfico de linha
  const last6MonthsTrend = useMemo(() => {
    const buckets: Record<string, { income: number; expense: number }> = {};
    const now = new Date();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      keys.push(k);
      buckets[k] = { income: 0, expense: 0 };
    }
    accessibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[k]) return;
      if (tx.type === 'transfer_out' || tx.type === 'transfer_in' || tx.type === 'invoice_payment') return;
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') buckets[k].income += amt;
      else if (tx.type === 'expense') buckets[k].expense += amt;
    });
    return keys.map((k) => {
      const [y, m] = k.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
      return { month: label, Receitas: buckets[k].income, Despesas: buckets[k].expense };
    });
  }, [accessibleTx]);

  // MOTOR OTIMIZADO 2: Single-Pass Analyzer (1 loop faz o trabalho de 6)
  const { currentTxs, metrics, prevMetrics, categoryStats, personStats } = useMemo(() => {
    const curTxs: Transaction[] = [];
    let curIncome = 0; let curExpense = 0; let curCards = 0;
    let prevIncome = 0; let prevExpense = 0; let prevCards = 0;
    const catMap = new Map(); const pMap = new Map();

    const targetPersonLower = selectedPerson !== 'todos' ? selectedPerson.toLowerCase() : null;

    accessibleTx.forEach(tx => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      let txPersonMatch = false;
      let amtForPerson = Number(tx.amount) || 0;

      if (targetPersonLower) {
        if (tx.isSplit && Array.isArray(tx.splitDetails)) {
          const item = tx.splitDetails.find(d => d.person?.toLowerCase() === targetPersonLower);
          if (item) { txPersonMatch = true; amtForPerson = Number(item.amount) || 0; }
        } else {
          txPersonMatch = !!tx.person?.toLowerCase().includes(targetPersonLower);
        }
        if (!txPersonMatch) return;
      }

      const isCurrent = key === selectedMonth;
      const isPrev = key === prevMonthStr;
      if (!isCurrent && !isPrev) return;

      const isCard = tx.paymentMethod?.startsWith('card_');
      const isExpense = tx.type === 'expense';

      if (isCurrent) {
        curTxs.push(tx);
        if (isCard && isExpense) curCards += amtForPerson;
        else if (!isCard) {
          if (tx.type === 'income') curIncome += amtForPerson;
          else if (isExpense) curExpense += amtForPerson;
        }

        if (isExpense) {
          const cat = tx.category?.trim() || 'Outros';
          catMap.set(cat, (catMap.get(cat) || 0) + amtForPerson);
          
          if (!targetPersonLower) {
            if (tx.isSplit && Array.isArray(tx.splitDetails)) {
              tx.splitDetails.forEach(d => {
                const p = d.person?.trim() || 'Eu';
                pMap.set(p, (pMap.get(p) || 0) + (Number(d.amount) || 0));
              });
            } else {
              const p = tx.person?.trim() || 'Eu';
              pMap.set(p, (pMap.get(p) || 0) + amtForPerson);
            }
          }
        }
      } else if (isPrev) {
        if (isCard && isExpense) prevCards += amtForPerson;
        else if (!isCard) {
          if (tx.type === 'income') prevIncome += amtForPerson;
          else if (isExpense) prevExpense += amtForPerson;
        }
      }
    });

    const totalCurExpense = curExpense + curCards;
    
    // Process Maps to Arrays
    const catArr = [...catMap.entries()]
      .map(([name, value]) => ({ name, value, pct: totalCurExpense > 0 ? (value / totalCurExpense) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    let pTotal = 0; for (const v of pMap.values()) pTotal += v;
    const pArr = [...pMap.entries()]
      .map(([name, value]) => ({ name, value, pct: pTotal > 0 ? (value / pTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    // Equity (Patrimônio)
    const relevantAccounts = accounts.filter((a) => session.role === 'admin' || canAccessPerson(a.owner));
    const equity = relevantAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0) + (Number((a as any).computedBalance) || 0), 0);

    return {
      currentTxs: curTxs,
      metrics: { income: curIncome, expense: curExpense, cardsTotal: curCards, economy: curIncome - totalCurExpense, commitment: curIncome > 0 ? (totalCurExpense / curIncome) * 100 : 0, equity },
      prevMetrics: { income: prevIncome, expense: prevExpense + prevCards, economy: prevIncome - (prevExpense + prevCards) },
      categoryStats: catArr, personStats: pArr
    };
  }, [accessibleTx, selectedMonth, prevMonthStr, selectedPerson, accounts, session, canAccessPerson]);

  // Acerto do Mês: soma as despesas divididas do mês e calcula, por par de pessoas, quem deve quanto a quem.
  const settlements = useMemo(() => {
    const debts = new Map<string, Map<string, number>>();
    const add = (from: string, to: string, amt: number) => {
      if (!debts.has(from)) debts.set(from, new Map());
      const m = debts.get(from)!;
      m.set(to, (m.get(to) || 0) + amt);
    };

    accessibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== selectedMonth) return;
      if (!tx.isSplit || !Array.isArray(tx.splitDetails) || !tx.paidBy) return;
      tx.splitDetails.forEach((s) => {
        if (s.person === tx.paidBy) return; // quem pagou não deve a si mesmo
        add(s.person, tx.paidBy as string, Number(s.amount) || 0);
      });
    });

    const seen = new Set<string>();
    const result: { from: string; to: string; amount: number }[] = [];
    debts.forEach((_, personA) => {
      debts.get(personA)!.forEach((_amt, personB) => {
        const pairKey = [personA, personB].sort().join('__');
        if (seen.has(pairKey)) return;
        seen.add(pairKey);
        const aOwesB = debts.get(personA)?.get(personB) || 0;
        const bOwesA = debts.get(personB)?.get(personA) || 0;
        const net = aOwesB - bOwesA;
        if (Math.abs(net) < 0.01) return;
        if (net > 0) result.push({ from: personA, to: personB, amount: net });
        else result.push({ from: personB, to: personA, amount: -net });
      });
    });
    return result.sort((a, b) => b.amount - a.amount);
  }, [accessibleTx, selectedMonth]);

  const topExpenses = useMemo(() =>
    [...currentTxs]
      .filter((tx) => tx.type === 'expense')
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5),
    [currentTxs]);

  // Projeção de parcelas: soma, por mês futuro, as parcelas já agendadas (o parcelamento já cria todas as transações futuras de uma vez).
  const installmentProjection = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), total: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    accessibleTx.forEach((tx) => {
      if (!tx.groupId || !tx.totalInstallments) return;
      const d = parseTxDate(tx.date);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = byKey.get(key);
      if (m) m.total += Number(tx.installmentAmount ?? tx.amount) || 0;
    });
    return months;
  }, [accessibleTx]);

  const purchaseSimulation = useMemo(() => {
    const amt = parseFloat(simAmount) || 0;
    if (amt <= 0) return null;
    const n = Math.max(1, Math.min(24, simInstallments));
    const perInstallment = Math.round((amt / n) * 100) / 100;
    return installmentProjection.map((m, idx) => ({
      ...m,
      comAcompra: m.total + (idx < n ? perInstallment : 0),
    }));
  }, [simAmount, simInstallments, installmentProjection]);

  // Evolução de Patrimônio: reconstrói o saldo acumulado de meses anteriores subtraindo, do patrimônio de hoje,
  // o fluxo líquido (receita - despesa - pagamento de fatura) de cada mês seguinte. Matemática exata, não uma estimativa.
  const equityHistory = useMemo(() => {
    const now = new Date();
    const netByMonth: Record<string, number> = {};
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      keys.push(k);
      netByMonth[k] = 0;
    }
    accessibleTx.forEach((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!(k in netByMonth)) return;
      if (tx.type === 'transfer_out' || tx.type === 'transfer_in') return; // zero-soma, não muda o patrimônio total
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') netByMonth[k] += amt;
      else if (tx.type === 'expense' || tx.type === 'invoice_payment') netByMonth[k] -= amt;
    });

    const currentEquity = metrics.equity;
    let running = currentEquity;
    const points: { key: string; value: number }[] = [];
    for (let i = keys.length - 1; i >= 0; i--) {
      points.unshift({ key: keys[i], value: running });
      running -= netByMonth[keys[i]];
    }
    return points.map((p) => {
      const [y, m] = p.key.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
      return { month: label, Patrimônio: Math.round(p.value * 100) / 100 };
    });
  }, [accessibleTx, metrics.equity]);

  function handleExportCSV() {
    if (currentTxs.length === 0) return toast.warning('Não há lançamentos no período para exportar.');
    const headers = ['Data', 'Descricao', 'Categoria', 'Pessoa', 'Tipo', 'Valor', 'Metodo'];
    const rows = currentTxs.map((tx) => [
      tx.date, `"${(tx.description || '').replace(/"/g, '""')}"`, `"${(tx.category || '').replace(/"/g, '""')}"`, `"${(tx.person || '').replace(/"/g, '""')}"`,
      tx.type === 'income' ? 'Receita' : (tx.type === 'transfer_out' || tx.type === 'transfer_in') ? 'Transferência' : tx.type === 'invoice_payment' ? 'Pagamento de Fatura' : 'Despesa', Number(tx.amount).toFixed(2).replace('.', ','), tx.paymentMethod || 'Conta',
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `relatorio_${selectedMonth}_${selectedPerson}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Relatório exportado com sucesso!');
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 border-4 border-[#e3b04b] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (error) return <PageError error={error} title="Erro ao carregar relatórios" />;

  const currentTotalExpense = metrics.expense + metrics.cardsTotal;
  const expenseDiff = prevMetrics.expense > 0 ? ((currentTotalExpense - prevMetrics.expense) / prevMetrics.expense) * 100 : 0;
  const incomeDiff = prevMetrics.income > 0 ? ((metrics.income - prevMetrics.income) / prevMetrics.income) * 100 : 0;

  return (
    <div className="animate-in fade-in duration-500 max-w-[1000px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 bg-white/[0.02] border border-white/[0.08] p-4 sm:p-6 rounded-3xl shadow-lg">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Relatórios</h2>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="flex-1 md:flex-none p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
          <select value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)} className="flex-1 md:flex-none p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
            <option value="todos">Todos (Consolidado)</option>
            {availablePersons.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
          <button onClick={handleExportCSV} className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/30 transition-colors" title="Exportar para Excel"><i className="fa-solid fa-file-excel" /></button>
          <button onClick={() => window.print()} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 text-[#f2f0ea] hover:bg-white/20 transition-colors" title="Imprimir / PDF"><i className="fa-solid fa-print" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#34d399]" />
          <span className="block text-[#8fa39a] text-sm uppercase tracking-wider font-semibold mb-1">Receitas</span>
          <strong className="text-2xl sm:text-3xl font-bold text-[#f2f0ea] font-mono block mb-2">{formatCurrency(metrics.income)}</strong>
          {prevMetrics.income > 0 && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${incomeDiff >= 0 ? 'bg-[#34d399]/10 text-[#34d399]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
              <i className={`fa-solid ${incomeDiff >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} /> {Math.abs(incomeDiff).toFixed(1)}% vs anterior
            </span>
          )}
        </div>

        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f87171]" />
          <span className="block text-[#8fa39a] text-sm uppercase tracking-wider font-semibold mb-1">Despesas Totais</span>
          <strong className="text-2xl sm:text-3xl font-bold text-[#f2f0ea] font-mono block mb-2">{formatCurrency(currentTotalExpense)}</strong>
          <span className="text-xs text-[#8fa39a] block mb-2">Contas: {formatCurrency(metrics.expense)} &bull; Cartões: {formatCurrency(metrics.cardsTotal)}</span>
          {prevMetrics.expense > 0 && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${expenseDiff <= 0 ? 'bg-[#34d399]/10 text-[#34d399]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
              <i className={`fa-solid ${expenseDiff <= 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`} /> {Math.abs(expenseDiff).toFixed(1)}% vs anterior
            </span>
          )}
        </div>

        <div className="bg-gradient-to-br from-[#1a2320] to-[#141d1a] border border-white/[0.08] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className={`w-1 absolute top-0 bottom-0 left-0 ${metrics.economy >= 0 ? 'bg-[#34d399]' : 'bg-[#f87171]'}`} />
          <span className="block text-[#8fa39a] text-sm uppercase tracking-wider font-semibold mb-1">Economia Líquida</span>
          <strong className={`text-2xl sm:text-3xl font-bold font-mono block mb-2 ${metrics.economy >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{formatCurrency(metrics.economy)}</strong>
          <span className="text-xs text-[#8fa39a]">Comprometimento: {metrics.commitment.toFixed(1)}%</span>
        </div>
      </div>

      {currentTxs.length > 0 && (
        <div className={`flex items-center gap-4 p-5 rounded-2xl mb-8 border ${metrics.commitment > 70 ? 'bg-red-500/10 border-red-500/20' : metrics.commitment < 50 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${metrics.commitment > 70 ? 'bg-red-500/20 text-red-500' : metrics.commitment < 50 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
            <i className={`fa-solid ${metrics.commitment > 70 ? 'fa-triangle-exclamation' : metrics.commitment < 50 ? 'fa-piggy-bank' : 'fa-chart-line'}`} />
          </div>
          <div className="flex-1">
            <strong className={`block text-lg mb-0.5 ${metrics.commitment > 70 ? 'text-red-400' : metrics.commitment < 50 ? 'text-emerald-400' : 'text-blue-400'}`}>
              {metrics.commitment > 70 ? 'Atenção: Alto Comprometimento de Renda' : metrics.commitment < 50 ? 'Excelente Gestão Financeira' : 'Orçamento sob Controle'}
            </strong>
            <p className="text-sm text-white/70">
              {metrics.commitment > 70 ? `Você comprometeu ${metrics.commitment.toFixed(0)}% da sua receita neste mês. Considere rever despesas.` : metrics.commitment < 50 ? `Você economizou ${formatCurrency(metrics.economy)} este mês. Ótimo momento para aportar.` : `Seus gastos representam ${metrics.commitment.toFixed(0)}% da receita. Sua saúde financeira segue equilibrada.`}
            </p>
          </div>
          <div className="text-center shrink-0 pl-4 border-l border-white/10" title="Indicador simplificado baseado só no % de comprometimento de renda do mês — não é uma métrica financeira precisa.">
            <div className={`text-3xl font-black font-mono ${metrics.commitment > 70 ? 'text-red-400' : metrics.commitment < 50 ? 'text-emerald-400' : 'text-blue-400'}`}>
              {Math.max(0, Math.min(100, Math.round(100 - metrics.commitment)))}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-[#8fa39a] font-bold">Nota do mês</div>
          </div>
        </div>
      )}

      {settlements.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl mb-8">
          <h3 className="text-lg font-bold text-[#f2f0ea] mb-4 flex items-center gap-2"><i className="fa-solid fa-handshake text-[#e3b04b]" /> Acerto do Mês</h3>
          <div className="flex flex-col gap-2">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                <span className="text-sm text-[#f2f0ea]"><strong>{s.from}</strong> deve <strong>{formatCurrency(s.amount)}</strong> para <strong>{s.to}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topExpenses.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl mb-8">
          <h3 className="text-lg font-bold text-[#f2f0ea] mb-4 flex items-center gap-2"><i className="fa-solid fa-ranking-star text-[#e3b04b]" /> Top 5 Maiores Gastos do Mês</h3>
          <div className="flex flex-col gap-2">
            {topExpenses.map((tx, i) => (
              <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#e3b04b]/15 text-[#e3b04b] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#f2f0ea] truncate">{tx.description}</div>
                    <div className="text-xs text-[#8fa39a]">{tx.category} &bull; {tx.person}</div>
                  </div>
                </div>
                <strong className="font-mono text-[#f2f0ea] shrink-0 pl-2">{formatCurrency(tx.amount)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {installmentProjection.some((m) => m.total > 0) && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl mb-8">
          <h3 className="text-lg font-bold text-[#f2f0ea] mb-4 flex items-center gap-2"><i className="fa-solid fa-calendar-days text-[#e3b04b]" /> Projeção de Parcelas (6 meses)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5">
            {(purchaseSimulation || installmentProjection).map((m) => (
              <div key={m.key} className="bg-white/[0.03] rounded-xl p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-[#8fa39a] font-bold mb-1 capitalize">{m.label}</div>
                <div className="font-mono text-sm text-[#f2f0ea]">{formatCurrency(m.total)}</div>
                {purchaseSimulation && (m as any).comAcompra !== m.total && (
                  <div className="font-mono text-xs text-[#e3b04b] mt-0.5">→ {formatCurrency((m as any).comAcompra)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-[#8fa39a] mb-3 flex items-center gap-2"><i className="fa-solid fa-circle-question" /> Simulador "Posso comprar?": compara o que você já tem parcelado com o que ficaria se somar essa compra. Não considera sua receita, é só uma comparação de comprometimento.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="number" step="0.01" placeholder="Valor da compra" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} className="flex-1 p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
              <input type="number" min="1" max="24" placeholder="Em quantas vezes" value={simInstallments} onChange={(e) => setSimInstallments(parseInt(e.target.value) || 1)} className="w-full sm:w-40 p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={<div className="h-40 flex items-center justify-center text-[#8fa39a] text-sm"><i className="fa-solid fa-spinner fa-spin mr-2" /> Carregando gráficos...</div>}>
        <ReportsCharts
          categoryStats={categoryStats}
          personStats={personStats}
          selectedPerson={selectedPerson}
          last6MonthsTrend={last6MonthsTrend}
          equityHistory={equityHistory}
        />
      </Suspense>

      {currentTxs.length === 0 && (
        <EmptyState icon="fa-chart-simple" title="Sem dados para este período" description="Selecione outro mês ou lance transações para visualizar as análises financeiras." />
      )}
    </div>
  );
}
