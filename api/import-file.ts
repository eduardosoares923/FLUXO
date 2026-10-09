// Vercel Serverless Function: lê um arquivo de lançamentos (Excel, CSV ou OFX) e devolve a pré-visualização.
//
// POST /api/import-file   Authorization: Bearer <token de login>
//   { "action": "preview",  "filename": "extrato.csv", "base64": "..." }  -> linhas lidas, problemas e possíveis repetidos
//   { "action": "template" }                                               -> planilha modelo (Excel) já com as suas listas
//
// Esta função só LÊ e confere: quem grava os lançamentos é o app/site, depois que a pessoa revisa a pré-visualização.
// Segurança: o Firebase é lido com a chave de administrador, que ignora as regras de acesso. Por isso a função confere
// o login e a permissão (editar Transações) e só compara repetidos com lançamentos que a pessoa já pode ver.
// Requer a variável FIREBASE_SERVICE_ACCOUNT e as dependências "exceljs" e "jszip".

import type { App } from 'firebase-admin/app';
import { createHash } from 'node:crypto';

type AppModule = typeof import('firebase-admin/app');

function normalize(str: string | null | undefined): string {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseTxDate(dateVal: Date | number | string | null | undefined): Date | null {
  if (!dateVal) return null;
  try {
    if (dateVal instanceof Date) return dateVal;
    if (typeof dateVal === 'number') return new Date(dateVal);

    const str = String(dateVal).trim();
    if (!str) return null;

    if (/^\d{10,}$/.test(str)) return new Date(parseInt(str, 10));

    if (str.includes('/')) {
      const parts = str.split('T')[0].split(' ')[0].split('/').map(Number);
      if (parts.length === 3) {
        const [day, month, year] = parts;
        if (year && month && day) return new Date(year, month - 1, day, 12, 0, 0);
      }
    }

    const dateOnly = str.split('T')[0].split(' ')[0];
    const parts = dateOnly.split('-').map(Number);
    if (parts.length === 3) {
      const [year, month, day] = parts;
      if (year && month && day) return new Date(year, month - 1, day, 12, 0, 0);
    }

    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? null : fallback;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sessão e permissões (mesmas regras do AuthContext e de src/utils/permissions.ts do site)
// ---------------------------------------------------------------------------------------------------------

type PermissionMap = Record<string, string[]>;

const FULL_ACCESS: PermissionMap = {
  transactions: ['view', 'edit'], accounts: ['view', 'edit'], cards: ['view', 'edit'], subscriptions: ['view', 'edit'], reports: ['view'],
};
const READ_ONLY: PermissionMap = {
  transactions: ['view'], accounts: ['view'], cards: ['view'], subscriptions: ['view'], reports: ['view'],
};

function cloneMap(map: PermissionMap): PermissionMap {
  const copy: PermissionMap = {};
  for (const key of Object.keys(map)) copy[key] = [...map[key]];
  return copy;
}

function defaultPermissionsFor(role?: string): PermissionMap {
  if (role === 'viewer') return cloneMap(READ_ONLY);
  if (role === 'usuario' || role === 'gerente') return cloneMap(FULL_ACCESS);
  return {};
}

function resolvePermissions(role: string | undefined, stored: unknown): PermissionMap {
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && Object.keys(stored as object).length > 0) {
    return stored as PermissionMap;
  }
  return defaultPermissionsFor(role);
}

/** Sessão montada a partir do cadastro em "users" (igual ao syncSessionFromFirestore do site). */
export function buildSession(userId: string, userData: any, authEmail?: string): any {
  const session: any = {
    id: userId,
    name: userData.name || 'Usuário',
    username: userData.username || (userData.email ? userData.email.split('@')[0] : 'usuario'),
    email: userData.email || authEmail || '',
    role: userData.role || 'viewer',
    person: userData.person || userData.name || 'Eu',
  };
  session.permissions = resolvePermissions(session.role, userData.permissions);
  session.allowedPersons = userData.allowedPersons || null;
  return session;
}

/** hasPermission e canAccessPerson do AuthContext do site, sobre uma sessão. */
export function makeAccess(session: any) {
  const hasPermission = (module: string, action = 'view') => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (module === 'admin') return session.role === 'admin';
    if (module === 'gerente') return ['admin', 'gerente'].includes(session.role);
    const sessAny = session as any;
    if (module === 'config_system') return session.role === 'admin' || (sessAny.permissions?.settings || []).includes('edit');
    if (module === 'manage_users') return session.role === 'admin' || (sessAny.permissions?.users || []).includes('view');
    return (sessAny.permissions?.[module] || []).includes(action);
  };

  const canAccessPerson = (personName?: string | null, tx: any = null) => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (tx && tx.userId && String(tx.userId) === String(session.id)) return true;
    if (!personName) return true;

    const target = normalize(personName);
    if (!target) return true;
    const targetPersons = target.split(',').map((p) => p.trim());
    const sessAny = session as any;

    for (const t of targetPersons) {
      if (session.person && normalize(session.person) === t) return true;
      if (session.name && normalize(session.name) === t) return true;
      if (session.username && normalize(session.username) === t) return true;
      if (session.email && normalize(session.email.split('@')[0]) === t) return true;

      if (session.role === 'gerente') {
        if (Array.isArray(sessAny.allowedPersons)) {
          if (sessAny.allowedPersons.some((p: string) => normalize(p) === t)) return true;
        } else if (typeof sessAny.allowedPersons === 'string' && sessAny.allowedPersons.trim()) {
          if (sessAny.allowedPersons.split(',').map(normalize).includes(t)) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  };

  return { hasPermission, canAccessPerson };
}

// ---------------------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------------------

export interface Issue { level: 'erro' | 'aviso'; message: string }
export interface Duplicate { level: 'exato' | 'provavel' | 'arquivo'; withDescription: string; withDate: string }
export interface ParsedRow {
  index: number;
  line: number;
  date: string | null;
  description: string;
  amount: number;
  type: 'income' | 'expense' | null;
  category: string;
  person: string;
  payment: string;
  importKey: string;
  issues: Issue[];
  fatal: boolean;
  duplicate: Duplicate | null;
}
export interface SkippedLine { line: number; reason: string }
export interface ParseResult {
  format: 'xlsx' | 'csv' | 'ofx';
  rows: ParsedRow[];
  skipped: SkippedLine[];
  columns: Record<string, string>;
  headerLine: number;
}

/** Erro com mensagem pronta pra mostrar à pessoa (arquivo ruim, não é falha do servidor). */
export class ImportError extends Error {}

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 3_200_000;

// ---------------------------------------------------------------------------------------------------------
// Números, datas e textos
// ---------------------------------------------------------------------------------------------------------

export function normalizeHeader(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Valor em dinheiro: aceita 1.234,56 (Brasil), 1,234.56 (EUA), R$, parênteses, sinal no fim, D/C. NaN se não for número. */
export function parseAmount(raw: any): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/r\$|brl|usd|eur|€|\$/gi, '').trim();
  const dc = /\s*([dc])$/i.exec(s);
  if (dc && /\d/.test(s.slice(0, dc.index))) {
    if (dc[1].toLowerCase() === 'd') negative = true;
    s = s.slice(0, dc.index).trim();
  }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1).trim(); } else if (s.startsWith('+')) s = s.slice(1).trim();
  s = s.replace(/\s+/g, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    normalized = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    normalized = (s.match(/,/g) || []).length > 1 ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.split('.').join('') : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

function realDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const ymdOf = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Data como AAAA-MM-DD. Aceita Date do Excel, número de série do Excel, dd/mm/aaaa, aaaa-mm-dd, aaaammdd. null se inválida. */
export function parseDateValue(v: any): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
    return realDate(y, m, d) ? ymdOf(y, m, d) : null;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return parseDateValue(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000));
    return /^\d{8}$/.test(String(v)) ? parseDateValue(String(v)) : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s) || /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?!\d)/.exec(s);
  if (m) return realDate(+m[1], +m[2], +m[3]) ? ymdOf(+m[1], +m[2], +m[3]) : null;
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return realDate(y, +m[2], +m[1]) ? ymdOf(y, +m[2], +m[1]) : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(s);
  if (m) return realDate(+m[1], +m[2], +m[3]) ? ymdOf(+m[1], +m[2], +m[3]) : null;
  return null;
}

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\u00a0/g, ' ').trim();
}

