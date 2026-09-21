import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth } from '../utils/format';
import { toast } from '../stores/useToastStore';
import { EmptyState } from '../components/StateFeedback';
import { Account, User, Transaction } from '../types';

export default function Import() {
  const navigate = useNavigate();
  const { session } = useAuth() as { session: User };
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<any>('cards');
  const { saveRecord: saveTx } = useCollection<Transaction>('transactions');

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState('account');
  const [targetPerson, setTargetPerson] = useState(session.person || 'Eu');
  const [isImporting, setIsImporting] = useState(false);

  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('O arquivo CSV precisa ter ao menos cabeçalho e uma linha de dados.');

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map((h) => h.toLowerCase().replace(/["']/g, '').trim());

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

      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          dateStr = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }

      const cleanVal = rawAmount.replace(/[^\d,-]/g, '').replace(',', '.');
      let numVal = parseFloat(cleanVal);
      if (isNaN(numVal) || numVal === 0) continue;

      results.push({
        id: `import_${i}`,
        date: dateStr,
        description: descStr,
        amount: Math.abs(numVal),
        type: numVal < 0 ? 'expense' : 'income',
        category: catStr || 'Outros',
      });
    }
    return results;
  }

  function parseOFX(text: string) {
    const results = [];
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;
    let idx = 0;

    while ((match = trnRegex.exec(text)) !== null) {
      const block = match[1];
      const getTag = (tag: string) => {
        const m = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i').exec(block);
        return m ? m[1].trim() : '';
      };

      const dtPosted = getTag('DTPOSTED');
      const trnAmt = getTag('TRNAMT');
      const memo = getTag('MEMO') || getTag('NAME') || 'Lançamento Bancário';

      if (!trnAmt) continue;

      let dateStr = new Date().toISOString().slice(0, 10);
      if (dtPosted && dtPosted.length >= 8) {
        dateStr = `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`;
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

  async function handleFile(f: File) {
    if (!f) return;
    setFile(f);
    try {
      const text = await f.text();
      let rows: any[] = [];
      if (f.name.toLowerCase().endsWith('.ofx')) rows = parseOFX(text);
      else rows = parseCSV(text);
      
      setParsedRows(rows);
      setSelectedIndices(new Set(rows.map((_, i) => i)));
      toast.success(`${rows.length} lançamentos encontrados no arquivo!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao interpretar arquivo.');
      setParsedRows([]);
    }
  }

  function toggleSelectAll() {
    if (selectedIndices.size === parsedRows.length) setSelectedIndices(new Set());
    else setSelectedIndices(new Set(parsedRows.map((_, i) => i)));
  }

  function toggleRow(idx: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const { totalIncome, totalExpense } = useMemo(() => {
    let inc = 0; let exp = 0;
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
    if (toImport.length === 0) return toast.warning('Selecione ao menos um lançamento para importar.');

    setIsImporting(true);
    try {
      let cardCloseDay = 28;
      const isCard = paymentMethod.startsWith('card_');
      if (isCard) {
        const cardId = paymentMethod.replace('card_', '');
        const found = cards.find((c) => String(c.id) === cardId);
        if (found) cardCloseDay = found.closeDay || 28;
      }

      const promises = toImport.map(row => {
        const record: Partial<Transaction> = {
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
        if (isCard) record.invoiceMonth = getCardInvoiceMonth(row.date, cardCloseDay);
        return saveTx(record as Transaction);
      });

      await Promise.all(promises);
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
    <div className="animate-in fade-in duration-500 max-w-[1000px] mx-auto pb-12">
      <div className="mb-8">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Importar Extrato / Planilha</h2>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
        }}
        className={`border-2 border-dashed rounded-3xl p-10 text-center mb-8 transition-all ${
          dragOver ? 'border-[#3b82f6] bg-[#3b82f6]/10 scale-[1.02]' : 'border-white/20 bg-white/[0.02]'
        }`}
      >
        <i className={`fa-solid fa-file-import text-5xl mb-4 ${dragOver ? 'text-[#3b82f6]' : 'text-[#8fa39a]'}`} />
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-2">Arraste e solte seu extrato aqui (CSV ou OFX)</h3>
        <p className="text-sm text-[#8fa39a] mb-6">Compatível com extratos de Nubank, Itaú, Inter, Bradesco, C6 e planilhas de despesas</p>

        <label className="inline-flex items-center gap-2 bg-[#e3b04b] hover:bg-[#f5d78a] text-[#1c1206] px-6 py-3 rounded-xl font-bold cursor-pointer transition-colors shadow-lg">
          <i className="fa-solid fa-folder-open" /> Selecionar Arquivo
          <input type="file" accept=".csv, .txt, .ofx" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} className="hidden" />
        </label>

        {file && (
          <p className="mt-6 text-[#10b981] font-medium text-sm flex items-center justify-center gap-2">
            <i className="fa-solid fa-check-circle" /> Arquivo selecionado: <strong>{file.name}</strong>
          </p>
        )}
      </div>

      {parsedRows.length > 0 && (
        <div className="animate-in slide-in-from-bottom-4">
          <div className="bg-[#141d1a] border border-white/10 rounded-2xl p-6 mb-6 shadow-xl flex flex-col md:flex-row gap-6 justify-between items-center">
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div>
                <label className="block text-xs uppercase font-bold text-[#8fa39a] mb-1.5">Destino</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full sm:w-[220px] p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                  <optgroup label="Contas Correntes">
                    <option value="account">Conta Principal</option>
                    {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>Conta: {a.name}</option>))}
                  </optgroup>
                  {cards.length > 0 && (
                    <optgroup label="Cartões de Crédito">
                      {cards.map((c) => (<option key={c.id} value={`card_${c.id}`}>Cartão: {c.name}</option>))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[#8fa39a] mb-1.5">Pessoa</label>
                <input type="text" value={targetPerson} onChange={(e) => setTargetPerson(e.target.value)} className="w-full sm:w-[160px] p-2.5 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none" />
              </div>
            </div>

            <div className="text-center md:text-right w-full md:w-auto flex flex-col items-center md:items-end gap-3">
              <div className="text-sm text-[#8fa39a] bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                Selecionados: <strong className="text-white">{selectedIndices.size}</strong> de {parsedRows.length} | 
                <span className="text-[#10b981] ml-2">+{formatCurrency(totalIncome)}</span> | 
                <span className="text-red-400 ml-2">-{formatCurrency(totalExpense)}</span>
              </div>
              <button onClick={handleConfirmImport} disabled={isImporting || selectedIndices.size === 0} className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-bold transition-all hover:scale-105 disabled:opacity-50 shadow-[0_4px_14px_rgba(227,176,75,0.25)] flex items-center justify-center gap-2">
                {isImporting ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-cloud-arrow-up" />}
                {isImporting ? 'Importando...' : `Importar Lançamentos`}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-sm text-[#8fa39a] font-medium">Pré-visualização do Arquivo</span>
            <button onClick={toggleSelectAll} className="text-[#3b82f6] hover:text-blue-400 text-sm font-bold transition-colors">
              {selectedIndices.size === parsedRows.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col divide-y divide-white/5">
            {parsedRows.map((row, idx) => {
              const isSelected = selectedIndices.has(idx);
              return (
                <div key={row.id} onClick={() => toggleRow(idx)} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-all cursor-pointer ${isSelected ? 'bg-white/5 hover:bg-white/10' : 'opacity-40 grayscale-[0.5] hover:opacity-70'}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(idx)} onClick={(e) => e.stopPropagation()} className="w-5 h-5 accent-[#e3b04b] shrink-0 hidden sm:block" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="text-[#f2f0ea] text-[1.05rem] truncate">{row.description}</strong>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[0.8rem] text-[#8fa39a]">
                      <span><i className="fa-regular fa-calendar mr-1 opacity-70" /> {formatDate(row.date)}</span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span><i className="fa-solid fa-tag mr-1 opacity-70" /> {row.category}</span>
                    </div>
                  </div>

                  <strong className={`text-lg font-bold font-mono tracking-tight shrink-0 ${row.type === 'income' ? 'text-[#10b981]' : 'text-red-400'}`}>
                    {row.type === 'income' ? '+' : '-'}{formatCurrency(row.amount)}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!file && (
        <EmptyState icon="fa-file-excel" title="Nenhum arquivo carregado" description="Selecione ou arraste um arquivo CSV ou OFX gerado pelo seu banco para visualizar as transações e confirmar a importação." />
      )}
    </div>
  );
}
