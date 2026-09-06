import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, parseTxDate } from '../utils/format';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { toast } from '../stores/useToastStore';

export default function Reports() {
  const { session, canAccessPerson } = useAuth();
  const { data: transactions, loading, error } = useCollection('transactions');
  const { data: accounts } = useCollection('accounts');
  const { data: cards } = useCollection('cards');
  const { data: personsList } = useCollection('persons');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedPerson, setSelectedPerson] = useState('todos');

  // Pessoas disponíveis
  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean);
    const base = list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
    return base.filter((p) => session.role === 'admin' || canAccessPerson(p));
  }, [personsList, session, canAccessPerson]);

  // Transações permitidas
  const accessibleTx = useMemo(
    () => transactions.filter((tx) => canAccessPerson(tx.person, tx)),
    [transactions, canAccessPerson]
  );

  // Mês anterior para comparação
  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  // Filtro por pessoa e mês
  function filterByPersonAndMonth(txs, monthKey, personKey) {
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

  const currentTxs = useMemo(
    () => filterByPersonAndMonth(accessibleTx, selectedMonth, selectedPerson),
    [accessibleTx, selectedMonth, selectedPerson]
  );

  const prevTxs = useMemo(
    () => filterByPersonAndMonth(accessibleTx, prevMonthStr, selectedPerson),
    [accessibleTx, prevMonthStr, selectedPerson]
  );

  // Totais do mês atual
  const metrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cardsTotal = 0;

    currentTxs.forEach((tx) => {
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find(
          (d) => d.person?.toLowerCase() === selectedPerson.toLowerCase()
        );
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

    // Patrimônio líquido em contas
    const relevantAccounts = accounts.filter(
      (a) => session.role === 'admin' || canAccessPerson(a.owner)
    );
    const equity = relevantAccounts.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);

    return { income, expense, cardsTotal, economy, commitment, equity };
  }, [currentTxs, selectedPerson, accounts, session, canAccessPerson]);

  // Totais do mês anterior para comparação
  const prevMetrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cardsTotal = 0;

    prevTxs.forEach((tx) => {
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find(
          (d) => d.person?.toLowerCase() === selectedPerson.toLowerCase()
        );
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

  // Despesas por categoria
  const categoryStats = useMemo(() => {
    const map = {};
    let totalExpense = 0;

    currentTxs.forEach((tx) => {
      if (tx.type !== 'expense') return;
      let amt = Number(tx.amount) || 0;
      if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
        const item = tx.splitDetails.find(
          (d) => d.person?.toLowerCase() === selectedPerson.toLowerCase()
        );
        if (item) amt = Number(item.amount) || 0;
      }
      const cat = tx.category?.trim() || 'Outros';
      map[cat] = (map[cat] || 0) + amt;
      totalExpense += amt;
    });

    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        pct: totalExpense > 0 ? (value / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [currentTxs, selectedPerson]);

  // Despesas por pessoa (quando consolidado)
  const personStats = useMemo(() => {
    if (selectedPerson !== 'todos') return [];
    const map = {};
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

    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [currentTxs, selectedPerson]);

  // Exportação CSV / Excel
  function handleExportCSV(separator = ';') {
    if (currentTxs.length === 0) {
      toast.warning('Não há lançamentos no período para exportar.');
      return;
    }

    const headers = ['Data', 'Descricao', 'Categoria', 'Pessoa', 'Tipo', 'Valor', 'Metodo'];
    const rows = currentTxs.map((tx) => [
      tx.date,
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      `"${(tx.category || '').replace(/"/g, '""')}"`,
      `"${(tx.person || '').replace(/"/g, '""')}"`,
      tx.type === 'income' ? 'Receita' : 'Despesa',
      Number(tx.amount).toFixed(2).replace('.', ','),
      tx.paymentMethod || 'Conta',
    ]);

    const csvContent = '\uFEFF' + [headers.join(separator), ...rows.map((r) => r.join(separator))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${selectedMonth}_${selectedPerson}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Relatório exportado com sucesso!');
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <PageLoading message="Calculando relatórios financeiros..." />;
  if (error) return <PageError error={error} title="Erro ao carregar relatórios" />;

  const currentTotalExpense = metrics.expense + metrics.cardsTotal;
  const expenseDiff =
    prevMetrics.expense > 0 ? ((currentTotalExpense - prevMetrics.expense) / prevMetrics.expense) * 100 : 0;
  const incomeDiff =
    prevMetrics.income > 0 ? ((metrics.income - prevMetrics.income) / prevMetrics.income) * 100 : 0;

  return (
    <div className="reports-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Cabeçalho e Filtros */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <h2>Relatórios e Análises</h2>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: 'auto' }}
          />

          <select
            value={selectedPerson}
            onChange={(e) => setSelectedPerson(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="todos">Todos (Consolidado)</option>
            {availablePersons.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleExportCSV(';')}
            className="btn btn-secondary"
            title="Exportar para Excel / CSV"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }}
          >
            <i className="fa-solid fa-file-excel" style={{ marginRight: '4px', color: '#10b981' }} /> Excel
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-secondary"
            title="Imprimir ou Salvar PDF"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }}
          >
            <i className="fa-solid fa-print" style={{ marginRight: '4px' }} /> Imprimir
          </button>
        </div>
      </div>

      {/* Grid de KPIs do Período */}
      <div className="summary-row">
        <div className="kpi-card income">
          <span>Receitas</span>
          <strong>{formatCurrency(metrics.income)}</strong>
          {prevMetrics.income > 0 && (
            <small style={{ color: incomeDiff >= 0 ? '#34d399' : '#f87171', fontSize: '0.75rem' }}>
              {incomeDiff >= 0 ? '▲ +' : '▼ '}
              {incomeDiff.toFixed(1)}% vs mês anterior
            </small>
          )}
        </div>

        <div className="kpi-card expense">
          <span>Despesas Totais</span>
          <strong>{formatCurrency(currentTotalExpense)}</strong>
          <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            Contas: {formatCurrency(metrics.expense)} | Cartões: {formatCurrency(metrics.cardsTotal)}
          </small>
        </div>

        <div className="kpi-card balance">
          <span>Economia Líquida</span>
          <strong style={{ color: metrics.economy >= 0 ? '#34d399' : '#f87171' }}>
            {formatCurrency(metrics.economy)}
          </strong>
          <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            Comprometimento: {metrics.commitment.toFixed(1)}%
          </small>
        </div>
      </div>

      {/* Diagnóstico Inteligente */}
      {currentTxs.length > 0 && (
        <div
          className="report-card"
          style={{
            margin: '1.5rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderLeft: `4px solid ${
              metrics.commitment > 70 ? 'var(--danger)' : metrics.commitment < 50 ? 'var(--success)' : 'var(--blue)'
            }`,
          }}
        >
          <span
            className="icon-badge section-icon-badge"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              fontSize: '1.1rem',
              background:
                metrics.commitment > 70
                  ? 'rgba(255, 111, 94, 0.15)'
                  : metrics.commitment < 50
                  ? 'rgba(95, 208, 143, 0.15)'
                  : 'rgba(77, 141, 255, 0.15)',
              color:
                metrics.commitment > 70 ? 'var(--danger)' : metrics.commitment < 50 ? 'var(--success)' : 'var(--blue)',
            }}
          >
            <i
              className={`fa-solid ${
                metrics.commitment > 70
                  ? 'fa-triangle-exclamation'
                  : metrics.commitment < 50
                  ? 'fa-piggy-bank'
                  : 'fa-chart-line'
              }`}
            />
          </span>
          <div>
            <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text-primary)' }}>
              {metrics.commitment > 70
                ? 'Atenção: Alto Comprometimento de Renda'
                : metrics.commitment < 50
                ? 'Excelente Gestão Financeira'
                : 'Orçamento sob Controle'}
            </strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {metrics.commitment > 70
                ? `Você comprometeu ${metrics.commitment.toFixed(0)}% da sua receita neste mês. Considere cortar despesas supérfluas.`
                : metrics.commitment < 50
                ? `Você economizou ${formatCurrency(metrics.economy)} este mês (${(100 - metrics.commitment).toFixed(0)}% livre). Ótimo momento para aportar em investimentos.`
                : `Seus gastos representam ${metrics.commitment.toFixed(0)}% da receita. Sua saúde financeira segue equilibrada.`}
            </span>
          </div>
        </div>
      )}

      {/* Tabela Comparativa Mês a Mês */}
      <div className="report-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="icon-badge section-icon-badge blue">
            <i className="fa-solid fa-code-compare" />
          </span>
          Comparativo: Mês Atual vs Mês Anterior
        </h3>

        <table className="tx-table full hoverable">
          <thead>
            <tr>
              <th>Métrica</th>
              <th>Mês Atual ({selectedMonth})</th>
              <th>Mês Anterior ({prevMonthStr})</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Receitas</td>
              <td className="income">{formatCurrency(metrics.income)}</td>
              <td>{formatCurrency(prevMetrics.income)}</td>
              <td style={{ color: incomeDiff >= 0 ? '#34d399' : '#f87171' }}>
                {incomeDiff >= 0 ? '+' : ''}
                {incomeDiff.toFixed(1)}%
              </td>
            </tr>
            <tr>
              <td>Despesas Totais</td>
              <td className="expense">{formatCurrency(currentTotalExpense)}</td>
              <td>{formatCurrency(prevMetrics.expense)}</td>
              <td style={{ color: expenseDiff <= 0 ? '#34d399' : '#f87171' }}>
                {expenseDiff >= 0 ? '+' : ''}
                {expenseDiff.toFixed(1)}%
              </td>
            </tr>
            <tr>
              <td>Economia Líquida</td>
              <td style={{ color: metrics.economy >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                {formatCurrency(metrics.economy)}
              </td>
              <td>{formatCurrency(prevMetrics.economy)}</td>
              <td>{formatCurrency(metrics.economy - prevMetrics.economy)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Gráficos de Despesas */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedPerson === 'todos' ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Despesas por Categoria */}
        <div className="report-card">
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="icon-badge section-icon-badge purple">
              <i className="fa-solid fa-chart-pie" />
            </span>
            Despesas por Categoria
          </h3>

          {categoryStats.length === 0 ? (
            <p className="empty-state">Nenhuma despesa registrada neste período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categoryStats.map((cat) => (
                <div key={cat.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{cat.name}</span>
                    <span>
                      {formatCurrency(cat.value)}{' '}
                      <small style={{ color: 'var(--text-secondary)' }}>({cat.pct.toFixed(1)}%)</small>
                    </span>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div
                      style={{
                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                        width: `${cat.pct}%`,
                        height: '100%',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Despesas por Pessoa (quando consolidado) */}
        {selectedPerson === 'todos' && (
          <div className="report-card">
            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="icon-badge section-icon-badge green">
                <i className="fa-solid fa-users" />
              </span>
              Distribuição por Pessoa
            </h3>

            {personStats.length === 0 ? (
              <p className="empty-state">Nenhuma despesa registrada para rateio.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {personStats.map((p) => (
                  <div key={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span>
                        {formatCurrency(p.value)}{' '}
                        <small style={{ color: 'var(--text-secondary)' }}>({p.pct.toFixed(1)}%)</small>
                      </span>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div
                        style={{
                          background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                          width: `${p.pct}%`,
                          height: '100%',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {currentTxs.length === 0 && (
        <EmptyState
          icon="fa-chart-simple"
          title="Sem dados para este período"
          description="Selecione outro mês ou lance transações para visualizar as análises financeiras."
        />
      )}
    </div>
  );
}