function cents(n: number): number { return Math.round(Math.abs(n) * 100); }
const descKey = (s: string) => normalizeHeader(s).replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------

/** Texto de um arquivo: UTF-8; se não for, Windows-1252 (acentos de extratos antigos). */
export function decodeText(buf: Buffer): string {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0, inQ = false;
  for (const c of line) { if (c === '"') inQ = !inQ; else if (c === ch && !inQ) n++; }
  return n;
}

/** Lê CSV de verdade: separador automático (; , tab |), aspas, aspas duplas e quebras de linha dentro de campo. */
export function parseCsvText(text: string): string[][] {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let delimiter = ';', best = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = sample.map((l) => countOutsideQuotes(l, d));
    const total = counts.reduce((a, b) => a + b, 0);
    const consistent = counts.filter((c) => c === counts[0] && c > 0).length;
    const score = total > 0 ? consistent * 1000 + total : 0;
    if (score > best) { best = score; delimiter = d; }
  }
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field === '') {
      inQ = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------------------------------------
// Tabela (CSV ou Excel) -> lançamentos
// ---------------------------------------------------------------------------------------------------------

type Col = 'date' | 'description' | 'amount' | 'credit' | 'debit' | 'type' | 'category' | 'person' | 'payment' | 'balance';

function classifyHeader(raw: any): Col | null {
  const h = normalizeHeader(cellText(raw));
  if (!h) return null;
  if (/\bsaldo\b/.test(h)) return 'balance';
  if (/^(tipo|type|natureza|operacao)\b/.test(h)) return 'type';
  if (/\b(data|date|dt)\b/.test(h) && !/valor/.test(h)) return 'date';
  if (/categ/.test(h)) return 'category';
  if (/\b(pessoa|responsavel|titular)\b/.test(h)) return 'person';
  if (/pagament|metodo|^forma\b|cartao/.test(h) || h === 'conta') return 'payment';
  if (/\b(credito|credit|entrada)\b/.test(h)) return 'credit';
  if (/\b(debito|debit|saida)\b/.test(h)) return 'debit';
  if (/\b(valor|amount|quantia|montante)\b/.test(h)) return 'amount';
  if (/descri|historico|memo|titulo|estabelecimento|lancamento|detalhe/.test(h)) return 'description';
  return null;
}

function findHeader(table: any[][]): { rowIndex: number; map: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const row = table[r] || [];
    const map: Partial<Record<Col, number>> = {};
    row.forEach((cell, c) => { const k = classifyHeader(cell); if (k && map[k] === undefined) map[k] = c; });
    if (map.date !== undefined && (map.amount !== undefined || map.credit !== undefined || map.debit !== undefined)) return { rowIndex: r, map };
  }
  return null;
}

