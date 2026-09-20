import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, parseTxDate } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { toast } from '../stores/useToastStore';
import { Transaction, Account, User } from '../types';

export default function Reports() {
  const { session, canAccessPerson } = useAuth() as { session: User; canAccessPerson: (p?: string | null, tx?: any) => boolean };
  const { data: transactions, loading, error } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: personsList } = useCollection<{ name?: string }>('persons');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedPerson, setSelectedPerson] = useState('todos');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
    const base = list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
    return base.filter((p) => session?.role === 'admin' || canAccessPerson(p));
  }, [personsList, session, canAccessPerson]);

  const accessibleTx = useMemo(
    () => transactions.filter((tx) => canAccessPerson(tx.person, tx)),
    [transactions, canAccessPerson]
  );

  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  function filterByPersonAndMonth(txs: Transaction[], monthKey: string, personKey: string) {
    return txs.filter((tx) => {
      const d = parseTxDate(tx.date);
      if (!d) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== monthKey) return false;

      if (personKey === 'todos') return true;
      const targetLower = personKey.toLowerCase();
      if (tx.isSplit && Array.isArray(tx.splitDetails)) {
        return tx.splitDetails.some((item) => item.person?.toLowerCase() === targetLower);
      }
      return tx.person?.toLowerCase().includes(targetLower);
    });
  }

  const currentTxs = useMemo(() => filterByPersonAndMonth(accessibleTx, selectedMonth, selectedPerson), [accessibleTx, selectedMonth, selectedPerson]);
  const prevTxs = useMemo(() => filterByPersonAndMonth(accessibleTx, prevMonthStr, selectedPerson), [accessibleTx, prevMonthStr, selectedPerson]);

  const metrics = useMemo(() => {
    let income = 0; let expense = 0; let cardsTotal = 0;
    currentTxs.forEach((tx) => {
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find((d) => d.person?.toLowerCase() === selectedPerson.toLowerCase());
        if (item) amt = Number(item.amount) || 0;
      }
      if (tx.paymentMethod?.startsWith('card_')) {
        if (tx.type === 'expense') cardsTotal += amt;
      } else {
        if (tx.type === 'income') income += amt;
        else if (tx.type === 'expense') expense += amt;
      }
    });

    const economy = income - expense - cardsTotal;
    const commitment = income > 0 ? ((expense + cardsTotal) / income) * 100 : 0;
    
    const relevantAccounts = accounts.filter((a) => session?.role === 'admin' || canAccessPerson(a.owner));
    const equity = relevantAccounts.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);

    return { income, expense, cardsTotal, economy, commitment, equity };
  }, [currentTxs, selectedPerson, accounts, session, canAccessPerson]);

  const prevMetrics = useMemo(() => {
    let income = 0; let expense = 0; let cardsTotal = 0;
    prevTxs.forEach((tx) => {
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find((d) => d.person?.toLowerCase() === selectedPerson.toLowerCase());
        if (item) amt = Number(item.amount) || 0;
      }
      if (tx.paymentMethod?.startsWith('card_')) {
        if (tx.type === 'expense') cardsTotal += amt;
      } else {
        if (tx.type === 'income') income += amt;
        else if (tx.type === 'expense') expense += amt;
      }
    });
    const totalExpense = expense + cardsTotal;
    return { income, expense: totalExpense, economy: income - totalExpense };
  }, [prevTxs, selectedPerson]);

  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;
    currentTxs.forEach((tx) => {
      if (tx.type !== 'expense') return;
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find((d) => d.person?.toLowerCase() === selectedPerson.toLowerCase());
        if (item) amt = Number(item.amount) || 0;
      }
      const cat = tx.category?.trim() || 'Outros';
      map[cat] = (map[cat] || 0) + amt;
      totalExpense += amt;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: totalExpense > 0 ? (value / totalExpense) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [currentTxs, selectedPerson]);

  const personStats = useMemo(() => {
    if (selectedPerson !== 'todos') return [];
    const map: Record<string, number> = {};
    let total = 0;
    currentTxs.forEach((tx) => {
      if (tx.type !== 'expense') return;
      if (tx.isSplit && Array.isArray(tx.splitDetails)) {
        tx.splitDetails.forEach((d) => {
          const p = d.person?.trim() || 'Eu';
          map[p] = (map[p] || 0) + (Number(d.amount) || 0);
          total += Number(d.amount) || 0;
        });
      } else {
        const p = tx.person?.trim() || 'Eu';
        const amt = Number(tx.amount) || 0;
        map[p] = (map[p] || 0) + amt;
        total += amt;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [currentTxs, selectedPerson]);

  function handleExportCSV(separator = ';') {
    if (currentTxs.length === 0) return toast.warning('Não há lançamentos no período para exportar.');
    const headers = ['Data', 'Descricao', 'Categoria', 'Pessoa', 'Tipo', 'Valor', 'Metodo'];
    const rows = currentTxs.map((tx) => [
      tx.date, `"${(tx.description || '').replace(/"/g, '""')}"`, `"${(tx.category || '').replace(/"/g, '""')}"`,
      `"${(tx.person || '').replace(/"/g, '""')}"`, tx.type === 'income' ? 'Receita' : 'Despesa',
      Number(tx.amount).toFixed(2).replace('.', ','), tx.paymentMethod || 'Conta',
    ]);
    const csvContent = '\uFEFF' + [headers.join(separator), ...rows.map((r) => r.join(separator))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${selectedMonth}_${selectedPerson}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Relatório exportado com sucesso!');
  }

  if (loading) return <PageLoading message="Calculando relatórios financeiros..." />;
  if (error) return <PageError error={error as Error} title="Erro ao carregar relatórios" />;

  const currentTotalExpense = metrics.expense + metrics.cardsTotal;
  const expenseDiff = prevMetrics.expense > 0 ? ((currentTotalExpense - prevMetrics.expense) / prevMetrics.expense) * 100 : 0;
  const incomeDiff = prevMetrics.income > 0 ? ((metrics.income - prevMetrics.income) / prevMetrics.income) * 100 : 0;

  return (
    <div className="animate-in fade-in duration-500 max-w-[1100px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h2 className="text-[1.6rem] font-bold text-[#f2f0ea]">Relatórios e Análises</h2>

        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} 
            className="p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none"
          />
          <select 
            value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)}
            className="p-2.5 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#e3b04b] outline-none"
          >
            <option value="todos">Todos (Consolidado)</option>
            {availablePersons.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => handleExportCSV(';')} className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-[#10b981] font-semibold transition-colors flex items-center gap-2 border border-white/5">
            <i className="fa-solid fa-file-excel" /> Excel
          </button>
          <button onClick={() => window.print()} className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-[#f2f0ea] font-semibold transition-colors flex items-center gap-2 border border-white/5">
            <i className="fa-solid fa-print" /> Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#34d399]" />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Receitas</span>
          <strong className="text-3xl font-bold font-mono tracking-tight text-[#f2f0ea]">{formatCurrency(metrics.income)}</strong>
          {prevMetrics.income > 0 && (
            <div className={`mt-2 text-[0.8rem] font-medium flex items-center gap-1 ${incomeDiff >= 0 ? 'text-[#34d399]' : 'text-red-400'}`}>
              <i className={`fa-solid ${incomeDiff >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
              {incomeDiff >= 0 ? '+' : ''}{incomeDiff.toFixed(1)}% vs mês passado
            </div>
          )}
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f87171]" />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Despesas Totais</span>
          <strong className="text-3xl font-bold font-mono tracking-tight text-[#f2f0ea]">{formatCurrency(currentTotalExpense)}</strong>
          <div className="mt-2 text-[0.75rem] text-[#8fa39a]">
            Contas: {formatCurrency(metrics.expense)} | Cartões: {formatCurrency(metrics.cardsTotal)}
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 flex flex-col relative overflow-hidden">
          <div className={`w-1 absolute top-0 bottom-0 left-0 ${metrics.economy >= 0 ? 'bg-[#34d399]' : 'bg-[#f87171]'}`} />
          <span className="text-[0.8rem] uppercase tracking-wide text-[#8fa39a] font-semibold mb-1">Economia Líquida</span>
          <strong className={`text-3xl font-bold font-mono tracking-tight ${metrics.economy >= 0 ? 'text-[#34d399]' : 'text-red-400'}`}>
            {formatCurrency(metrics.economy)}
          </strong>
          <div className="mt-2 text-[0.75rem] text-[#8fa39a]">
            Comprometimento: {metrics.commitment.toFixed(1)}% da renda
          </div>
        </div>
      </div>

      {currentTxs.length > 0 && (
        <div className={`mb-6 p-5 rounded-2xl border flex flex-col sm:flex-row items-center gap-5 ${
          metrics.commitment > 70 ? 'bg-red-500/10 border-red-500/20' : 
          metrics.commitment < 50 ? 'bg-[#34d399]/10 border-[#34d399]/20' : 
          'bg-[#4d8dff]/10 border-[#4d8dff]/20'
        }`}>
          <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl ${
            metrics.commitment > 70 ? 'bg-red-500/20 text-red-400' : 
            metrics.commitment < 50 ? 'bg-[#34d399]/20 text-[#34d399]' : 
            'bg-[#4d8dff]/20 text-[#4d8dff]'
          }`}>
            <i className={`fa-solid ${metrics.commitment > 70 ? 'fa-triangle-exclamation' : metrics.commitment < 50 ? 'fa-piggy-bank' : 'fa-chart-line'}`} />
          </div>
          <div>
            <strong className="block text-lg mb-1 text-[#f2f0ea]">
              {metrics.commitment > 70 ? 'Atenção: Alto Comprometimento de Renda' : 
               metrics.commitment < 50 ? 'Excelente Gestão Financeira' : 
               'Orçamento sob Controle'}
            </strong>
            <p className="text-[0.9rem] text-[#8fa39a] leading-relaxed">
              {metrics.commitment > 70 ? `Você comprometeu ${metrics.commitment.toFixed(0)}% da sua receita neste mês. Considere cortar despesas supérfluas.` : 
               metrics.commitment < 50 ? `Você economizou ${formatCurrency(metrics.economy)} este mês (${(100 - metrics.commitment).toFixed(0)}% livre). Ótimo momento para aportar em investimentos.` : 
               `Seus gastos representam ${metrics.commitment.toFixed(0)}% da receita. Sua saúde financeira segue equilibrada.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-3 text-[#f2f0ea]">
            <span className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center"><i className="fa-solid fa-chart-pie" /></span>
            Despesas por Categoria
          </h3>
          {categoryStats.length === 0 ? (
            <p className="text-center text-[#8fa39a] py-8">Nenhuma despesa registrada.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {categoryStats.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-[0.85rem] mb-1.5">
                    <span className="font-semibold text-[#f2f0ea]">{cat.name}</span>
                    <span className="text-[#8fa39a]">{formatCurrency(cat.value)} <span className="opacity-60">({cat.pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedPerson === 'todos' && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-3 text-[#f2f0ea]">
              <span className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center"><i className="fa-solid fa-users" /></span>
              Distribuição por Pessoa
            </h3>
            {personStats.length === 0 ? (
              <p className="text-center text-[#8fa39a] py-8">Nenhum rateio registrado.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {personStats.map((p) => (
                  <div key={p.name}>
                    <div className="flex justify-between text-[0.85rem] mb-1.5">
                      <span className="font-semibold text-[#f2f0ea]">{p.name}</span>
                      <span className="text-[#8fa39a]">{formatCurrency(p.value)} <span className="opacity-60">({p.pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {currentTxs.length === 0 && (
        <div className="mt-8">
          <EmptyState icon="fa-chart-simple" title="Sem dados para este período" description="Selecione outro mês ou lance transações para visualizar as análises financeiras." />
        </div>
      )}
    </div>
  );
}
