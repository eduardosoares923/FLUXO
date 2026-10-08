// Vercel Serverless Function: gera o relatório do mês em Excel (.xlsx) formatado.
//
// POST /api/export-report   Authorization: Bearer <token de login>
//   corpo: { "month": "2026-10", "person": "todos", "format": "xlsx" }
//   resposta: { success: true, filename, mime, base64, summary: { transactions: N } }
//
// Por que no servidor: o servidor tem as bibliotecas de planilha e gera o MESMO arquivo para o site e para o app.
// Segurança: aqui dentro o Firebase é lido com a chave de administrador, que ignora as regras de acesso. Por isso esta
// função aplica sozinha as mesmas regras do app (quem tem a permissão "reports" e quais pessoas cada um enxerga).
//
// A lógica de cálculo (totais, categorias, acerto, parcelas...) é a MESMA da tela Relatórios do site, copiada de lá
// sem mudanças. Requer a variável FIREBASE_SERVICE_ACCOUNT, igual às outras funções da pasta api.

import type { App } from 'firebase-admin/app';

type AppModule = typeof import('firebase-admin/app');

// O código de cálculo vem do site, onde "Transaction" é um tipo do projeto. Aqui basta aceitar qualquer lançamento.
type Transaction = any;

// ---------------------------------------------------------------------------------------------------------
// Utilitários copiados do site (src/utils/format.ts)
// ---------------------------------------------------------------------------------------------------------

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
// Cálculo do relatório (a mesma lógica da tela Relatórios do site)
// ---------------------------------------------------------------------------------------------------------

export interface ReportInput {
  transactions: any[];
  accounts: any[];
  session: any;
  month: string; // "2026-10"
  person: string; // "todos" ou o nome de uma pessoa
  now: Date;
}

export function computeReport(input: ReportInput) {
  const { transactions, accounts, session } = input;
  const selectedMonth = input.month;
  const selectedPerson = input.person;
  const nowMs = input.now.getTime();
  const { canAccessPerson } = makeAccess(session);

  const prevMonthStr = (() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const prevDate = new Date(y, m - 2, 1);
        return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      })();
  const accessibleTx = (() => transactions.filter((tx) => canAccessPerson(tx.person, tx)))();
  const last6MonthsTrend = (() => {
        const buckets: Record<string, { income: number; expense: number }> = {};
        const now = new Date(nowMs);
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
      })();
  const { currentTxs, metrics, prevMetrics, categoryStats, personStats } = (() => {
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
          metrics: { income: curIncome, expense: curExpense, cardsTotal: curCards, economy: curIncome - totalCurExpense, commitment: curIncome > 0 ? (totalCurExpense / curIncome) * 100 : (totalCurExpense > 0 ? 100 : 0), equity },
          prevMetrics: { income: prevIncome, expense: prevExpense + prevCards, economy: prevIncome - (prevExpense + prevCards) },
          categoryStats: catArr, personStats: pArr
        };
      })();
  const settlements = (() => {
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
      })();
  const topExpenses = (() =>
        [...currentTxs]
          .filter((tx) => tx.type === 'expense')
          .sort((a, b) => Number(b.amount) - Number(a.amount))
          .slice(0, 5))();
  const installmentProjection = (() => {
        const now = new Date(nowMs);
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
      })();
  const equityHistory = (() => {
        const now = new Date(nowMs);
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
      })();

  return { prevMonthStr, accessibleTx, last6MonthsTrend, currentTxs, metrics, prevMetrics, categoryStats, personStats, settlements, topExpenses, installmentProjection, equityHistory };
}

type Report = ReturnType<typeof computeReport>;

// ---------------------------------------------------------------------------------------------------------
// Planilha (Excel)
// ---------------------------------------------------------------------------------------------------------

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function monthLabelPt(m: string): string {
  const [year, month] = m.split('-');
  return `${MONTHS_PT[parseInt(month) - 1] || month} de ${year}`;
}

const C = { dark: 'FF16241F', header: 'FF1F3A33', gold: 'FFE3B04B', zebra: 'FFF4F7F6', green: 'FF0F7B4F', red: 'FFB42318', gray: 'FF6B7B76', line: 'FFD5DDDA', white: 'FFFFFFFF' };
const MONEY = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
const PERCENT = '0.0%';
const VARIATION = '+0.0%;-0.0%;0.0%';
const DATE_BR = 'dd/mm/yyyy';