function typeFromText(raw: string): 'income' | 'expense' | 'skip' | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  if (/^(transferencia|transfer|pagamento de fatura|pagamento fatura|outro)\b/.test(n)) return 'skip';
  if (/^(receita|entrada|credito|credit|income|deposito|provento|estorno)/.test(n)) return 'income';
  if (/^(despesa|saida|debito|debit|expense|gasto|compra)/.test(n)) return 'expense';
  return null;
}

/** Chave estável da linha: a mesma linha, no mesmo arquivo ou num arquivo parecido, gera a mesma chave. */
function makeKey(date: string, amount: number, type: string, description: string, occurrence: number): string {
  return createHash('sha1').update(`${date}|${cents(amount)}|${type}|${descKey(description)}|${occurrence}`).digest('hex').slice(0, 16);
}

export function rowsFromTable(table: any[][], format: 'xlsx' | 'csv'): ParseResult {
  const header = findHeader(table);
  if (!header) {
    throw new ImportError('Não encontrei o cabeçalho da planilha. Ela precisa ter, pelo menos, as colunas Data e Valor (ou Crédito e Débito). Use o modelo de importação se tiver dúvida.');
  }
  const { map, rowIndex } = header;
  const names: Record<string, string> = {};
  (Object.keys(map) as Col[]).forEach((k) => { names[k] = cellText(table[rowIndex][map[k] as number]); });

  const rows: ParsedRow[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Map<string, number>();
  for (let r = rowIndex + 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r] || [];
    const get = (k: Col) => (map[k] === undefined ? undefined : cells[map[k] as number]);
    const dateRaw = get('date');
    const descRaw = cellText(get('description'));
    const amountRaw = get('amount');
    const creditRaw = get('credit');
    const debitRaw = get('debit');
    const blank = [dateRaw, amountRaw, creditRaw, debitRaw, descRaw].every((x) => cellText(x) === '');
    if (blank) continue;
    // Linhas de "Total" ou "Saldo final" (o rótulo pode estar na coluna da data ou na da descrição) não são lançamentos.
    if (parseDateValue(dateRaw) === null && /^(total|subtotal|saldo|resumo)/.test(normalizeHeader(cellText(dateRaw) || descRaw))) { skipped.push({ line, reason: 'Linha de total ou saldo' }); continue; }

    const issues: Issue[] = [];
    const date = parseDateValue(dateRaw);
    if (date === null) issues.push({ level: 'erro', message: cellText(dateRaw) === '' ? 'Sem data' : `Data inválida: "${cellText(dateRaw)}"` });

    let amount = NaN;
    let type: 'income' | 'expense' | null = null;
    let skipReason = '';
    const typeText = cellText(get('type'));
    if (map.amount !== undefined) amount = parseAmount(amountRaw);
    else {
      const credit = parseAmount(creditRaw), debit = parseAmount(debitRaw);
      const hasC = Number.isFinite(credit) && credit !== 0, hasD = Number.isFinite(debit) && debit !== 0;
      if (hasC && hasD) issues.push({ level: 'erro', message: 'Crédito e débito preenchidos na mesma linha' });
      else if (hasC) { amount = Math.abs(credit); type = 'income'; }
      else if (hasD) { amount = Math.abs(debit); type = 'expense'; }
    }
    if (map.amount !== undefined && !Number.isFinite(amount)) {
      issues.push({ level: 'erro', message: cellText(amountRaw) === '' ? 'Sem valor' : `Valor inválido: "${cellText(amountRaw)}"` });
    } else if (map.amount === undefined && type === null && !issues.some((i) => i.message.startsWith('Crédito'))) {
      skipReason = 'Sem valor';
    }
    if (Number.isFinite(amount) && amount === 0) skipReason = 'Valor zero';

    if (type === null && Number.isFinite(amount) && !skipReason) {
      if (typeText) {
        const t = typeFromText(typeText);
        if (t === 'skip') skipReason = `Tipo "${typeText}" não é importado (transferência, pagamento de fatura ou outro)`;
        else if (t === null) issues.push({ level: 'erro', message: `Tipo desconhecido: "${typeText}" (use Receita ou Despesa)` });
        else type = t;
      } else {
        type = amount < 0 ? 'expense' : 'income';
      }
    }
    if (skipReason && !issues.some((i) => i.level === 'erro')) { skipped.push({ line, reason: skipReason }); continue; }

    let description = descRaw;
    if (map.description === undefined || description === '') {
      description = 'Transação Importada';
      if (map.description !== undefined) issues.push({ level: 'aviso', message: 'Sem descrição' });
    }
    const absAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;
    const fatal = issues.some((i) => i.level === 'erro');
    let importKey = '';
    if (!fatal && date && type) {
      const base = `${date}|${cents(absAmount)}|${type}|${descKey(description)}`;
      const occurrence = seen.get(base) || 0;
      seen.set(base, occurrence + 1);
      importKey = makeKey(date, absAmount, type, description, occurrence);
    }
    rows.push({
      index: rows.length + 1, line, date, description, amount: absAmount, type: fatal ? null : type,
      category: cellText(get('category')) || 'Outros', person: cellText(get('person')), payment: cellText(get('payment')),
      importKey, issues, fatal, duplicate: null,
    });
    if (rows.length > MAX_ROWS) throw new ImportError(`O arquivo tem mais de ${MAX_ROWS} lançamentos. Divida em partes menores.`);
  }
  if (rows.length === 0) throw new ImportError('Não encontrei nenhum lançamento abaixo do cabeçalho.');
  return { format, rows, skipped, columns: names, headerLine: rowIndex + 1 };
}

