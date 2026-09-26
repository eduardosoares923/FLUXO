import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth, normalize, toPersonKeys, generateId } from '../utils/format';
import { toast } from '../stores/useToastStore';
import { ConfirmModal } from '../components/ConfirmModal';
import { Account, Card, Transaction, User } from '../types';

const emptyForm = { name: '', limit: '', closeDay: '28', dueDay: '10', owner: '' };

const BRAND_STYLES = [
  { match: /amazon/i, bg: 'bg-gradient-to-br from-gray-900 to-[#ff9900]' },
  { match: /inter/i, bg: 'bg-gradient-to-br from-[#ff7a00] to-[#ff9a3c]' },
  { match: /ita[uú]/i, bg: 'bg-gradient-to-br from-[#003399] to-[#0057d9]' },
  { match: /nubank|nu ?/i, bg: 'bg-gradient-to-br from-[#820ad1] to-[#a020f0]' },
  { match: /caixa/i, bg: 'bg-gradient-to-br from-[#003ca5] to-[#ff6600]' },
  { match: /santander|bradesco/i, bg: 'bg-gradient-to-br from-[#cc0000] to-[#8b0000]' },
];

function getBrandBg(name: string) {
  const found = BRAND_STYLES.find((b) => b.match.test(name || ''));
  return found ? found.bg : 'bg-gradient-to-br from-slate-800 to-slate-900';
}

