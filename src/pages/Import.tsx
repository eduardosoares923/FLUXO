import React, { useState, useMemo, useEffect } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import {
  formatCurrency,
  parseCurrency,
  getCardInvoiceMonth,
  normalize,
  toPersonKeys,
} from '../utils/format';
import { toast } from '../stores/useToastStore';
import { Account, Card, Person, Transaction } from '../types';
import { FileDropzone } from '../components/ui/FileDropzone';
import { Select } from '../components/ui/Select';
import { auth } from '../firebase';

const SHORT_MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

interface ParsedImportRow {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  isDuplicate: boolean;
  selected: boolean;
}

function guessCategory(desc: string, type: 'income' | 'expense'): string {
  if (type === 'income') return 'Receita';
  const d = normalize(desc);
  if (
    d.includes('zaffari') ||
    d.includes('mercado') ||
    d.includes('supermercado') ||
    d.includes('carrefour') ||
    d.includes('atacadao') ||
    d.includes('padaria')
  ) {
    return 'Mercado';
  }
  if (
    d.includes('uber') ||
    d.includes('99') ||
    d.includes('posto') ||
    d.includes('ipiranga') ||
    d.includes('shell') ||
    d.includes('estacionamento') ||
    d.includes('pedagio')
  ) {
    return 'Transporte';
  }
  if (
    d.includes('ifood') ||
    d.includes('restaurante') ||
    d.includes('lanch') ||
    d.includes('burger') ||
    d.includes('pizza') ||
    d.includes('cafe')
  ) {
    return 'Restaurantes';
  }
  if (
    d.includes('netflix') ||
    d.includes('spotify') ||
    d.includes('prime') ||
    d.includes('youtube') ||
    d.includes('apple') ||
    d.includes('google')
  ) {
    return 'Assinaturas';
  }
  if (
    d.includes('farmacia') ||
    d.includes('panvel') ||
    d.includes('raia') ||
    d.includes('drogaria') ||
    d.includes('medico') ||
    d.includes('hospital')
  ) {
    return 'Saúde';
  }
  if (
    d.includes('aluguel') ||
    d.includes('condominio') ||
    d.includes('energia') ||
    d.includes('luz') ||
    d.includes('agua') ||
    d.includes('internet')
  ) {
    return 'Moradia';
  }
  return 'Outros';
}