function typeLabel(tx: any): string {
  const isCard = typeof tx.paymentMethod === 'string' && tx.paymentMethod.startsWith('card_');
  if (tx.type === 'income') return isCard ? 'Estorno de cartão' : 'Receita';
  if (tx.type === 'transfer_out' || tx.type === 'transfer_in') return 'Transferência';
  if (tx.type === 'invoice_payment') return 'Pagamento de fatura';
  if (tx.type === 'expense') return 'Despesa';
  return 'Outro';
}

/** Valor da linha: se o relatório é de uma pessoa e a despesa é dividida, vale a cota dela (como nos totais). */
function rowAmount(tx: any, selectedPerson: string): number {
  const base = Number(tx.amount) || 0;
  if (selectedPerson !== 'todos' && tx.isSplit && Array.isArray(tx.splitDetails)) {
    const target = selectedPerson.toLowerCase();
    const item = tx.splitDetails.find((d: any) => d.person?.toLowerCase() === target);
    if (item) return Number(item.amount) || 0;
  }
  return base;
}

function paymentLabel(pm: any, accounts: any[], cards: any[]): string {
  if (!pm || pm === 'account') return 'Conta Principal';
  if (typeof pm !== 'string') return String(pm);
  if (pm.startsWith('acc_')) {
    const a = accounts.find((x) => `acc_${x.id}` === pm);
    return a ? `Conta: ${a.name}` : 'Conta';
  }
  if (pm.startsWith('card_')) {
    const c = cards.find((x) => `card_${x.id}` === pm);
    return c ? `Cartão: ${c.name}` : 'Cartão';
  }
  return pm;
}

