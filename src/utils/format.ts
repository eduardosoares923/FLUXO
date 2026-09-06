// Portado de js/core/utils.js do projeto original (vanilla JS) e tipado com TypeScript.

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

export function parseTxDate(dateVal: Date | number | string | null | undefined): Date | null {
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

export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  const d = parseTxDate(dateString);
  if (!d || isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function parseCurrency(valueString: string | number | null | undefined): number {
  if (!valueString) return 0;
  if (typeof valueString === 'number') return valueString;
  const str = String(valueString).replace(/[^\d,-]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function getCardInvoiceMonth(txDateStr: string | null | undefined, closeDay: number | string = 28): string {
  if (!txDateStr) return '';
  const d = parseTxDate(txDateStr);
  if (!d) return '';

  let year = d.getFullYear();
  let month = d.getMonth();
  const day = d.getDate();
  const closeD = typeof closeDay === 'number' ? closeDay : parseInt(String(closeDay), 10) || 28;

  if (closeD < 15) {
    if (day < closeD) month -= 1;
  } else {
    if (day >= closeD) month += 1;
  }

  const invoiceDate = new Date(year, month, 1);
  const invYear = invoiceDate.getFullYear();
  const invMonth = String(invoiceDate.getMonth() + 1).padStart(2, '0');
  return `${invYear}-${invMonth}`;
}

// Normaliza texto para comparação (remove acentos, minúsculas, trim)
export function normalize(str: string | null | undefined): string {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