// ---------------------------------------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

export function parseOfx(text: string): ParseResult {
  let blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((m) => m[1]);
  if (blocks.length === 0) blocks = text.split(/<STMTTRN>/i).slice(1);
  const acct = /<ACCTID>([^<\r\n]+)/i.exec(text)?.[1]?.trim() || '';
  const rows: ParsedRow[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Map<string, number>();
  blocks.forEach((block, i) => {
    const tag = (t: string) => { const m = new RegExp(`<${t}>([^<\\r\\n]+)`, 'i').exec(block); return m ? decodeEntities(m[1].trim()) : ''; };
    const trnAmt = tag('TRNAMT');
    if (!trnAmt) return;
    const issues: Issue[] = [];
    const dt = tag('DTPOSTED');
    const date = dt.length >= 8 ? parseDateValue(dt.slice(0, 8)) : null;
    if (date === null) issues.push({ level: 'erro', message: dt ? `Data inválida: "${dt}"` : 'Sem data' });
    const n = parseAmount(trnAmt);
    if (!Number.isFinite(n)) issues.push({ level: 'erro', message: `Valor inválido: "${trnAmt}"` });
    else if (n === 0) { skipped.push({ line: i + 1, reason: 'Valor zero' }); return; }
    const description = tag('MEMO') || tag('NAME') || 'Lançamento Bancário';
    const type: 'income' | 'expense' | null = Number.isFinite(n) ? (n < 0 ? 'expense' : 'income') : null;
    const fatal = issues.some((x) => x.level === 'erro');
    const fit = tag('FITID');
    let importKey = '';
    if (!fatal && date && type) {
      if (fit) importKey = `ofx:${acct ? `${acct}:` : ''}${fit}`;
      else {
        const base = `${date}|${cents(n)}|${type}|${descKey(description)}`;
        const occ = seen.get(base) || 0; seen.set(base, occ + 1);
        importKey = makeKey(date, n, type, description, occ);
      }
    }
    rows.push({ index: rows.length + 1, line: i + 1, date, description, amount: Number.isFinite(n) ? Math.abs(n) : 0, type: fatal ? null : type, category: 'Outros', person: '', payment: '', importKey, issues, fatal, duplicate: null });
  });
  if (rows.length === 0) throw new ImportError('Nenhuma movimentação identificada no arquivo OFX.');
  if (rows.length > MAX_ROWS) throw new ImportError(`O arquivo tem mais de ${MAX_ROWS} lançamentos. Divida em partes menores.`);
  return { format: 'ofx', rows, skipped, columns: {}, headerLine: 0 };
}

// ---------------------------------------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------------------------------------

function rawCell(v: any): any {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return rawCell((v as any).result);
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
    if ('text' in v) return (v as any).text;
    if ('error' in v) return '';
  }
  return v;
}

