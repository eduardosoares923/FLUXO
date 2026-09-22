import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, parseTxDate } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

const PIE_COLORS = ['#e3b04b', '#3b82f6', '#8b5cf6', '#10b981', '#f87171', '#06b6d4', '#f59e0b', '#ec4899'];

export default function Reports() {
  const { session, canAccessPerson } = useAuth() as { session: User; canAccessPerson: (p?: string, tx?: any) => boolean };
  const { data: transactions, loading, error } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: personsList } = useCollection<any>('persons');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedPerson, setSelectedPerson] = useState('todos');

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
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') buckets[k].income += amt;
      else buckets[k].expense += amt;
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

  function handleExportCSV() {
    if (currentTxs.length === 0) return toast.warning('Não há lançamentos no período para exportar.');
    const headers = ['Data', 'Descricao', 'Categoria', 'Pessoa', 'Tipo', 'Valor', 'Metodo'];
    const rows = currentTxs.map((tx) => [
      tx.date, `"${(tx.description || '').replace(/"/g, '""')}"`, `"${(tx.category || '').replace(/"/g, '""')}"`, `"${(tx.person || '').replace(/"/g, '""')}"`,
      tx.type === 'income' ? 'Receita' : 'Despesa', Number(tx.amount).toFixed(2).replace('.', ','), tx.paymentMethod || 'Conta',
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
          <span className="text-xs text-[#8fa39a]">Contas: {formatCurrency(metrics.expense)} &bull; Cartões: {formatCurrency(metrics.cardsTotal)}</span>
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
          <div>
            <strong className={`block text-lg mb-0.5 ${metrics.commitment > 70 ? 'text-red-400' : metrics.commitment < 50 ? 'text-emerald-400' : 'text-blue-400'}`}>
              {metrics.commitment > 70 ? 'Atenção: Alto Comprometimento de Renda' : metrics.commitment < 50 ? 'Excelente Gestão Financeira' : 'Orçamento sob Controle'}
            </strong>
            <p className="text-sm text-white/70">
              {metrics.commitment > 70 ? `Você comprometeu ${metrics.commitment.toFixed(0)}% da sua receita neste mês. Considere rever despesas.` : metrics.commitment < 50 ? `Você economizou ${formatCurrency(metrics.economy)} este mês. Ótimo momento para aportar.` : `Seus gastos representam ${metrics.commitment.toFixed(0)}% da receita. Sua saúde financeira segue equilibrada.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl">
          <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-chart-pie text-[#8b5cf6]" /> Despesas por Categoria</h3>
          {categoryStats.length === 0 ? (
            <p className="text-[#8fa39a] text-center py-6">Nenhuma despesa registrada.</p>
          ) : (
            <>
            <div style={{ width: '100%', height: 220 }} className="mb-4">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categoryStats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {categoryStats.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#141d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-5">
              {categoryStats.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-sm mb-2"><span className="font-medium text-[#f2f0ea]">{cat.name}</span><span className="text-[#f2f0ea] font-mono">{formatCurrency(cat.value)} <span className="text-[#8fa39a] ml-1">({cat.pct.toFixed(1)}%)</span></span></div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] rounded-full" style={{ width: `${cat.pct}%` }} /></div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

        {selectedPerson === 'todos' && (
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl">
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-users text-[#10b981]" /> Distribuição por Pessoa</h3>
            {personStats.length === 0 ? (
              <p className="text-[#8fa39a] text-center py-6">Nenhuma despesa para rateio.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {personStats.map((p) => (
                  <div key={p.name}>
                    <div className="flex justify-between text-sm mb-2"><span className="font-medium text-[#f2f0ea]">{p.name}</span><span className="text-[#f2f0ea] font-mono">{formatCurrency(p.value)} <span className="text-[#8fa39a] ml-1">({p.pct.toFixed(1)}%)</span></span></div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#10b981] to-[#06b6d4] rounded-full" style={{ width: `${p.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl mb-8">
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-chart-line text-[#e3b04b]" /> Evolução dos Últimos 6 Meses</h3>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={last6MonthsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="month" stroke="#8fa39a" fontSize={12} />
              <YAxis stroke="#8fa39a" fontSize={12} tickFormatter={(v) => formatCurrency(v).replace('R$', '')} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#141d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="Receitas" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Despesas" stroke="#f87171" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {currentTxs.length === 0 && (
        <EmptyState icon="fa-chart-simple" title="Sem dados para este período" description="Selecione outro mês ou lance transações para visualizar as análises financeiras." />
      )}
    </div>
  );
}
