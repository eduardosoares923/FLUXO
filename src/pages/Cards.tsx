import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth, normalize, toPersonKeys, generateId } from '../utils/format';
import { toast } from '../stores/useToastStore';
import { ConfirmModal } from '../components/ConfirmModal';
import { CustomSelect } from '../components/CustomSelect';
import { MoneyField, NumberField, Tooltip } from '../components/ui';
import { Account, Card, Transaction, User } from '../types';

const emptyForm = { name: '', limit: '', closeDay: '28', dueDay: '10', owner: '', color: '' };

const CARD_COLORS = [
  '#820ad1', // Nubank roxo
  '#ff7a00', // Itaú laranja
  '#0f9d58', // Inter verde
  '#1F5A41', // Wynd verde floresta
  '#0057d9', // Azul clássico
  '#cc0000', // Vermelho
  '#e3b04b', // Dourado
  '#ec4899', // Rosa
  '#0891b2', // Ciano
  '#1f2937', // Grafite escuro
];

function shadeHex(hex: string, percent: number) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + percent / 100))));
  const r = f((num >> 16) & 255), g = f((num >> 8) & 255), b = f(num & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function getBrandGradient(name: string) {
  const n = (name || '').toLowerCase();
  if (/nu ?|nubank/.test(n)) return 'linear-gradient(135deg, #820ad1 0%, #56048c 100%)';
  if (/ita[uú]/.test(n)) return 'linear-gradient(135deg, #ff7a00 0%, #b34e00 100%)';
  if (/inter/.test(n)) return 'linear-gradient(135deg, #0f9d58 0%, #0a693a 100%)';
  if (/caixa/.test(n)) return 'linear-gradient(135deg, #003ca5 0%, #002566 100%)';
  if (/santander|bradesco/.test(n)) return 'linear-gradient(135deg, #cc0000 0%, #800000 100%)';
  return 'linear-gradient(135deg, #1F5A41 0%, #143b2a 100%)';
}

function getCardDigits(card: Card) {
  if ((card as any).lastDigits) return (card as any).lastDigits;
  let hash = 0;
  for (let i = 0; i < (card.name || '').length; i++) {
    hash = (hash * 31 + (card.name || '').charCodeAt(i)) % 10000;
  }
  return String(Math.abs(hash)).padStart(4, '0');
}

const CATEGORY_ICONS: Record<string, string> = {
  alimentação: 'fa-utensils', mercado: 'fa-cart-shopping', moradia: 'fa-house', transporte: 'fa-car',
  saúde: 'fa-heart-pulse', educação: 'fa-graduation-cap', lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar', investimentos: 'fa-chart-line', assinaturas: 'fa-rotate', 'roupas e acessórios': 'fa-shirt',
  internet: 'fa-wifi', farmácia: 'fa-kit-medical', casa: 'fa-house', trabalho: 'fa-briefcase',
};

function iconForCategory(category?: string) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return 'fa-bag-shopping';
}