export async function parseXlsx(ExcelJS: any, JSZip: any, buf: Buffer): Promise<ParseResult> {
  // Proteção contra "bomba de zip": arquivo pequeno que vira gigante ao descompactar.
  let zip: any;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new ImportError('Não consegui abrir a planilha. Confira se é um arquivo .xlsx válido.');
  }
  let total = 0;
  zip.forEach((_p: string, f: any) => { total += (f && f._data && f._data.uncompressedSize) || 0; });
  if (total > 40_000_000) throw new ImportError('A planilha é grande demais depois de descompactada.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new ImportError('Não consegui abrir a planilha. Confira se é um arquivo .xlsx válido.');
  }
  const sheets: any[] = [...wb.worksheets];
  sheets.sort((a, b) => (normalizeHeader(b.name) === 'transacoes' ? 1 : 0) - (normalizeHeader(a.name) === 'transacoes' ? 1 : 0));
  for (const ws of sheets) {
    if (ws.rowCount > MAX_ROWS + 60) throw new ImportError(`A aba "${ws.name}" tem mais de ${MAX_ROWS} linhas. Divida em partes menores.`);
    const table: any[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
      const arr: any[] = [];
      const cols = Math.min(row.cellCount || 0, 30);
      for (let c = 1; c <= cols; c++) arr.push(rawCell(row.getCell(c).value));
      table[rowNumber - 1] = arr;
    });
    for (let i = 0; i < table.length; i++) if (!table[i]) table[i] = [];
    if (!findHeader(table)) continue;
    return rowsFromTable(table, 'xlsx');
  }
  throw new ImportError('Não encontrei, em nenhuma aba, o cabeçalho com as colunas Data e Valor. Use o modelo de importação.');
}

// ---------------------------------------------------------------------------------------------------------
// Arquivo -> lançamentos
// ---------------------------------------------------------------------------------------------------------

export async function parseFile(filename: string, buf: Buffer, libs: { ExcelJS: () => Promise<any>; JSZip: () => Promise<any> }): Promise<ParseResult> {
  if (buf.length === 0) throw new ImportError('O arquivo está vazio.');
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return parseXlsx(await libs.ExcelJS(), await libs.JSZip(), buf);
  if (/\.xls$/i.test(filename) && buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf) {
    throw new ImportError('Arquivos .xls (Excel antigo) não são suportados. Salve a planilha como .xlsx e tente de novo.');
  }
  const text = decodeText(buf);
  if (/\.(ofx|qfx)$/i.test(filename) || /<OFX>|OFXHEADER/i.test(text.slice(0, 3000))) return parseOfx(text);
  const table = parseCsvText(text);
  if (table.length < 2) throw new ImportError('O arquivo precisa ter ao menos o cabeçalho e uma linha de dados.');
  return rowsFromTable(table, 'csv');
}

// ---------------------------------------------------------------------------------------------------------
// Repetidos
// ---------------------------------------------------------------------------------------------------------

/** Descrição vazia ou genérica ("Transação Importada", "Lançamento Bancário") não ajuda a distinguir lançamentos. */
function isGeneric(key: string): boolean {
  return key === '' || key === 'transacao importada' || key === 'lancamento bancario';
}

function similar(a: string, b: string): boolean {
  const x = descKey(a), y = descKey(b);
  // Mesma data, mesmo valor e mesmo tipo (já exigidos por quem chama) + um lado sem descrição de verdade: provável repetido.
  if (isGeneric(x) || isGeneric(y)) return true;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const tx = new Set(x.split(' ')), ty = new Set(y.split(' '));
  const inter = [...tx].filter((t) => ty.has(t)).length;
  return inter / Math.min(tx.size, ty.size) >= 0.6 && inter >= 1;
}