function formatMonthLabel(monthStr: string) {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${names[parseInt(month) - 1] || month} de ${year}`;
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
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [payFromAccount, setPayFromAccount] = useState('');
  const [deductFromAccount, setDeductFromAccount] = useState(false);

  const canEdit = hasPermission('cards', 'edit');
  const visible = session.role === 'admin' ? cards : cards.filter((c) => canAccessPerson(c.owner));

  // Melhor cartão pra comprar hoje: o que fechou a fatura mais recentemente (maior nº de dias até o próximo fechamento),
  // já que uma compra hoje só vai cair na fatura seguinte, sobrando mais prazo até o vencimento.
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

  // Uso atual do limite: soma das despesas da fatura em aberto (mês corrente, calculado pelo dia de fechamento de cada cartão), pra mostrar direto no card fechado, sem precisar abrir a fatura.
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

  function openEdit(card: Card) {
    setForm({ name: card.name, limit: String(card.limit), closeDay: String(card.closeDay), dueDay: String(card.dueDay), owner: card.owner || '' });
    setEditingId(card.id!);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = form.owner.trim() || session.person;
    await saveRecord({ id: editingId || undefined, name: form.name.trim(), limit: parseFloat(form.limit) || 0, closeDay: parseInt(form.closeDay) || 28, dueDay: parseInt(form.dueDay) || 10, owner, ownerKey: normalize(owner) } as Card);
    setShowForm(false);
  }

  function openInvoice(card: Card) {
    setInvoiceCard(card);
    setInvoiceMonth(getCardInvoiceMonth(new Date().toISOString().slice(0, 10), card.closeDay));
    setPayFromAccount('');
    setDeductFromAccount(false);
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
        if (deductFromAccount) {
          if (!payFromAccount) return toast.warning('Selecione de qual conta sai o pagamento.');
          const txId = 'invpay_' + generateId();
          await saveTx({
            id: txId, type: 'invoice_payment', description: `Pagamento fatura ${invoiceCard.name} - ${formatMonthLabel(invoiceMonth)}`,
            amount: invoiceTotal, category: 'Pagamento de Fatura', date: new Date().toISOString().slice(0, 10),
            paymentMethod: payFromAccount, paidCardId: `card_${invoiceCard.id}`, invoiceMonth,
            person: session.person, personKeys: toPersonKeys(session.person), userId: session.id,
          } as Transaction);
          await savePaid({ id: paidRecordId, cardId: invoiceCard.id!, monthStr: invoiceMonth, total: invoiceTotal, paidAt: new Date().toISOString(), transactionId: txId, deductedAccount: payFromAccount } as PaidInvoice);
          toast.success(`Fatura de ${formatMonthLabel(invoiceMonth)} marcada como paga, e ${formatCurrency(invoiceTotal)} descontado da conta!`);
        } else {
          await savePaid({ id: paidRecordId, cardId: invoiceCard.id!, monthStr: invoiceMonth, total: invoiceTotal, paidAt: new Date().toISOString() } as PaidInvoice);
          toast.success(`Fatura de ${formatMonthLabel(invoiceMonth)} marcada como paga!`);
        }
      }
    } catch {
      toast.error('Erro ao atualizar status da fatura.');
    }
  }

  if (loading) return <div className="p-10 text-center text-[#8fa39a] animate-pulse">Carregando cartões...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-20">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#f2f0ea]">Cartões</h2>
        {canEdit && (
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="bg-[#e3b04b] text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform">
            <i className="fa-solid fa-plus mr-2" /> Novo Cartão
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {visible.map((card) => (
          <div
            key={card.id}
            onClick={() => openInvoice(card)}
            className={`${getBrandBg(card.name)} aspect-[1.6/1] rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between hover:-translate-y-1 transition-transform cursor-pointer relative ${card.id === bestCardTodayId ? 'ring-2 ring-[#34d399]' : ''}`}
          >
            {card.id === bestCardTodayId && (
              <span className="absolute -top-2.5 left-4 bg-[#34d399] text-black text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1">
                <i className="fa-solid fa-star" /> Melhor pra comprar hoje
              </span>
            )}
            <div className="flex justify-between items-start">
              <div className="w-12 h-8 bg-yellow-100/40 rounded flex items-center justify-center">
                <div className="w-8 h-5 border border-yellow-800/30 rounded-sm" />
              </div>
              {canEdit && (
                <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(card)} className="hover:text-yellow-300"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => setDeleteCardId(card.id!)} className="hover:text-red-300"><i className="fa-solid fa-trash" /></button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Limite</div>
              <div className="text-2xl font-mono">{formatCurrency(card.limit)}</div>
              {(() => {
                const used = usageByCard[card.id!] || 0;
                const pct = card.limit > 0 ? Math.min(100, Math.max(0, (used / card.limit) * 100)) : 0;
                return (
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-yellow-300' : 'bg-white/70'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] opacity-80 mt-1">{formatCurrency(used)} de {formatCurrency(card.limit)} ({pct.toFixed(0)}%)</div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-between items-end">
              <div className="text-lg font-bold tracking-wide uppercase truncate mr-2">{card.name}</div>
              <div className="text-xs text-right opacity-90 leading-tight shrink-0">
                F: {card.closeDay} <br />V: {card.dueDay}
              </div>
            </div>
          </div>
        ))}
      </div>

      {visible.length > 0 && <p className="text-[#8fa39a] text-sm mt-4">Clique num cartão pra ver a fatura.</p>}
      {visible.length === 0 && <p className="text-[#8fa39a] mt-10">Nenhum cartão cadastrado.</p>}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSubmit} className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 text-white">
            <h3 className="text-xl font-bold mb-2">{editingId ? 'Editar' : 'Novo'} Cartão</h3>
            <input placeholder="Nome do Cartão (Ex: Nubank)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            <input type="number" step="0.01" placeholder="Limite Total" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className="p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            <div className="flex gap-4">
              <input type="number" placeholder="Dia Fechamento" value={form.closeDay} onChange={(e) => setForm({ ...form, closeDay: e.target.value })} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
              <input type="number" placeholder="Dia Vencimento" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className="w-1/2 p-3 bg-black/40 border border-white/10 rounded-xl outline-none focus:border-[#e3b04b]" required />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 bg-[#e3b04b] text-black font-bold py-3 rounded-xl hover:bg-[#f5d78a] transition-colors">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {invoiceCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setInvoiceCard(null)}>
          <div className="bg-[#141d1a] border border-white/10 p-6 rounded-3xl w-full max-w-md text-white" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2">Fatura: {invoiceCard.name}</h3>

            <div className="flex items-center justify-center gap-3 my-3">
              <button onClick={() => changeInvoiceMonth(-1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="font-semibold capitalize min-w-[140px] text-center">{formatMonthLabel(invoiceMonth)}</span>
              <button onClick={() => changeInvoiceMonth(1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>

            {invoiceTxs.length === 0 ? (
              <p className="text-[#8fa39a] text-center py-6">Nenhum lançamento nesta fatura.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                {invoiceTxs.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/5">
                    <div>
                      <div className="font-medium text-sm">{tx.description}</div>
                      <div className="text-xs text-[#8fa39a]">{formatDate(tx.date)}</div>
                    </div>
                    <div className={`font-mono font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+ ' : '- '}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center border-t border-white/10 mt-3 pt-3">
              <span className="text-[#8fa39a]">Total da fatura</span>
              <strong className="font-mono text-lg">{formatCurrency(invoiceTotal)}</strong>
            </div>

            {!isPaid && (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm text-[#f2f0ea] cursor-pointer">
                  <input type="checkbox" checked={deductFromAccount} onChange={(e) => setDeductFromAccount(e.target.checked)} className="w-4 h-4 accent-[#e3b04b]" />
                  Descontar de uma conta
                </label>
                {deductFromAccount && (
                  <>
                    <label className="text-xs uppercase font-bold text-[#8fa39a] mt-2 block">Pagar com qual conta?</label>
                    <select value={payFromAccount} onChange={(e) => setPayFromAccount(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] outline-none">
                      <option value="">Selecione a conta</option>
                      {accounts.map((a) => (<option key={a.id} value={`acc_${a.id}`}>{a.name}</option>))}
                    </select>
                  </>
                )}
              </div>
            )}
            {isPaid && (() => {
              const rec = paidInvoices.find((p) => p.id === paidRecordId);
              const acc = accounts.find((a) => `acc_${a.id}` === rec?.deductedAccount);
              return acc ? <p className="text-xs text-[#8fa39a] mt-2">Descontado da conta {acc.name}.</p> : null;
            })()}

            <div className="flex justify-between gap-3 mt-4">
              <button onClick={togglePaid} disabled={!isPaid && deductFromAccount && !payFromAccount} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${isPaid ? 'bg-white/5 hover:bg-white/10' : 'bg-[#e3b04b] text-black hover:bg-[#f5d78a] disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                <i className={`fa-solid ${isPaid ? 'fa-rotate-left' : 'fa-check'} mr-2`} />
                {isPaid ? 'Reabrir fatura' : 'Marcar como paga'}
              </button>
              <button onClick={() => setInvoiceCard(null)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteCardId}
        title="Excluir cartão"
        message="Tem certeza que deseja excluir este cartão?"
        confirmLabel="Excluir"
        onConfirm={() => { if (deleteCardId) deleteRecord(deleteCardId); setDeleteCardId(null); }}
        onCancel={() => setDeleteCardId(null)}
      />
    </div>
  );
}
