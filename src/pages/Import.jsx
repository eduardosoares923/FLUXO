import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth } from '../utils/format';
import { toast } from '../stores/useToastStore';
import { EmptyState } from '../components/StateFeedback';

export default function Import() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { data: accounts } = useCollection('accounts');
  const { data: cards } = useCollection('cards');
  const { saveRecord: saveTx } = useCollection('transactions');

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState('account');
  const [targetPerson, setTargetPerson] = useState(session.person || 'Eu');
  const [isImporting, setIsImporting] = useState(false);

  // Parser de linhas CSV
  function parseCSV(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) throw new Error('O arquivo CSV precisa ter ao menos cabeçalho e uma linha de dados.');

    // Detecta delimitador (, ou ;)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const headers = firstLine.split(delimiter).map((h) => h.toLowerCase().replace(/["']/g, '').trim());

    // Identifica índices de colunas
    const dateIdx = headers.findIndex((h) => h.includes('data') || h.includes('date'));
    const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('hist') || h.includes('memo') || h.includes('titulo'));
    const amountIdx = headers.findIndex((h) => h.includes('valor') || h.includes('amount') || h.includes('quantia'));
    const catIdx = headers.findIndex((h) => h.includes('categ'));

    if (amountIdx === -1) throw new Error('Não foi possível identificar a coluna de valor na planilha.');

    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map((c) => c.replace(/["']/g, '').trim());
      if (cols.length < 2) continue;

      let dateStr = dateIdx !== -1 ? cols[dateIdx] : new Date().toISOString().slice(0, 10);
      let descStr = descIdx !== -1 ? cols[descIdx] : 'Transação Importada';
      let rawAmount = cols[amountIdx];
      let catStr = catIdx !== -1 ? cols[catIdx] : 'Outros';

      if (!rawAmount) continue;

      // Normaliza data (DD/MM/YYYY -> YYYY-MM-DD)
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          dateStr = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }

      // Normaliza valor numérico
      const cleanVal = rawAmount.replace(/[^\d,-]/g, '').replace(',', '.');
      let numVal = parseFloat(cleanVal);
      if (isNaN(numVal) || numVal === 0) continue;

      const type = numVal < 0 ? 'expense' : 'income';
      const absAmount = Math.abs(numVal);

      results.push({
        id: `import_${i}`,
        date: dateStr,
        description: descStr,
        amount: absAmount,
        type,
        category: catStr || 'Outros',
      });
    }

    return results;
  }

  // Parser básico de extrato bancário OFX
  function parseOFX(text) {
    const results = [];
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;
    let idx = 0;

    while ((match = trnRegex.exec(text)) !== null) {
      const block = match[1];
      const getTag = (tag) => {
        const m = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i').exec(block);
        return m ? m[1].trim() : '';
      };

      const dtPosted = getTag('DTPOSTED');
      const trnAmt = getTag('TRNAMT');
      const memo = getTag('MEMO') || getTag('NAME') || 'Lançamento Bancário';

      if (!trnAmt) continue;

      let dateStr = new Date().toISOString().slice(0, 10);
      if (dtPosted && dtPosted.length >= 8) {
        const y = dtPosted.slice(0, 4);
        const m = dtPosted.slice(4, 6);
        const d = dtPosted.slice(6, 8);
        dateStr = `${y}-${m}-${d}`;
      }

      const numVal = parseFloat(trnAmt.replace(',', '.'));
      if (isNaN(numVal) || numVal === 0) continue;

      results.push({
        id: `ofx_${idx++}`,
        date: dateStr,
        description: memo,
        amount: Math.abs(numVal),
        type: numVal < 0 ? 'expense' : 'income',
        category: 'Outros',
      });
    }

    if (results.length === 0) throw new Error('Nenhuma movimentação identificada no arquivo OFX.');
    return results;
  }

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    try {
      const text = await f.text();
      let rows = [];
      if (f.name.toLowerCase().endsWith('.ofx')) {
        rows = parseOFX(text);
      } else {
        rows = parseCSV(text);
      }
      setParsedRows(rows);
      setSelectedIndices(new Set(rows.map((_, i) => i)));
      toast.success(`${rows.length} lançamentos encontrados no arquivo!`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Erro ao interpretar arquivo.');
      setParsedRows([]);
    }
  }

  function toggleSelectAll() {
    if (selectedIndices.size === parsedRows.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedRows.map((_, i) => i)));
    }
  }

  function toggleRow(idx) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const { totalIncome, totalExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    parsedRows.forEach((r, idx) => {
      if (selectedIndices.has(idx)) {
        if (r.type === 'income') inc += r.amount;
        else exp += r.amount;
      }
    });
    return { totalIncome: inc, totalExpense: exp };
  }, [parsedRows, selectedIndices]);

  async function handleConfirmImport() {
    const toImport = parsedRows.filter((_, idx) => selectedIndices.has(idx));
    if (toImport.length === 0) {
      toast.warning('Selecione ao menos um lançamento para importar.');
      return;
    }

    setIsImporting(true);
    try {
      let cardCloseDay = 28;
      const isCard = paymentMethod.startsWith('card_');
      if (isCard) {
        const cardId = paymentMethod.replace('card_', '');
        const found = cards.find((c) => String(c.id) === cardId);
        if (found) cardCloseDay = found.closeDay || 28;
      }

      for (const row of toImport) {
        const record = {
          description: row.description.trim(),
          amount: row.amount,
          type: row.type,
          category: row.category.trim() || 'Outros',
          date: row.date,
          paymentMethod,
          person: targetPerson.trim() || session.person,
          userId: session.id,
          importedAt: new Date().toISOString(),
        };

        if (isCard) {
          record.invoiceMonth = getCardInvoiceMonth(row.date, cardCloseDay);
        }

        await saveTx(record);
      }

      toast.success(`${toImport.length} transações importadas com sucesso!`);
      navigate('/transactions');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar lançamentos importados.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="import-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-header">
        <h2>Importar Extrato Bancário / Planilha</h2>
      </div>

      {/* Área de Upload Drag & Drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
        }}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : '#334155'}`,
          borderRadius: '12px',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          background: dragOver ? 'rgba(59, 130, 246, 0.08)' : 'rgba(30, 41, 59, 0.3)',
          marginBottom: '1.5rem',
          transition: 'all 0.2s ease',
        }}
      >
        <i
          className="fa-solid fa-file-import"
          style={{ fontSize: '2.5rem', color: dragOver ? '#3b82f6' : '#64748b', marginBottom: '0.75rem' }}
        />
        <h3 style={{ fontSize: '1.15rem', color: '#f8fafc', marginBottom: '0.5rem' }}>
          Arraste e solte seu extrato aqui (CSV ou OFX)
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Compatível com extratos de Nubank, Itaú, Inter, Bradesco, C6 e planilhas de despesas
        </p>

        <label
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}
        >
          <i className="fa-solid fa-folder-open" /> Selecionar Arquivo
          <input
            type="file"
            accept=".csv, .txt, .ofx"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }}
            style={{ display: 'none' }}
          />
        </label>

        {file && (
          <p style={{ marginTop: '1rem', color: '#6ee7b7', fontSize: '0.9rem', fontWeight: 500 }}>
            <i className="fa-solid fa-check" style={{ marginRight: '6px' }} />
            Arquivo selecionado: <strong>{file.name}</strong>
          </p>
        )}
      </div>

      {/* Configuração de Destino e Pré-visualização */}
      {parsedRows.length > 0 && (
        <div>
          <div
            style={{
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid var(--glass-border, #334155)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Destino dos lançamentos:
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ minWidth: '200px' }}
                >
                  <optgroup label="Contas Correntes">
                    <option value="account">Conta Principal (Padrão)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={`acc_${a.id}`}>
                        Conta: {a.name}
                      </option>
                    ))}
                  </optgroup>
                  {cards.length > 0 && (
                    <optgroup label="Cartões de Crédito">
                      {cards.map((c) => (
                        <option key={c.id} value={`card_${c.id}`}>
                          Cartão: {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Pessoa responsável:
                </label>
                <input
                  type="text"
                  value={targetPerson}
                  onChange={(e) => setTargetPerson(e.target.value)}
                  style={{ minWidth: '160px' }}
                />
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px' }}>
                Selecionados: <strong>{selectedIndices.size}</strong> de {parsedRows.length} | Receitas:{' '}
                <span style={{ color: '#34d399' }}>+{formatCurrency(totalIncome)}</span> | Despesas:{' '}
                <span style={{ color: '#f87171' }}>-{formatCurrency(totalExpense)}</span>
              </div>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || selectedIndices.size === 0}
                className="btn btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}
              >
                <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: '6px' }} />
                {isImporting ? 'Importando...' : `Confirmar Importação (${selectedIndices.size})`}
              </button>
            </div>
          </div>

          {/* Tabela de Lançamentos */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Lançamentos encontrados:</span>
            <button
              type="button"
              onClick={toggleSelectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              {selectedIndices.size === parsedRows.length ? 'Desmarcar Todos' : 'Marcar Todos'}
            </button>
          </div>

          <table className="tx-table full">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((row, idx) => {
                const isSelected = selectedIndices.has(idx);
                return (
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(idx)}
                    style={{
                      cursor: 'pointer',
                      opacity: isSelected ? 1 : 0.45,
                      background: isSelected ? 'transparent' : 'rgba(0,0,0,0.1)',
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(idx)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.description}</td>
                    <td>{row.category}</td>
                    <td className={row.type === 'income' ? 'income' : 'expense'}>
                      {row.type === 'income' ? '+ ' : '- '}
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!file && (
        <EmptyState
          icon="fa-file-excel"
          title="Nenhum arquivo carregado"
          description="Selecione ou arraste um arquivo CSV ou OFX do seu banco para visualizar e confirmar a importação."
        />
      )}
    </div>
  );
}