function normalizeDateStr(raw: string): string {
  const clean = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(clean)) {
    const [d, m, y] = clean.slice(0, 10).split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(clean)) {
    const [d, m, y] = clean.slice(0, 10).split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{8}/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function formatShortDayMonth(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [, mStr, dStr] = ymd.split('-');
  const mIdx = Math.max(0, Math.min(11, parseInt(mStr, 10) - 1));
  return `${dStr} ${SHORT_MONTHS[mIdx]}`;
}

export function Import() {
  const { data: accounts, update: updateAccount } = useCollection<Account>('accounts');
  const { data: cards } = useCollection<Card>('cards');
  const { data: personsList } = useCollection<Person>('persons');
  const { data: transactions, add: addTx } = useCollection<Transaction>('transactions');

  const { session, canAccessAccount, canAccessCard, canAccessPerson } = useAuth();

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [targetMethod, setTargetMethod] = useState('');
  const [targetPerson, setTargetPerson] = useState(session?.person || '');
  const [importing, setImporting] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);

  const visibleAccounts = useMemo(
    () => (accounts || []).filter((a) => canAccessAccount(a)),
    [accounts, canAccessAccount]
  );
  const visibleCards = useMemo(
    () => (cards || []).filter((c) => canAccessCard(c)),
    [cards, canAccessCard]
  );
  const accessiblePersons = useMemo(
    () =>
      (personsList || [])
        .map((p) => p.name)
        .filter((n): n is string => Boolean(n) && canAccessPerson(n)),
    [personsList, canAccessPerson]
  );

  useEffect(() => {
    if (!targetMethod) {
      if (visibleAccounts[0]?.id) {
        setTargetMethod(`acc_${visibleAccounts[0].id}`);
      } else if (visibleCards[0]?.id) {
        setTargetMethod(`card_${visibleCards[0].id}`);
      }
    }
  }, [visibleAccounts, visibleCards, targetMethod]);

  useEffect(() => {
    if (!targetPerson && accessiblePersons.length > 0) {
      setTargetPerson(session?.person || accessiblePersons[0]);
    }
  }, [accessiblePersons, session?.person, targetPerson]);

  const checkDuplicate = (date: string, description: string, amount: number): boolean => {
    const normDesc = normalize(description);
    return (transactions || []).some((tx) => {
      const txDate = String(tx.date || '').slice(0, 10);
      const txDesc = normalize(tx.description);
      const sameDate = txDate === date;
      const sameAmount = Math.abs(Number(tx.amount || 0) - Math.abs(amount)) < 0.01;
      const sameDesc =
        txDesc === normDesc ||
        (txDesc.length > 3 && normDesc.length > 3 && (txDesc.includes(normDesc) || normDesc.includes(txDesc)));
      return sameDate && sameAmount && sameDesc;
    });
  };

  const parseOFXText = (text: string): Omit<ParsedImportRow, 'isDuplicate' | 'selected'>[] => {
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const result: Omit<ParsedImportRow, 'isDuplicate' | 'selected'>[] = [];

    blocks.forEach((b, idx) => {
      const dtMatch = b.match(/<DTPOSTED>([^<\r\n]+)/i);
      const amtMatch = b.match(/<TRNAMT>([^<\r\n]+)/i);
      const memoMatch = b.match(/<MEMO>([^<\r\n]+)/i) || b.match(/<NAME>([^<\r\n]+)/i);

      if (!amtMatch) return;
      const rawAmt = parseFloat(amtMatch[1].trim().replace(',', '.'));
      if (isNaN(rawAmt) || Math.abs(rawAmt) < 0.005) return;

      const type: 'income' | 'expense' = rawAmt > 0 ? 'income' : 'expense';
      const absAmt = Math.abs(rawAmt);
      const date = dtMatch ? normalizeDateStr(dtMatch[1].trim()) : new Date().toISOString().slice(0, 10);
      const description = memoMatch ? memoMatch[1].trim() : 'Lançamento OFX';

      result.push({
        id: `ofx-${idx}-${Date.now()}`,
        date,
        description,
        amount: absAmt,
        type,
        category: guessCategory(description, type),
      });
    });

    return result;
  };

  const parseCSVText = (text: string): Omit<ParsedImportRow, 'isDuplicate' | 'selected'>[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    const sep = firstLine.includes(';') ? ';' : ',';
    const headers = firstLine
      .split(sep)
      .map((h) => normalize(h.replace(/^"|"$/g, '')));

    const hasHeader = headers.some(
      (h) =>
        h.includes('data') ||
        h.includes('date') ||
        h.includes('valor') ||
        h.includes('amount') ||
        h.includes('descri') ||
        h.includes('title') ||
        h.includes('historico')
    );

    const dateIdx = hasHeader
      ? headers.findIndex((h) => h.includes('data') || h.includes('date'))
      : 0;
    const descIdx = hasHeader
      ? headers.findIndex(
          (h) =>
            h.includes('descri') ||
            h.includes('historico') ||
            h.includes('title') ||
            h.includes('estabelecimento') ||
            h.includes('lancamento')
        )
      : 1;
    const valIdx = hasHeader
      ? headers.findIndex((h) => h.includes('valor') || h.includes('amount') || h.includes('quantia'))
      : 2;
    const catIdx = hasHeader
      ? headers.findIndex((h) => h.includes('categ'))
      : -1;

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const result: Omit<ParsedImportRow, 'isDuplicate' | 'selected'>[] = [];

    dataLines.forEach((line, idx) => {
      const cols = line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 2) return;

      const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
      const rawDesc =
        cols[descIdx >= 0 ? descIdx : cols.length > 2 ? 1 : 0] || 'Lançamento importado';
      const rawValStr = cols[valIdx >= 0 ? valIdx : cols.length - 1] || '0';

      // Handle both "123.45" and "1.234,56"
      let numericVal = 0;
      if (rawValStr.includes(',') && rawValStr.includes('.')) {
        numericVal = parseCurrency(rawValStr);
      } else if (rawValStr.includes(',')) {
        numericVal = parseFloat(rawValStr.replace(/[^\d,-]/g, '').replace(',', '.'));
      } else {
        numericVal = parseFloat(rawValStr.replace(/[^\d.-]/g, ''));
      }

      if (isNaN(numericVal) || Math.abs(numericVal) < 0.005) return;

      const type: 'income' | 'expense' = numericVal > 0 ? 'income' : 'expense';
      const absAmt = Math.abs(numericVal);
      const date = normalizeDateStr(rawDate);
      const explicitCat = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : '';

      result.push({
        id: `csv-${idx}-${Date.now()}`,
        date,
        description: rawDesc,
        amount: absAmt,
        type,
        category: explicitCat || guessCategory(rawDesc, type),
      });
    });

    return result;
  };

  const handleFileSelect = async (file: File) => {
    setParsingFile(true);
    setFileName(file.name);

    try {
      const lower = file.name.toLowerCase();
      let rawRows: Omit<ParsedImportRow, 'isDuplicate' | 'selected'>[] = [];

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const fbUser = auth?.currentUser;
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const resp = await fetch('/api/import-file', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              action: 'preview',
              fileName: file.name,
              fileBase64: base64,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            rawRows = (data.rows || []).map((r: any, idx: number) => ({
              id: `xlsx-${idx}-${Date.now()}`,
              date: normalizeDateStr(r.date),
              description: r.description || 'Lançamento',
              amount: Math.abs(Number(r.amount) || 0),
              type: r.type === 'income' ? 'income' : 'expense',
              category: r.category || guessCategory(r.description || '', r.type === 'income' ? 'income' : 'expense'),
            }));
          }
        }
      } else {
        const text = await file.text();
        if (lower.endsWith('.ofx') || text.includes('<OFX') || text.includes('<STMTTRN>')) {
          rawRows = parseOFXText(text);
        } else {
          rawRows = parseCSVText(text);
        }
      }

      if (rawRows.length === 0) {
        toast.warning('Nenhum lançamento válido foi encontrado neste arquivo.');
        setRows([]);
        return;
      }

      const enriched: ParsedImportRow[] = rawRows.map((r) => {
        const dup = checkDuplicate(r.date, r.description, r.amount);
        return {
          ...r,
          isDuplicate: dup,
          selected: !dup,
        };
      });

      setRows(enriched);
      toast.success(`${enriched.length} lançamentos lidos do arquivo.`);
    } catch {
      toast.error('Não foi possível ler o arquivo selecionado.');
    } finally {
      setParsingFile(false);
    }
  };

  const toggleRowSelection = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const duplicateCount = useMemo(
    () => rows.filter((r) => r.isDuplicate).length,
    [rows]
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => r.selected),
    [rows]
  );

  const handleCancel = () => {
    setRows([]);
    setFileName('');
  };

  const handleImportSelected = async () => {
    if (selectedRows.length === 0) {
      toast.warning('Selecione pelo menos um lançamento para importar.');
      return;
    }
    if (!targetMethod) {
      toast.warning('Escolha a conta ou cartão de destino.');
      return;
    }

    setImporting(true);
    try {
      const isCard = targetMethod.startsWith('card_');
      const cardId = isCard ? targetMethod.replace('card_', '') : '';
      const cardObj = isCard ? (cards || []).find((c) => c.id === cardId) : undefined;
      const chosenPerson = targetPerson || session?.person || 'Geral';

      let netAccountDelta = 0;

      for (const r of selectedRows) {
        const finalType = isCard ? 'expense' : r.type;
        const invoiceMonth = isCard
          ? getCardInvoiceMonth(r.date, cardObj?.closeDay || 28)
          : '';

        await addTx({
          description: r.description,
          amount: Number(r.amount),
          type: finalType,
          category: r.category,
          date: r.date,
          paymentMethod: targetMethod,
          person: chosenPerson,
          personKeys: toPersonKeys(chosenPerson),
          invoiceMonth,
          createdAt: new Date().toISOString(),
        });

        if (!isCard) {
          netAccountDelta += finalType === 'income' ? r.amount : -r.amount;
        }
      }

      if (!isCard && netAccountDelta !== 0) {
        const accId = targetMethod.replace('acc_', '');
        const acc = (accounts || []).find((a) => a.id === accId);
        if (acc && acc.id) {
          const currentBal =
            acc.computedBalance !== undefined
              ? Number(acc.computedBalance)
              : Number(acc.balance || 0);
          await updateAccount(acc.id, {
            computedBalance: Number((currentBal + netAccountDelta).toFixed(2)),
          });
        }
      }

      toast.success(
        `${selectedRows.length} ${
          selectedRows.length === 1 ? 'lançamento importado' : 'lançamentos importados'
        } com sucesso.`
      );
      setRows([]);
      setFileName('');
    } catch {
      toast.error('Erro ao importar lançamentos.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Dropzone Card */}
      <FileDropzone
        accept=".csv,.txt,.ofx,.xlsx,.xls"
        onFileSelect={handleFileSelect}
        label="Solte o extrato aqui"
        hint="Arquivos CSV ou OFX do Nubank, Itaú, Inter, Bradesco, C6 e planilhas de despesas."
        buttonLabel={parsingFile ? 'Lendo arquivo...' : 'Escolher arquivo'}
        selectedFileName={fileName || undefined}
        disabled={parsingFile || importing}
      />

      {/* Conferir lançamentos Card */}
      {rows.length > 0 && (
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Conferir lançamentos
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {fileName}, {rows.length}{' '}
                {rows.length === 1 ? 'linha encontrada' : 'linhas encontradas'},{' '}
                {duplicateCount}{' '}
                {duplicateCount === 1
                  ? 'já existe no Wynd.'
                  : 'já existem no Wynd.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-52">
                <Select
                  size="sm"
                  value={targetMethod}
                  onChange={(e) => setTargetMethod(e.target.value)}
                  ariaLabel="Conta ou cartão de destino"
                >
                  {visibleAccounts.map((acc) => (
                    <option key={acc.id} value={`acc_${acc.id}`}>
                      Destino: {acc.name}
                    </option>
                  ))}
                  {visibleCards.map((c) => (
                    <option key={c.id} value={`card_${c.id}`}>
                      Destino: Cartão {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              {accessiblePersons.length > 0 && (
                <div className="w-48">
                  <Select
                    size="sm"
                    value={targetPerson}
                    onChange={(e) => setTargetPerson(e.target.value)}
                    ariaLabel="Pessoa"
                  >
                    {accessiblePersons.map((p) => (
                      <option key={p} value={p}>
                        Pessoa: {p}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {rows.map((r) => {
              const isIncome = r.type === 'income';
              return (
                <div
                  key={r.id}
                  onClick={() => toggleRowSelection(r.id)}
                  role="checkbox"
                  aria-checked={r.selected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRowSelection(r.id);
                    }
                  }}
                  className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer transition-opacity ${
                    !r.selected ? 'opacity-45' : ''
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs font-semibold text-muted w-14 shrink-0">
                      {formatShortDayMonth(r.date)}
                    </span>
                    <span className="text-sm font-bold text-ink truncate">
                      {r.description}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-18 sm:pl-0 shrink-0">
                    <span className="text-xs font-medium text-muted">
                      {r.category}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-pill text-[11px] font-bold ${
                        r.isDuplicate
                          ? 'bg-neutral text-muted'
                          : 'bg-priSoft text-priInk'
                      }`}
                    >
                      {r.isDuplicate ? 'Já existe' : 'Novo'}
                    </span>

                    <span
                      className={`font-display text-sm font-bold min-w-[105px] text-right ${
                        isIncome ? 'text-pri' : 'text-spendText'
                      }`}
                    >
                      {isIncome ? '+ ' : '- '}
                      {formatCurrency(r.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleCancel}
              disabled={importing}
              className="px-5 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-sm hover:bg-neutral transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImportSelected}
              disabled={importing || selectedRows.length === 0}
              className="px-5 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {importing
                ? 'Importando...'
                : `Importar ${selectedRows.length} ${
                    selectedRows.length === 1 ? 'lançamento' : 'lançamentos'
                  }`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Import;