/** Marca linhas que já existem (por chave de importação ou por data + valor + descrição parecida) e repetidas dentro do arquivo. */
export function markDuplicates(rows: ParsedRow[], existing: any[]): void {
  const byKey = new Map<string, any[]>();
  const importKeys = new Map<string, any>();
  for (const tx of existing) {
    if (tx.importKey) importKeys.set(String(tx.importKey), tx);
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const d = parseTxDate(tx.date);
    if (!d) continue;
    const k = `${ymdOf(d.getFullYear(), d.getMonth() + 1, d.getDate())}|${cents(Number(tx.amount) || 0)}|${tx.type}`;
    (byKey.get(k) || byKey.set(k, []).get(k)!).push(tx);
  }
  const inFile = new Map<string, ParsedRow>();
  for (const row of rows) {
    if (row.fatal || !row.date || !row.type) continue;
    const exact = row.importKey ? importKeys.get(row.importKey) : undefined;
    if (exact) { row.duplicate = { level: 'exato', withDescription: String(exact.description || ''), withDate: String(exact.date || '') }; continue; }
    const cand = (byKey.get(`${row.date}|${cents(row.amount)}|${row.type}`) || []).find((tx) => similar(tx.description || '', row.description));
    if (cand) { row.duplicate = { level: 'provavel', withDescription: String(cand.description || ''), withDate: String(cand.date || '') }; continue; }
    const k = `${row.date}|${cents(row.amount)}|${row.type}|${descKey(row.description)}`;
    const first = inFile.get(k);
    if (first) row.duplicate = { level: 'arquivo', withDescription: first.description, withDate: first.date || '' };
    else inFile.set(k, row);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Planilha modelo
// ---------------------------------------------------------------------------------------------------------

export interface TemplateLists { payments: string[]; persons: string[]; categories: string[] }

export async function buildTemplate(ExcelJS: any, lists: TemplateLists, now: Date): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wynd';
  wb.created = now;
  const dark = 'FF16241F', header = 'FF1F3A33', gold = 'FFE3B04B', gray = 'FF6B7B76';
  const ws = wb.addWorksheet('Transações', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: 'Data', width: 14 }, { header: 'Descrição', width: 40 }, { header: 'Categoria', width: 22 }, { header: 'Pessoa', width: 20 }, { header: 'Tipo', width: 16 }, { header: 'Valor', width: 16 }, { header: 'Pagamento', width: 26 }];
  const head = ws.getRow(1);
  head.height = 24;
  for (let c = 1; c <= 7; c++) {
    const cell = head.getCell(c);
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: header } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: gold } } };
  }
  const lastRow = 500;
  const listRef = (col: string, n: number) => `Listas!$${col}$2:$${col}$${Math.max(n, 1) + 1}`;
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`A${r}`).numFmt = 'dd/mm/yyyy';
    ws.getCell(`A${r}`).dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(1990, 0, 1))], showErrorMessage: true, errorTitle: 'Data inválida', error: 'Digite a data no formato dd/mm/aaaa.' };
    ws.getCell(`F${r}`).numFmt = '"R$ "#,##0.00';
    ws.getCell(`F${r}`).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Digite o valor sem sinal (sempre positivo). Quem diz se é receita ou despesa é a coluna Tipo.' };
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Listas!$A$2:$A$3'], showErrorMessage: true, errorTitle: 'Tipo inválido', error: 'Escolha Receita ou Despesa.' };
    if (lists.payments.length) ws.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listRef('B', lists.payments.length)], showErrorMessage: false };
    if (lists.persons.length) ws.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listRef('C', lists.persons.length)], showErrorMessage: false };
    if (lists.categories.length) ws.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listRef('D', lists.categories.length)], showErrorMessage: false };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const help = wb.addWorksheet('Como preencher', { views: [{ showGridLines: false }] });
  help.columns = [{ width: 4 }, { width: 28 }, { width: 80 }];
  help.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  help.mergeCells('A1:C1');
  help.getCell('A1').value = 'WYND  |  MODELO DE IMPORTAÇÃO';
  help.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  help.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dark } };
  help.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  help.getRow(1).height = 30;
  const rows: [string, string][] = [
    ['Onde preencher', 'Na aba "Transações", uma linha por lançamento. Apague nada do cabeçalho.'],
    ['Data', 'Dia do lançamento, no formato dd/mm/aaaa (ex: 04/10/2026).'],
    ['Descrição', 'Texto livre (ex: Mercado Zaffari).'],
    ['Categoria', 'Escolha na lista ou digite. Em branco vira "Outros".'],
    ['Pessoa', 'De quem é o lançamento. Em branco, vale a pessoa escolhida na hora de importar.'],
    ['Tipo', 'Receita ou Despesa.'],
    ['Valor', 'Sempre positivo, só o número (ex: 59,90). Quem diz se entra ou sai é a coluna Tipo.'],
    ['Pagamento', 'Escolha a conta ou o cartão na lista. Em branco, vale o destino escolhido na hora de importar.'],
    ['Antes de importar', 'O app mostra tudo numa tela de conferência: você vê linhas com problema e os possíveis lançamentos repetidos, e escolhe o que entra.'],
    ['Outros arquivos', 'Também dá pra importar o extrato do banco em OFX ou CSV, e a planilha exportada pelo próprio Wynd (Relatórios > Exportar > Excel).'],
  ];
  rows.forEach(([k, v], i) => {
    const r = help.getRow(3 + i);
    r.getCell(2).value = k; r.getCell(3).value = v;
    r.getCell(2).font = { name: 'Calibri', bold: true };
    r.getCell(3).font = { name: 'Calibri', color: { argb: gray } };
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(2).alignment = { vertical: 'top' };
  });

  const ls = wb.addWorksheet('Listas');
  ls.columns = [{ header: 'Tipos', width: 14 }, { header: 'Pagamentos', width: 28 }, { header: 'Pessoas', width: 22 }, { header: 'Categorias', width: 24 }];
  ls.getCell('A2').value = 'Receita'; ls.getCell('A3').value = 'Despesa';
  lists.payments.forEach((v, i) => { ls.getCell(`B${i + 2}`).value = v; });
  lists.persons.forEach((v, i) => { ls.getCell(`C${i + 2}`).value = v; });
  lists.categories.forEach((v, i) => { ls.getCell(`D${i + 2}`).value = v; });
  ls.getRow(1).font = { name: 'Calibri', bold: true };
  ls.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