function brNumber(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

function splitText(tx: any): string {
  if (!tx.isSplit || !Array.isArray(tx.splitDetails)) return '';
  return tx.splitDetails.map((d: any) => `${d.person}: ${brNumber(Number(d.amount) || 0)}`).join(' | ');
}

function bannerFor(commitment: number, economy: number) {
  const level = commitment > 70 ? 'HIGH' : commitment < 50 ? 'LOW' : 'MEDIUM';
  const title = commitment > 70 ? 'Atenção: alto comprometimento de renda' : commitment < 50 ? 'Excelente gestão financeira' : 'Orçamento sob controle';
  const money = `R$ ${brNumber(Math.abs(economy))}`;
  const message = commitment > 70
    ? `Você comprometeu ${commitment.toFixed(0)}% da receita neste mês. Considere rever despesas.`
    : commitment < 50
      ? `Você economizou ${economy < 0 ? '-' : ''}${money} este mês. Ótimo momento para aportar.`
      : `Seus gastos representam ${commitment.toFixed(0)}% da receita. A saúde financeira segue equilibrada.`;
  const score = Math.max(0, Math.min(100, Math.round(100 - commitment)));
  return { level, title, message, score };
}

export interface WorkbookMeta {
  month: string;
  person: string;
  userName: string;
  accounts: any[];
  cards: any[];
  now: Date;
}

/** Monta o arquivo Excel. [ExcelJS] é o módulo exceljs (carregado só quando precisa). */
export async function buildWorkbook(ExcelJS: any, report: Report, meta: WorkbookMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wynd';
  wb.created = meta.now;
  wb.title = `Relatório financeiro ${monthLabelPt(meta.month)}`;

  const personText = meta.person === 'todos' ? 'Todos (consolidado)' : meta.person;
  const periodText = `${monthLabelPt(meta.month)}  |  Pessoa: ${personText}`;
  const generated = `${String(meta.now.getDate()).padStart(2, '0')}/${String(meta.now.getMonth() + 1).padStart(2, '0')}/${meta.now.getFullYear()}`;
  const m = report.metrics;
  const pm = report.prevMetrics;

  const title = (ws: any, text: string, sub: string, lastCol: string) => {
    ws.mergeCells(`A1:${lastCol}1`);
    const t = ws.getCell('A1');
    t.value = text;
    t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.white } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 30;
    ws.mergeCells(`A2:${lastCol}2`);
    const s = ws.getCell('A2');
    s.value = sub;
    s.font = { name: 'Calibri', size: 10, color: { argb: C.gray } };
    s.alignment = { indent: 1 };
  };
  const headerRow = (row: any, from: number, to: number) => {
    for (let c = from; c <= to; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Calibri', bold: true, color: { argb: C.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.header } };
      cell.alignment = { vertical: 'middle', horizontal: c === from ? 'left' : 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: C.gold } } };
    }
    row.height = 22;
  };
  const bodyBorder = { bottom: { style: 'thin', color: { argb: C.line } } };

  // ------------------------------------------------------------------ Resumo
  const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  rs.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 18 }, { width: 18 }];
  rs.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  title(rs, 'WYND  |  RELATÓRIO FINANCEIRO', `${periodText}  |  Gerado em ${generated} por ${meta.userName}`, 'F');

  const prevDiff = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : '');
  const totalExpense = m.expense + m.cardsTotal;
  rs.getRow(4).values = ['Indicador', 'Mês atual', 'Mês anterior', 'Variação'];
  headerRow(rs.getRow(4), 1, 4);
  const kpi = (r: number, label: string, value: any, prev: any, diff: any, opts: { bold?: boolean; indent?: boolean; fmt?: string } = {}) => {
    const row = rs.getRow(r);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    if (prev !== undefined) row.getCell(3).value = prev;
    if (diff !== undefined) row.getCell(4).value = diff;
    row.getCell(1).alignment = { indent: opts.indent ? 2 : 1 };
    row.getCell(1).font = { name: 'Calibri', bold: !!opts.bold, color: { argb: opts.indent ? C.gray : 'FF000000' } };
    for (const c of [2, 3]) { row.getCell(c).numFmt = opts.fmt || MONEY; row.getCell(c).font = { name: 'Calibri', bold: !!opts.bold }; row.getCell(c).alignment = { horizontal: 'right' }; }
    row.getCell(4).numFmt = VARIATION; row.getCell(4).alignment = { horizontal: 'right' };
    for (let c = 1; c <= 4; c++) row.getCell(c).border = bodyBorder;
  };
  kpi(5, 'Receitas', m.income, pm.income, { formula: 'IF(C5>0,(B5-C5)/C5,"")', result: prevDiff(m.income, pm.income) }, { bold: true });
  kpi(6, 'Despesas em contas', m.expense, undefined, undefined, { indent: true });
  kpi(7, 'Despesas em cartões', m.cardsTotal, undefined, undefined, { indent: true });
  kpi(8, 'Despesas totais', { formula: 'B6+B7', result: totalExpense }, pm.expense, { formula: 'IF(C8>0,(B8-C8)/C8,"")', result: prevDiff(totalExpense, pm.expense) }, { bold: true });
  kpi(9, 'Economia líquida', { formula: 'B5-B8', result: m.economy }, { formula: 'C5-C8', result: pm.economy }, undefined, { bold: true });
  const commitmentResult = m.income > 0 ? totalExpense / m.income : (totalExpense > 0 ? 1 : 0);
  kpi(10, 'Comprometimento da renda', { formula: 'IF(B5>0,B8/B5,IF(B8>0,1,0))', result: commitmentResult }, undefined, undefined, { fmt: PERCENT });
  kpi(11, 'Patrimônio atual (contas)', m.equity, undefined, undefined, {});

  let r = 13;
  if (report.currentTxs.length > 0) {
    const b = bannerFor(m.commitment, m.economy);
    const color = b.level === 'HIGH' ? C.red : b.level === 'LOW' ? C.green : 'FF1D4ED8';
    rs.mergeCells(`A${r}:D${r}`);
    const c1 = rs.getCell(`A${r}`);
    c1.value = b.title;
    c1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: color } };
    c1.alignment = { indent: 1 };
    rs.mergeCells(`A${r + 1}:D${r + 1}`);
    const c2 = rs.getCell(`A${r + 1}`);
    c2.value = b.message;
    c2.font = { name: 'Calibri', color: { argb: C.gray } };
    c2.alignment = { indent: 1, wrapText: true, vertical: 'top' };
    rs.getRow(r + 1).height = 32;
    rs.getCell(`E${r}`).value = 'Nota do mês';
    rs.getCell(`E${r}`).font = { name: 'Calibri', size: 9, color: { argb: C.gray } };
    rs.getCell(`E${r}`).alignment = { horizontal: 'center' };
    rs.getCell(`E${r + 1}`).value = { formula: 'MAX(0,MIN(100,ROUND(100-B10*100,0)))', result: b.score };
    rs.getCell(`E${r + 1}`).font = { name: 'Calibri', size: 20, bold: true, color: { argb: color } };
    rs.getCell(`E${r + 1}`).alignment = { horizontal: 'center', vertical: 'middle' };
    r += 3;
  }

  if (report.settlements.length > 0) {
    rs.getRow(r).values = ['Acerto do mês: quem deve', 'Para', 'Valor'];
    headerRow(rs.getRow(r), 1, 3);
    r++;
    for (const s of report.settlements) {
      const row = rs.getRow(r++);
      row.values = [s.from, s.to, s.amount];
      row.getCell(3).numFmt = MONEY;
      for (let c = 1; c <= 3; c++) row.getCell(c).border = bodyBorder;
    }
    r++;
  }

  if (report.topExpenses.length > 0) {
    rs.getRow(r).values = ['Top 5 maiores gastos', 'Categoria', 'Pessoa', 'Valor'];
    headerRow(rs.getRow(r), 1, 4);
    r++;
    for (const tx of report.topExpenses) {
      const row = rs.getRow(r++);
      row.values = [tx.description || '', (tx.category || '').trim() || 'Outros', tx.person || '', rowAmount(tx, meta.person)];
      row.getCell(4).numFmt = MONEY;
      for (let c = 1; c <= 4; c++) row.getCell(c).border = bodyBorder;
    }
  }

  // ------------------------------------------------------------------ Transações
  const ts = wb.addWorksheet('Transações', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  ts.columns = [{ width: 13 }, { width: 38 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 24 }, { width: 34 }];
  const rows = report.currentTxs.map((tx: any, i: number) => ({ tx, i, d: parseTxDate(tx.date) as Date | null }));
  rows.sort((a, b) => (a.d ? a.d.getTime() : Infinity) - (b.d ? b.d.getTime() : Infinity) || a.i - b.i);
  const first = 6;
  const last = first + Math.max(rows.length, 1) - 1;
  title(ts, 'Transações do período', `${periodText}  |  ${rows.length} lançamento(s)`, 'H');
  const sumIf = (kind: string) => `SUMIFS($F$${first}:$F$${last},$E$${first}:$E$${last},"${kind}")`;
  const sumType = (kind: string) => rows.filter((x) => typeLabel(x.tx) === kind).reduce((s, x) => s + rowAmount(x.tx, meta.person), 0);
  const inc = sumType('Receita');
  const exp = sumType('Despesa');
  ts.getCell('A3').value = 'Receitas'; ts.getCell('B3').value = { formula: sumIf('Receita'), result: inc };
  ts.getCell('C3').value = 'Despesas'; ts.getCell('D3').value = { formula: sumIf('Despesa'), result: exp };
  ts.getCell('E3').value = 'Saldo'; ts.getCell('F3').value = { formula: 'B3-D3', result: inc - exp };
  for (const a of ['A3', 'C3', 'E3']) { ts.getCell(a).font = { name: 'Calibri', bold: true, color: { argb: C.gray } }; ts.getCell(a).alignment = { horizontal: 'right' }; }
  for (const a of ['B3', 'D3', 'F3']) { ts.getCell(a).numFmt = MONEY; ts.getCell(a).font = { name: 'Calibri', bold: true }; ts.getCell(a).alignment = { horizontal: 'left' }; }
  ts.getRow(5).values = ['Data', 'Descrição', 'Categoria', 'Pessoa', 'Tipo', 'Valor', 'Pagamento', 'Divisão'];
  headerRow(ts.getRow(5), 1, 8);
  rows.forEach((x, idx) => {
    const row = ts.getRow(first + idx);
    const dateCell = x.d ? new Date(Date.UTC(x.d.getFullYear(), x.d.getMonth(), x.d.getDate())) : (x.tx.date ?? '');
    row.values = [dateCell, x.tx.description || '', (x.tx.category || '').trim() || 'Outros', x.tx.person || '', typeLabel(x.tx), rowAmount(x.tx, meta.person), paymentLabel(x.tx.paymentMethod, meta.accounts, meta.cards), splitText(x.tx)];
    row.getCell(1).numFmt = DATE_BR;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(6).numFmt = MONEY;
    const kind = typeLabel(x.tx);
    row.getCell(5).font = { name: 'Calibri', color: { argb: kind === 'Receita' || kind === 'Estorno de cartão' ? C.green : kind === 'Despesa' ? C.red : C.gray } };
    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.border = bodyBorder;
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  });
  ts.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(last, 5), column: 8 } };
  ts.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:5' };

  // ------------------------------------------------------------------ Categorias
  const cs = wb.addWorksheet('Categorias', { views: [{ showGridLines: false }] });
  cs.columns = [{ width: 32 }, { width: 18 }, { width: 18 }];
  cs.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  title(cs, 'Despesas por categoria', periodText, 'C');
  cs.getRow(4).values = ['Categoria', 'Total', '% do total'];
  headerRow(cs.getRow(4), 1, 3);
  const cFirst = 5;
  const cLast = cFirst + Math.max(report.categoryStats.length, 1) - 1;
  const cTotal = report.categoryStats.reduce((s: number, x: any) => s + x.value, 0);
  report.categoryStats.forEach((x: any, i: number) => {
    const row = cs.getRow(cFirst + i);
    row.values = [x.name, x.value, { formula: `IF(SUM($B$${cFirst}:$B$${cLast})>0,B${cFirst + i}/SUM($B$${cFirst}:$B$${cLast}),0)`, result: cTotal > 0 ? x.value / cTotal : 0 }];
    row.getCell(2).numFmt = MONEY; row.getCell(3).numFmt = PERCENT;
    for (let c = 1; c <= 3; c++) row.getCell(c).border = bodyBorder;
  });
  if (report.categoryStats.length > 0) {
    const tr = cs.getRow(cLast + 1);
    tr.values = ['Total', { formula: `SUM(B${cFirst}:B${cLast})`, result: cTotal }, { formula: `SUM(C${cFirst}:C${cLast})`, result: cTotal > 0 ? 1 : 0 }];
    tr.getCell(2).numFmt = MONEY; tr.getCell(3).numFmt = PERCENT;
    for (let c = 1; c <= 3; c++) { tr.getCell(c).font = { name: 'Calibri', bold: true }; tr.getCell(c).border = { top: { style: 'medium', color: { argb: C.gold } } }; }
  } else {
    cs.getRow(cFirst).values = ['Nenhuma despesa registrada no período.'];
    cs.getRow(cFirst).font = { name: 'Calibri', italic: true, color: { argb: C.gray } };
  }

  // ------------------------------------------------------------------ Pessoas
  if (report.personStats.length > 0) {
    const ps = wb.addWorksheet('Pessoas', { views: [{ showGridLines: false }] });
    ps.columns = [{ width: 32 }, { width: 18 }, { width: 18 }];
    ps.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    title(ps, 'Despesas por pessoa', periodText, 'C');
    ps.getRow(4).values = ['Pessoa', 'Total', '% do total'];
    headerRow(ps.getRow(4), 1, 3);
    const pFirst = 5;
    const pLast = pFirst + report.personStats.length - 1;
    const pTotal = report.personStats.reduce((s: number, x: any) => s + x.value, 0);
    report.personStats.forEach((x: any, i: number) => {
      const row = ps.getRow(pFirst + i);
      row.values = [x.name, x.value, { formula: `IF(SUM($B$${pFirst}:$B$${pLast})>0,B${pFirst + i}/SUM($B$${pFirst}:$B$${pLast}),0)`, result: pTotal > 0 ? x.value / pTotal : 0 }];
      row.getCell(2).numFmt = MONEY; row.getCell(3).numFmt = PERCENT;
      for (let c = 1; c <= 3; c++) row.getCell(c).border = bodyBorder;
    });
    const tr = ps.getRow(pLast + 1);
    tr.values = ['Total', { formula: `SUM(B${pFirst}:B${pLast})`, result: pTotal }, { formula: `SUM(C${pFirst}:C${pLast})`, result: pTotal > 0 ? 1 : 0 }];
    tr.getCell(2).numFmt = MONEY; tr.getCell(3).numFmt = PERCENT;
    for (let c = 1; c <= 3; c++) { tr.getCell(c).font = { name: 'Calibri', bold: true }; tr.getCell(c).border = { top: { style: 'medium', color: { argb: C.gold } } }; }
  }

  // ------------------------------------------------------------------ Evolução
  const es = wb.addWorksheet('Evolução', { views: [{ showGridLines: false }] });
  es.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];
  es.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  title(es, 'Evolução dos últimos 6 meses', `Até ${monthLabelPt(`${meta.now.getFullYear()}-${String(meta.now.getMonth() + 1).padStart(2, '0')}`)}  |  Pessoa: ${personText}`, 'E');
  es.getRow(4).values = ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Patrimônio'];
  headerRow(es.getRow(4), 1, 5);
  report.last6MonthsTrend.forEach((t: any, i: number) => {
    const rr = 5 + i;
    const row = es.getRow(rr);
    row.values = [t.month, t.Receitas, t.Despesas, { formula: `B${rr}-C${rr}`, result: t.Receitas - t.Despesas }, report.equityHistory[i] ? report.equityHistory[i]['Patrimônio'] : ''];
    for (const c of [2, 3, 4, 5]) row.getCell(c).numFmt = MONEY;
    for (let c = 1; c <= 5; c++) row.getCell(c).border = bodyBorder;
  });
  const pr = 5 + report.last6MonthsTrend.length + 2;
  es.getRow(pr).values = ['Parcelas já agendadas', 'Total'];
  headerRow(es.getRow(pr), 1, 2);
  report.installmentProjection.forEach((p: any, i: number) => {
    const row = es.getRow(pr + 1 + i);
    row.values = [p.label, p.total];
    row.getCell(2).numFmt = MONEY;
    for (let c = 1; c <= 2; c++) row.getCell(c).border = bodyBorder;
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

// ---------------------------------------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------------------------------------

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export interface Deps {
  verifyIdToken(token: string): Promise<{ uid: string; email?: string }>;
  getUserById(uid: string): Promise<any | null>;
  findUserByEmail(email: string): Promise<{ id: string; data: any } | null>;
  getCollection(name: string): Promise<any[]>;
  loadExcel(): Promise<any>;
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

function safeName(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'todos';
}

export function createHandler(deps: Deps) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
      // Datas do relatório sempre no horário de Brasília, como no site.
      process.env.TZ = 'America/Sao_Paulo';

      const idToken = getBearerToken(req);
      if (!idToken) return res.status(401).json({ error: 'Token de autenticação ausente' });

      let decoded: { uid: string; email?: string };
      try {
        decoded = await deps.verifyIdToken(idToken);
      } catch {
        return res.status(401).json({ error: 'Sessão inválida. Entre de novo no app.' });
      }

      // Cadastro de quem está pedindo (igual ao site: pelo id e, se não achar, pelo e-mail)
      let userId = decoded.uid;
      let userData = await deps.getUserById(decoded.uid);
      if (!userData && decoded.email) {
        const found = await deps.findUserByEmail(decoded.email.toLowerCase());
        if (found) { userId = found.id; userData = found.data; }
      }
      if (!userData) return res.status(403).json({ error: 'Usuário sem cadastro no sistema' });
      if (userData.status === 'inativo') return res.status(403).json({ error: 'Usuário inativo' });

      const session = buildSession(userId, userData, decoded.email);
      if (!makeAccess(session).hasPermission('reports')) {
        return res.status(403).json({ error: 'Você não tem permissão para exportar relatórios' });
      }

      const body = req.body || {};
      const month = typeof body.month === 'string' ? body.month : '';
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM' });
      const person = typeof body.person === 'string' && body.person.trim() ? body.person.trim().slice(0, 80) : 'todos';
      const format = body.format === undefined ? 'xlsx' : body.format;
      if (format !== 'xlsx') return res.status(400).json({ error: 'Formato não suportado' });

      const [transactions, accounts, cards] = await Promise.all([
        deps.getCollection('transactions'), deps.getCollection('accounts'), deps.getCollection('cards'),
      ]);
      const now = deps.now();
      const report = computeReport({ transactions, accounts, session, month, person, now });
      const ExcelJS = await deps.loadExcel();
      const buffer = await buildWorkbook(ExcelJS, report, { month, person, userName: session.name, accounts, cards, now });

      return res.status(200).json({
        success: true,
        filename: `Wynd_Relatorio_${month}_${safeName(person)}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: buffer.toString('base64'),
        summary: { transactions: report.currentTxs.length },
      });
    } catch (err: any) {
      console.error('Erro ao exportar relatório:', err);
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
  async verifyIdToken(token) {
    const { auth } = await firebase();
    const d = await auth.verifyIdToken(token);
    return { uid: d.uid, email: d.email };
  },
  async getUserById(uid) {
    const { db } = await firebase();
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? snap.data() : null;
  },
  async findUserByEmail(email) {
    const { db } = await firebase();
    const qs = await db.collection('users').where('email', '==', email).get();
    return qs.empty ? null : { id: qs.docs[0].id, data: qs.docs[0].data() };
  },
  async getCollection(name) {
    const { db } = await firebase();
    const snap = await db.collection(name).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  },
  async loadExcel() {
    // Carrega a biblioteca só quando precisa; se falhar, o erro volta legível em vez de derrubar a função.
    const mod: any = await import('exceljs');
    return mod.default || mod;
  },
  now: () => new Date(),
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return createHandler(realDeps)(req, res);
}