function formatMonthLabel(monthStr: string) {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${names[parseInt(month) - 1] || month} ${year}`;
}

function shiftMonth(monthStr: string, offset: number) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface PaidInvoice {
  id?: string;
  cardId: string;
  monthStr: string;
  total: number;
  paidAt: string;
  transactionId?: string;
  deductedAccount?: string;
}

export default function Cards() {
  const { session, hasPermission, canAccessPerson } = useAuth() as { session: User; hasPermission: any; canAccessPerson: any };
  const { data: cards, loading, saveRecord, deleteRecord } = useCollection<Card>('cards');
  const { data: transactions, saveRecord: saveTx, deleteRecord: deleteTx } = useCollection<Transaction>('transactions');
  const { data: accounts } = useCollection<Account>('accounts');
  const { data: paidInvoices, saveRecord: savePaid, deleteRecord: deletePaid } = useCollection<PaidInvoice>('paidInvoices');

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [invoiceCard, setInvoiceCard] = useState<Card | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState('');
  const [mobileInvoiceOpen, setMobileInvoiceOpen] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [payFromAccount, setPayFromAccount] = useState('');

  const canEdit = hasPermission('cards', 'edit');
  const visible = session.role === 'admin' ? cards : cards.filter((c) => canAccessPerson(c.owner));

  // Seleciona automaticamente o primeiro cartão se nenhum estiver selecionado
  useEffect(() => {
    if (visible.length > 0 && !invoiceCard) {
      setInvoiceCard(visible[0]);
      setInvoiceMonth(getCardInvoiceMonth(new Date().toISOString().slice(0, 10), visible[0].closeDay));
    }
  }, [visible, invoiceCard]);

  // Melhor cartão para comprar hoje: o que fechou a fatura mais recentemente
  const bestCardTodayId = useMemo(() => {
    if (visible.length <= 1) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let best: any = null; let bestDays = -1;
    visible.forEach((card) => {
      let daysUntilClose = card.closeDay - today.getDate();
      if (daysUntilClose < 0) daysUntilClose += new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      if (daysUntilClose > bestDays) { bestDays = daysUntilClose; best = card; }
    });
    return best?.id || null;
  }, [visible]);

  // Uso atual do limite por cartão
  const usageByCard = useMemo(() => {
    const map: Record<string, number> = {};
    visible.forEach((card) => {
      const currentMonth = getCardInvoiceMonth(new Date().toISOString().slice(0, 10), card.closeDay);
      const used = transactions
        .filter((tx) => tx.paymentMethod === `card_${card.id}`)
        .filter((tx) => getCardInvoiceMonth(tx.date, card.closeDay) === currentMonth)
        .reduce((sum, tx) => sum + (tx.type === 'expense' ? Number(tx.amount) || 0 : -(Number(tx.amount) || 0)), 0);
      map[card.id!] = used;
    });
    return map;
  }, [visible, transactions]);

  function openNewCard() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(card: Card) {
    setForm({ name: card.name, limit: String(card.limit), closeDay: String(card.closeDay), dueDay: String(card.dueDay), owner: card.owner || '', color: card.color || '' });
    setEditingId(card.id!);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({
      id: editingId || undefined,
      name: form.name.trim(),
      limit: parseFloat(form.limit) || 0,
      closeDay: parseInt(form.closeDay) || 28,
      dueDay: parseInt(form.dueDay) || 10,
      owner,
      ownerKey: normalize(owner),
      color: form.color || '',
    } as Card);
    setShowForm(false);
  }

  function selectCard(card: Card) {
    setInvoiceCard(card);
    setInvoiceMonth(getCardInvoiceMonth(new Date().toISOString().slice(0, 10), card.closeDay));
    setMobileInvoiceOpen(true);
  }

  function changeInvoiceMonth(offset: number) {
    setInvoiceMonth((m) => shiftMonth(m, offset));
  }

  const invoiceTxs = useMemo(() => {
    if (!invoiceCard) return [];
    return transactions
      .filter((tx) => tx.paymentMethod === `card_${invoiceCard.id}`)
      .filter((tx) => getCardInvoiceMonth(tx.date, invoiceCard.closeDay) === invoiceMonth)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, invoiceCard, invoiceMonth]);

  const invoiceTotal = useMemo(
    () => invoiceTxs.reduce((sum, tx) => sum + (tx.type === 'expense' ? Number(tx.amount) || 0 : -(Number(tx.amount) || 0)), 0),
    [invoiceTxs]
  );

  const paidRecordId = invoiceCard ? `inv_${invoiceCard.id}_${invoiceMonth}` : null;
  const isPaid = useMemo(() => paidInvoices.some((p) => p.id === paidRecordId), [paidInvoices, paidRecordId]);

  async function togglePaid() {
    if (!invoiceCard || !paidRecordId) return;
    try {
      if (isPaid) {
        const existing = paidInvoices.find((p) => p.id === paidRecordId);
        if (existing?.transactionId) {
          await deleteTx(existing.transactionId, existing.deductedAccount);
        }
        await deletePaid(paidRecordId);
        toast.info(`Fatura de ${formatMonthLabel(invoiceMonth)} reaberta.`);
      } else {
        if (payFromAccount) {
          const txId = 'invpay_' + generateId();
          await saveTx({
            id: txId, type: 'invoice_payment', description: `Pagamento fatura ${invoiceCard.name} - ${formatMonthLabel(invoiceMonth)}`,
            amount: invoiceTotal, category: 'Pagamento de Fatura', date: new Date().toISOString().slice(0, 10),
            paymentMethod: payFromAccount, paidCardId: `card_${invoiceCard.id}`, invoiceMonth,
            person: session.person, personKeys: toPersonKeys(session.person), userId: session.id,
          } as Transaction);
          await savePaid({ id: paidRecordId, cardId: invoiceCard.id!, monthStr: invoiceMonth, total: invoiceTotal, paidAt: new Date().toISOString(), transactionId: txId, deductedAccount: payFromAccount } as PaidInvoice);
          toast.success(`Fatura de ${formatMonthLabel(invoiceMonth)} marcada como paga!`);
        } else {
          await savePaid({ id: paidRecordId, cardId: invoiceCard.id!, monthStr: invoiceMonth, total: invoiceTotal, paidAt: new Date().toISOString() } as PaidInvoice);
          toast.success(`Fatura de ${formatMonthLabel(invoiceMonth)} marcada como paga!`);
        }
      }
    } catch {
      toast.error('Erro ao atualizar status da fatura.');
    }
  }

  // Componente que renderiza os detalhes da fatura
  function renderInvoiceDetails() {
    if (!invoiceCard) return null;

    return (
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs flex flex-col justify-between h-full">
        <div>
          {/* Header da Fatura */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-bold font-heading text-ink truncate">
              Fatura {invoiceCard.name}
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              isPaid
                ? 'bg-pri text-white'
                : 'bg-priSoft text-pri'
            }`}>
              {isPaid ? 'Paga' : 'Em aberto'}
            </span>
          </div>

          {/* Navegador de Meses */}
          <div className="flex items-center justify-between bg-border/20 border border-border/40 rounded-full px-3 py-1.5 mb-6">
            <button
              onClick={() => changeInvoiceMonth(-1)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Mês anterior"
              className="w-7 h-7 rounded-full hover:bg-border/40 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <i className="fa-solid fa-chevron-left text-xs" />
            </button>
            <span className="font-heading font-bold text-sm text-ink capitalize">
              {formatMonthLabel(invoiceMonth)}
            </span>
            <button
              onClick={() => changeInvoiceMonth(1)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Próximo mês"
              className="w-7 h-7 rounded-full hover:bg-border/40 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <i className="fa-solid fa-chevron-right text-xs" />
            </button>
          </div>

          {/* Lista de Lançamentos da Fatura */}
          {invoiceTxs.length === 0 ? (
            <p className="text-muted text-sm text-center py-10">Nenhum lançamento nesta fatura.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/30 max-h-[340px] overflow-y-auto pr-1">
              {invoiceTxs.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-spendSoft/30 text-spendText flex items-center justify-center text-sm shrink-0">
                      <i className={`fa-solid ${iconForCategory(tx.category)}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-ink truncate">{tx.description}</div>
                      <div className="text-xs text-muted truncate">{tx.category || 'Geral'}</div>
                    </div>
                  </div>
                  <strong className="font-heading font-bold text-sm text-spendText shrink-0">
                    - {formatCurrency(tx.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé da Fatura com Total e Ação de Pagamento */}
        <div className="pt-6 border-t border-border/60 mt-4">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-xs font-medium text-muted">Total da fatura</span>
            <strong className="text-2xl font-bold font-heading text-ink">
              {formatCurrency(invoiceTotal)}
            </strong>
          </div>

          {!isPaid && (
            <div className="flex flex-col gap-2 mb-3">
              <label className="text-[11px] font-semibold text-muted uppercase">Pagar com qual conta?</label>
              <CustomSelect value={payFromAccount} onChange={(e) => setPayFromAccount(e.target.value)}>
                <option value="">Selecione uma conta (opcional)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={`acc_${a.id}`}>{a.name}</option>
                ))}
              </CustomSelect>
            </div>
          )}

          {isPaid && (() => {
            const rec = paidInvoices.find((p) => p.id === paidRecordId);
            const acc = accounts.find((a) => `acc_${a.id}` === rec?.deductedAccount);
            return acc ? (
              <p className="text-xs text-muted mb-3">Pago com a conta {acc.name}.</p>
            ) : null;
          })()}

          <button
            onClick={togglePaid}
            className={`w-full py-3 rounded-full font-medium text-sm transition-all shadow-xs flex items-center justify-center gap-2 ${
              isPaid
                ? 'border border-border text-ink hover:bg-border/20'
                : 'bg-pri text-white hover:opacity-95'
            }`}
          >
            <i className={`fa-solid ${isPaid ? 'fa-rotate-left' : 'fa-check'} text-xs`} />
            {isPaid ? 'Reabrir fatura' : 'Marcar como paga'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-pri border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-4 sm:pt-6 animate-in fade-in duration-500">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink">Cartões</h1>
        {canEdit && (
          <button
            onClick={openNewCard}
            className="px-4 py-2.5 rounded-full bg-pri text-white font-medium text-sm shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
          >
            <i className="fa-solid fa-plus text-xs" /> Novo cartão
          </button>
        )}
      </div>

      {/* GRID COM CARTÕES À ESQUERDA E FATURA À DIREITA (DESKTOP) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUNA DOS CARTÕES */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {visible.map((card) => {
              const used = usageByCard[card.id!] || 0;
              const pct = card.limit > 0 ? (used / card.limit) * 100 : 0;
              const isSelected = invoiceCard?.id === card.id;

              return (
                <div
                  key={card.id}
                  onClick={() => selectCard(card)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`group relative rounded-3xl p-6 text-white flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 ${
                    isSelected ? 'ring-2 ring-pri ring-offset-2 ring-offset-background' : ''
                  }`}
                  style={{
                    minHeight: '190px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    background: card.color
                      ? `linear-gradient(135deg, ${card.color} 0%, ${shadeHex(card.color, -35)} 100%)`
                      : getBrandGradient(card.name),
                  }}
                >
                  {/* Selo de Melhor para comprar hoje */}
                  {card.id === bestCardTodayId && (
                    <div className="absolute -top-3 left-6 z-10">
                      <span className="bg-[#208b5e] text-white text-[11px] font-semibold px-3 py-0.5 rounded-full shadow-xs flex items-center gap-1.5">
                        <i className="fa-solid fa-sparkles text-[10px]" /> Melhor para comprar hoje
                      </span>
                    </div>
                  )}

                  {/* Topo do Cartão: Nome e Final */}
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xl font-bold font-heading tracking-wide truncate">
                      {card.name}
                    </strong>
                    <span className="text-xs sm:text-sm font-mono tracking-wider opacity-90 shrink-0">
                      •••• {getCardDigits(card)}
                    </span>
                  </div>

                  {/* Meio: Limite Usado e Barra */}
                  <div className="my-3">
                    <div className="flex items-center justify-between text-xs font-medium opacity-90 mb-1.5">
                      <span>Usado {formatCurrency(used)}</span>
                      <span>Limite {formatCurrency(card.limit)}</span>
                    </div>
                    <div className="w-full h-2 bg-black/25 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </div>

                  {/* Rodapé: Fechamento, Vencimento e Botões de Edição */}
                  <div className="flex items-center justify-between text-xs opacity-90 pt-1">
                    <span>Fecha dia {card.closeDay}</span>
                    <div className="flex items-center gap-2">
                      <span>Vence dia {card.dueDay}</span>
                      {canEdit && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEdit(card)}
                            onContextMenu={(e) => e.preventDefault()}
                            aria-label="Editar cartão"
                            className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center transition-colors text-white"
                          >
                            <i className="fa-solid fa-pen text-[10px]" />
                          </button>
                          <button
                            onClick={() => setDeleteCardId(card.id!)}
                            onContextMenu={(e) => e.preventDefault()}
                            aria-label="Excluir cartão"
                            className="w-6 h-6 rounded hover:bg-red-500/30 flex items-center justify-center transition-colors text-white"
                          >
                            <i className="fa-solid fa-trash text-[10px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {visible.length > 0 && (
            <p className="text-muted text-xs sm:text-sm mt-2">Toque em um cartão para ver a fatura.</p>
          )}

          {visible.length === 0 && (
            <p className="text-muted text-sm mt-6">Nenhum cartão cadastrado.</p>
          )}
        </div>

        {/* COLUNA DA FATURA (EXIBIDA AO LADO NO DESKTOP) */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-6">
          {invoiceCard ? (
            renderInvoiceDetails()
          ) : (
            <div className="bg-card border border-border rounded-3xl p-8 text-center text-muted">
              Selecione um cartão para visualizar a fatura.
            </div>
          )}
        </div>

      </div>

      {/* GAVETA / MODAL DE FATURA NO CELULAR (RADIX UI DIALOG) */}
      <Dialog.Root open={mobileInvoiceOpen} onOpenChange={setMobileInvoiceOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in lg:hidden" />
          <Dialog.Content className="fixed bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto bg-card border-t border-border rounded-t-3xl p-6 text-ink shadow-2xl z-50 animate-in slide-in-from-bottom lg:hidden">
            <div className="w-12 h-1 bg-border rounded-full mx-auto mb-4" />
            <Dialog.Title className="sr-only">Fatura do Cartão</Dialog.Title>
            {renderInvoiceDetails()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* DIALOG DE CADASTRO / EDIÇÃO DE CARTÃO (RADIX UI) */}
      <Dialog.Root open={showForm} onOpenChange={setShowForm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border p-6 rounded-3xl text-ink shadow-2xl z-50 animate-in zoom-in-95">
            <Dialog.Title className="text-xl font-bold font-heading mb-4 text-ink">
              {editingId ? 'Editar Cartão' : 'Novo Cartão'}
            </Dialog.Title>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Nome do Cartão</label>
                <input
                  placeholder="Ex: Nubank, Itaú"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="p-3 bg-card border border-border rounded-xl text-ink outline-none focus:border-pri transition-colors text-sm"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold text-muted">Limite Total</label>
                <MoneyField
                  placeholder="R$ 0,00"
                  value={form.limit}
                  onChange={(e) => setForm({ ...form, limit: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold text-muted">Dia Fechamento</label>
                  <NumberField
                    min={1}
                    max={31}
                    placeholder="Ex: 28"
                    value={form.closeDay}
                    onChange={(e) => setForm({ ...form, closeDay: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold text-muted">Dia Vencimento</label>
                  <NumberField
                    min={1}
                    max={31}
                    placeholder="Ex: 10"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  />
                </div>
              </div>

              {/* SELETOR DE CORES DO WYND */}
              <div className="flex flex-col gap-2 mt-1">
                <label className="text-xs uppercase font-bold text-muted">Cor do cartão</label>
                <div className="flex flex-wrap gap-2">
                  <Tooltip content="Automática pelo banco">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, color: '' })}
                      onContextMenu={(e) => e.preventDefault()}
                      aria-label="Cor automática pelo nome do banco"
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-muted bg-border/20 ${
                        !form.color ? 'border-pri ring-2 ring-pri/30' : 'border-transparent'
                      }`}
                    >
                      Auto
                    </button>
                  </Tooltip>
                  {CARD_COLORS.map((c) => (
                    <Tooltip key={c} content={`Cor ${c}`}>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, color: c })}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label={`Cor ${c}`}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          form.color === c ? 'border-white ring-2 ring-pri scale-110' : 'border-transparent'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${c}, ${shadeHex(c, -35)})` }}
                      />
                    </Tooltip>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-border hover:bg-border/20 py-2.5 rounded-full font-semibold text-sm transition-colors text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-pri text-white font-semibold py-2.5 rounded-full hover:opacity-95 transition-opacity text-sm shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      <ConfirmModal
        isOpen={!!deleteCardId}
        title={'Excluir cartão'}
        message="Tem certeza que deseja excluir este cartão?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deleteCardId) deleteRecord(deleteCardId); setDeleteCardId(null); }}
        onCancel={() => setDeleteCardId(null)}
      />
    </div>
  );
}