// ---------------------------------------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------------------------------------

interface ApiRequest { method?: string; headers: Record<string, string | string[] | undefined>; body?: any }
interface ApiResponse { status(code: number): ApiResponse; json(body: unknown): void }

export interface Deps {
  verifyIdToken(token: string): Promise<{ uid: string; email?: string }>;
  getUserById(uid: string): Promise<any | null>;
  findUserByEmail(email: string): Promise<{ id: string; data: any } | null>;
  getCollection(name: string): Promise<any[]>;
  getDocData(collection: string, id: string): Promise<any | null>;
  loadExcel(): Promise<any>;
  loadJSZip(): Promise<any>;
  now(): Date;
}

function getBearerToken(req: ApiRequest): string {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw || '';
  return value.replace('Bearer ', '');
}

function describeError(err: any): string {
  const code = err && err.code ? `[${err.code}] ` : '';
  return `${code}${(err && err.message) || String(err)}`;
}

const DEFAULT_CATEGORIES = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Salário', 'Investimentos', 'Assinaturas', 'Outros'];
const DEFAULT_PERSONS = ['Eduardo', 'Mãe', 'Rodrigo'];

export function createHandler(deps: Deps) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    try {
      process.env.TZ = 'America/Sao_Paulo';
      const idToken = getBearerToken(req);
      if (!idToken) return res.status(401).json({ error: 'Token de autenticação ausente' });
      let decoded: { uid: string; email?: string };
      try { decoded = await deps.verifyIdToken(idToken); } catch { return res.status(401).json({ error: 'Sessão inválida. Entre de novo no app.' }); }

      let userId = decoded.uid;
      let userData = await deps.getUserById(decoded.uid);
      if (!userData && decoded.email) {
        const found = await deps.findUserByEmail(decoded.email.toLowerCase());
        if (found) { userId = found.id; userData = found.data; }
      }
      if (!userData) return res.status(403).json({ error: 'Usuário sem cadastro no sistema' });
      if (userData.status === 'inativo') return res.status(403).json({ error: 'Usuário inativo' });
      const session = buildSession(userId, userData, decoded.email);
      const { hasPermission, canAccessPerson } = makeAccess(session);
      if (!hasPermission('transactions', 'edit')) return res.status(403).json({ error: 'Você não tem permissão para importar lançamentos' });

      const body = req.body || {};
      const now = deps.now();

      if (body.action === 'template') {
        const [accounts, cards, persons, cats] = await Promise.all([deps.getCollection('accounts'), deps.getCollection('cards'), deps.getCollection('persons'), deps.getDocData('settings', 'categories')]);
        const payments = ['Conta Principal', ...accounts.filter((a) => session.role === 'admin' || canAccessPerson(a.owner)).map((a) => `Conta: ${a.name}`), ...cards.filter((c) => session.role === 'admin' || canAccessPerson(c.owner)).map((c) => `Cartão: ${c.name}`)];
        const names = persons.map((p) => (p.name || '').trim()).filter(Boolean);
        const baseNames = names.length ? names : DEFAULT_PERSONS;
        const personsList = baseNames.filter((p) => session.role === 'admin' || canAccessPerson(p));
        const categories = cats && Array.isArray(cats.list) && cats.list.length ? cats.list.map(String) : DEFAULT_CATEGORIES;
        const ExcelJS = await deps.loadExcel();
        const buffer = await buildTemplate(ExcelJS, { payments, persons: personsList, categories }, now);
        return res.status(200).json({ success: true, filename: 'Wynd_Modelo_Importacao.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: buffer.toString('base64') });
      }

      if (body.action !== 'preview') return res.status(400).json({ error: 'Ação não suportada' });
      const filename = typeof body.filename === 'string' ? body.filename.slice(0, 200) : 'arquivo';
      if (typeof body.base64 !== 'string' || body.base64.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      if (body.base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) return res.status(413).json({ error: 'O arquivo é grande demais (máximo de 3 MB). Divida em partes menores.' });
      const buf = Buffer.from(body.base64, 'base64');
      if (buf.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'O arquivo é grande demais (máximo de 3 MB). Divida em partes menores.' });

      let parsed: ParseResult;
      try {
        parsed = await parseFile(filename, buf, { ExcelJS: () => deps.loadExcel(), JSZip: () => deps.loadJSZip() });
      } catch (err: any) {
        if (err instanceof ImportError) return res.status(422).json({ error: err.message });
        throw err;
      }
      const transactions = await deps.getCollection('transactions');
      const visible = transactions.filter((tx) => canAccessPerson(tx.person, tx));
      markDuplicates(parsed.rows, visible);
      const valid = parsed.rows.filter((r) => !r.fatal);
      return res.status(200).json({
        success: true, format: parsed.format, filename, columns: parsed.columns, headerLine: parsed.headerLine, rows: parsed.rows, skipped: parsed.skipped.slice(0, 200),
        summary: {
          total: parsed.rows.length, valid: valid.length, invalid: parsed.rows.length - valid.length, skipped: parsed.skipped.length,
          duplicates: valid.filter((r) => r.duplicate && r.duplicate.level !== 'arquivo').length, repeatedInFile: valid.filter((r) => r.duplicate && r.duplicate.level === 'arquivo').length,
        },
      });
    } catch (err: any) {
      console.error('Erro ao ler arquivo de importação:', err);
      return res.status(500).json({ error: describeError(err) });
    }
  };
}

// ---------------------------------------------------------------------------------------------------------
// Ligação com o Firebase de verdade (só roda na Vercel)
// ---------------------------------------------------------------------------------------------------------

function getAdminApp(appMod: AppModule): App {
  const { initializeApp, getApps, getApp, cert } = appMod;
  if (getApps().length > 0) return getApp();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('A variável FIREBASE_SERVICE_ACCOUNT não está configurada na Vercel (Settings > Environment Variables).');
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('A variável FIREBASE_SERVICE_ACCOUNT existe mas não é um JSON válido. Cole o conteúdo inteiro do arquivo da chave de serviço.');
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

async function firebase() {
  const [appMod, authMod, firestoreMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  const app = getAdminApp(appMod);
  return { auth: authMod.getAuth(app), db: firestoreMod.getFirestore(app) };
}

const realDeps: Deps = {
  async verifyIdToken(token) { const { auth } = await firebase(); const d = await auth.verifyIdToken(token); return { uid: d.uid, email: d.email }; },
  async getUserById(uid) { const { db } = await firebase(); const snap = await db.collection('users').doc(uid).get(); return snap.exists ? snap.data() : null; },
  async findUserByEmail(email) { const { db } = await firebase(); const qs = await db.collection('users').where('email', '==', email).get(); return qs.empty ? null : { id: qs.docs[0].id, data: qs.docs[0].data() }; },
  async getCollection(name) { const { db } = await firebase(); const snap = await db.collection(name).get(); return snap.docs.map((d) => ({ ...d.data(), id: d.id })); },
  async getDocData(collection, id) { const { db } = await firebase(); const snap = await db.collection(collection).doc(id).get(); return snap.exists ? snap.data() : null; },
  async loadExcel() { const mod: any = await import('exceljs'); return mod.default || mod; },
  async loadJSZip() { const mod: any = await import('jszip'); return mod.default || mod; },
  now: () => new Date(),
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return createHandler(realDeps)(req, res);
}
