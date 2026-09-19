import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate, getCardInvoiceMonth, toPersonKeys, generateId } from '../utils/format';
import { transactionSchema } from '../schemas/financialSchemas';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../stores/useToastStore';

const CATEGORY_ICONS = {
  alimentação: 'fa-utensils',
  mercado: 'fa-cart-shopping',
  moradia: 'fa-house',
  transporte: 'fa-car',
  saúde: 'fa-heart-pulse',
  educação: 'fa-graduation-cap',
  lazer: 'fa-champagne-glasses',
  salário: 'fa-sack-dollar',
  investimentos: 'fa-chart-line',
  assinaturas: 'fa-rotate',
  'roupas e acessórios': 'fa-shirt',
};

function iconForCategory(category, type) {
  const key = (category || '').trim().toLowerCase();
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return type === 'income' ? 'fa-arrow-down' : 'fa-bag-shopping';
}

// Soma N meses a uma data "YYYY-MM-DD", travando no último dia do mês de
// destino quando o dia original não existe nele (ex: 31/01 + 1 mês = 28 ou
// 29/02). Mesma regra do parcelamento original.
function addMonthsClamped(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const finalDate = new Date(target.getFullYear(), target.getMonth(), day);
  const yy = finalDate.getFullYear();
  const mm = String(finalDate.getMonth() + 1).padStart(2, '0');
  const dd = String(finalDate.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function Transactions() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  const { data: transactions, loading, error, saveRecord, deleteRecord, deleteRecords } = useCollection('transactions');
  const { data: accounts } = useCollection('accounts');
  const { data: cards } = useCollection('cards');
  const { data: personsList } = useCollection('persons');

  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [groupDeleteTx, setGroupDeleteTx] = useState(null);
  const [detailsTx, setDetailsTx] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

  // Parcelamento
  const [paymentMode, setPaymentMode] = useState('single'); // 'single' | 'installments'
  const [installmentsCount, setInstallmentsCount] = useState(2);
  const [installmentValueType, setInstallmentValueType] = useState('total'); // 'total' | 'per'

  // Divisão entre pessoas
  const [isSplit, setIsSplit] = useState(false);
  const [splitItems, setSplitItems] = useState({});

  const canEdit = hasPermission('transactions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean);
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const availableCategories = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.category).filter(Boolean));
    return [...set].sort();
  }, [transactions]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: '',
      amount: '',
      type: 'expense',
      category: '',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'account',
      person: '',
    },
  });

  const watchedAmount = watch('amount');
  const watchedType = watch('type');

  const visible = useMemo(
    () =>
      [...transactions]
        .filter((tx) => canAccessPerson(tx.person, tx))
        .filter((tx) => typeFilter === 'all' || tx.type === typeFilter)
        .filter((tx) => categoryFilter === 'all' || tx.category === categoryFilter)
        .filter(
          (tx) =>
            !search ||
            tx.description?.toLowerCase().includes(search.toLowerCase()) ||
            tx.category?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, canAccessPerson, typeFilter, categoryFilter, search]
  );

  function resetSplitAndInstallments() {
    setIsSplit(false);
    setSplitItems({});
    setPaymentMode('single');
    setInstallmentsCount(2);
    setInstallmentValueType('total');
  }

  function openNew() {
    reset({
      description: '',
      amount: '',
      type: 'expense',
      category: '',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'account',
      person: session.person,
    });
    resetSplitAndInstallments();
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(tx) {
    reset({
      description: tx.description || '',
      amount: tx.installmentAmount ?? tx.amount ?? '',
      type: tx.type || 'expense',
      category: tx.category || '',
      date: tx.date || new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'account',
      person: tx.person || session.person,
    });
    setIsSplit(Boolean(tx.isSplit));
    if (tx.isSplit && Array.isArray(tx.splitDetails)) {
      const items = {};
      tx.splitDetails.forEach((d) => {
        items[d.person] = String(d.amount);
      });
      setSplitItems(items);
    } else {
      setSplitItems({});
    }
    setPaymentMode('single'); // editar sempre mexe só nesse registro, não recria parcelas
    setEditingId(tx.id);
    setShowForm(true);
  }

  function handleSplitCheck(personName, checked) {
    setSplitItems((prev) => {
      const copy = { ...prev };
      if (checked) copy[personName] = copy[personName] || '';
      else delete copy[personName];
      return copy;
    });
  }

  function handleSplitValueChange(personName, val) {
    setSplitItems((prev) => ({ ...prev, [personName]: val }));
  }

  function splitEqually() {
    const total = parseFloat(watchedAmount) || 0;
    const keys = Object.keys(splitItems);
    if (keys.length === 0) {
      toast.warning('Selecione pelo menos uma pessoa para dividir.');
      return;
    }
    const share = Math.floor((total / keys.length) * 100) / 100;
    const remainder = Math.round((total - share * keys.length) * 100) / 100;
    const updated = {};
    keys.forEach((k, idx) => {
      updated[k] = idx === 0 ? (share + remainder).toFixed(2) : share.toFixed(2);
    });
    setSplitItems(updated);
  }

  function computeInvoiceMonth(dateStr, paymentMethod) {
    if (!paymentMethod?.startsWith('card_')) return undefined;
    const cardId = paymentMethod.replace('card_', '');
    const card = cards.find((c) => String(c.id) === cardId);
    return card ? getCardInvoiceMonth(dateStr, card.closeDay) : undefined;
  }

  async function onSubmit(data) {
    try {
      let finalPerson = data.person?.trim() || session.person;
      let finalSplitDetails = null;

      if (isSplit) {
        const keys = Object.keys(splitItems);
        if (keys.length === 0) {
          toast.warning('Selecione pelo menos uma pessoa na divisão.');
          return;
        }
        let sum = 0;
        const details = [];
        for (const k of keys) {
          const val = parseFloat(splitItems[k]) || 0;
          if (val <= 0) {
            toast.warning(`Informe o valor da cota de ${k}.`);
            return;
          }
          sum += val;
          details.push({ person: k, amount: val });
        }
        const totalAmt = Number(data.amount) || 0;
        if (paymentMode === 'single' && Math.abs(sum - totalAmt) > 0.05) {
          toast.error(`A soma das cotas (${formatCurrency(sum)}) deve ser igual ao valor total (${formatCurrency(totalAmt)}).`);
          return;
        }
        finalPerson = details.map((d) => d.person).join(', ');
        finalSplitDetails = details;
      }

      if (paymentMode === 'installments' && installmentsCount >= 2 && !editingId) {
        const rawAmount = Number(data.amount) || 0;
        const installmentAmount =
          installmentValueType === 'total'
            ? Math.round((rawAmount / installmentsCount) * 100) / 100
            : rawAmount;
        const totalAmount =
          installmentValueType === 'total' ? rawAmount : Math.round(rawAmount * installmentsCount * 100) / 100;

        const groupId = 'group_' + generateId();
        const saves = [];
        for (let i = 0; i < installmentsCount; i++) {
          const instDate = addMonthsClamped(data.date, i);
          saves.push(
            saveRecord({
              groupId,
              type: data.type,
              description: `${data.description.trim()} (${i + 1}/${installmentsCount})`,
              amount: installmentAmount,
              installmentAmount,
              totalPurchaseAmount: totalAmount,
              category: data.category?.trim() || '',
              paymentMethod: data.paymentMethod,
              person: finalPerson,
              personKeys: toPersonKeys(finalPerson),
              date: instDate,
              invoiceMonth: computeInvoiceMonth(instDate, data.paymentMethod),
              installmentIndex: i + 1,
              totalInstallments: installmentsCount,
              isSplit,
              splitDetails: finalSplitDetails,
              userId: session.id,
            })
          );
        }
        await Promise.all(saves);
        toast.success(`Lançamento parcelado em ${installmentsCount}x de ${formatCurrency(installmentAmount)}!`);
      } else {
        const record = {
          id: editingId || undefined,
          description: data.description.trim(),
          amount: Number(data.amount),
          type: data.type,
          category: data.category?.trim() || '',
          date: data.date,
          paymentMethod: data.paymentMethod,
          person: finalPerson,
          personKeys: toPersonKeys(finalPerson),
          isSplit,
          splitDetails: finalSplitDetails,
          userId: session.id,
          invoiceMonth: computeInvoiceMonth(data.date, data.paymentMethod),
        };
        await saveRecord(record);
        toast.success(editingId ? 'Transação atualizada!' : 'Transação registrada!');
      }

      setShowForm(false);
    } catch (err) {
      console.error('Erro ao salvar transação:', err);
      toast.error('Erro ao salvar transação.');
    }
  }

  function requestDelete(tx) {
    if (tx.groupId) {
      setGroupDeleteTx(tx);
    } else {
      setDeleteId(tx.id);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;
    try {
      await deleteRecord(deleteId);
      toast.success('Transação excluída!');
    } catch {
      toast.error('Erro ao excluir transação.');
    } finally {
      setDeleteId(null);
    }
  }

  async function handleDeleteJustThis() {
    if (!groupDeleteTx) return;
    try {
      await deleteRecord(groupDeleteTx.id);
      toast.success('Parcela excluída!');
    } catch {
      toast.error('Erro ao excluir parcela.');
    } finally {
      setGroupDeleteTx(null);
    }
  }

  async function handleDeleteWholeGroup() {
    if (!groupDeleteTx) return;
    const groupIds = transactions.filter((t) => t.groupId === groupDeleteTx.groupId).map((t) => t.id);
    try {
      await deleteRecords(groupIds);
      toast.success(`${groupIds.length} parcelas excluídas!`);
    } catch {
      toast.error('Erro ao excluir parcelas.');
    } finally {
      setGroupDeleteTx(null);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === visible.length ? new Set() : new Set(visible.map((tx) => tx.id))));
  }

  async function handleConfirmBulkDelete() {
    try {
      await deleteRecords([...selectedIds]);
      toast.success(`${selectedIds.size} transações excluídas!`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Erro ao excluir transações selecionadas.');
    } finally {
      setConfirmBulkDelete(false);
    }
  }

  if (loading) return <PageLoading message="Carregando transações..." />;
  if (error) return <PageError error={error} title="Erro ao carregar transações" />;

  // Agrupamento de transações por data
  const groupedTx = visible.reduce((acc, tx) => {
    if (!acc[tx.date]) acc[tx.date] = [];
    acc[tx.date].push(tx);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedTx).sort((a, b) => b.localeCompare(a));

  return (
    <div className="transactions-page">
      <div className="page-header">
        <h2>Transações</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Nova transação
          </button>
        )}
      </div>

      <div className="filters-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', width: '100%' }}
          />
        </div>

        <div className="chip-filters" style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setTypeFilter('all')} className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '20px' }}>Todas</button>
          <button onClick={() => setTypeFilter('income')} className={`btn btn-sm ${typeFilter === 'income' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '20px' }}>Receitas</button>
          <button onClick={() => setTypeFilter('expense')} className={`btn btn-sm ${typeFilter === 'expense' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '20px' }}>Despesas</button>
        </div>

        {/* Dropdown de Categoria Customizado */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setIsCategoryOpen(!isCategoryOpen)}
            className="btn btn-ghost"
            style={{ background: 'var(--glass-bg)', borderRadius: '12px', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', border: isCategoryOpen ? '1px solid var(--accent-primary)' : '1px solid transparent', color: categoryFilter === 'all' ? 'var(--text-primary)' : 'var(--accent-primary)', boxShadow: 'none', fontWeight: 500 }}
          >
            {categoryFilter === 'all' ? 'Filtro: Categoria' : categoryFilter}
            <i className={`fa-solid fa-chevron-${isCategoryOpen ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', opacity: 0.7 }} />
          </button>

          {isCategoryOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setIsCategoryOpen(false)} />
              
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#0b1210', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '0.5rem', zIndex: 50, minWidth: '240px', maxHeight: '300px', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
                <div 
                  onClick={() => { setCategoryFilter('all'); setIsCategoryOpen(false); }}
                  style={{ padding: '0.7rem 1rem', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s', background: categoryFilter === 'all' ? 'rgba(227, 176, 75, 0.15)' : 'transparent', color: categoryFilter === 'all' ? 'var(--accent-primary)' : 'var(--text-primary)', fontWeight: categoryFilter === 'all' ? 600 : 400 }}
                  onMouseEnter={(e) => e.target.style.background = categoryFilter === 'all' ? 'rgba(227, 176, 75, 0.15)' : 'rgba(255, 255, 255, 0.05)'}
                  onMouseLeave={(e) => e.target.style.background = categoryFilter === 'all' ? 'rgba(227, 176, 75, 0.15)' : 'transparent'}
                >
                  Todas as Categorias
                </div>
                {availableCategories.map(c => (
                  <div 
                    key={c}
                    onClick={() => { setCategoryFilter(c); setIsCategoryOpen(false); }}
                    style={{ padding: '0.7rem 1rem', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s', background: categoryFilter === c ? 'rgba(227, 176, 75, 0.15)' : 'transparent', color: categoryFilter === c ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: categoryFilter === c ? 600 : 400 }}
                    onMouseEnter={(e) => e.target.style.background = categoryFilter === c ? 'rgba(227, 176, 75, 0.15)' : 'rgba(255, 255, 255, 0.05)'}
                    onMouseLeave={(e) => e.target.style.background = categoryFilter === c ? 'rgba(227, 176, 75, 0.15)' : 'transparent'}
                  >
                    {c}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-action-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 111, 94, 0.15)', borderRadius: '12px', padding: '0.8rem 1.2rem', marginBottom: '1.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedIds.size} selecionada(s)</span>
          <button className="btn btn-ghost" onClick={() => setConfirmBulkDelete(true)} style={{ color: 'var(--danger)', borderColor: 'rgba(255,111,94,0.3)' }}>
            <i className="fa-solid fa-trash" /> Excluir selecionadas
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon="fa-arrow-right-arrow-left" title="Nenhuma transação encontrada" description="Registre receitas e despesas, ou ajuste os filtros de busca." actionLabel={canEdit ? 'Nova transação' : undefined} onAction={canEdit ? openNew : undefined} />
      ) : (
        <div className="tx-list">
          {canEdit && (
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={selectedIds.size === visible.length} onChange={toggleSelectAll} id="selectAllTx" />
              <label htmlFor="selectAllTx">Selecionar todas as listadas</label>
            </div>
          )}
          
          {sortedDates.map(dateStr => (
            <div key={dateStr} className="tx-date-group" style={{ marginBottom: '1.5rem' }}>
              <div className="tx-group-header" style={{ padding: '1.2rem 0.5rem 0.6rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {formatDate(dateStr)}
              </div>
              
              <div className="tx-group-items" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {groupedTx[dateStr].map(tx => (
                  <div key={tx.id} className="tx-row" style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem', background: 'var(--glass-bg)', borderRadius: '14px', border: '1px solid var(--glass-border)', gap: '1rem', transition: 'transform 0.2s' }}>
                    
                    {canEdit && <input type="checkbox" checked={selectedIds.has(tx.id)} onChange={() => toggleSelect(tx.id)} />}
                    
                    <div className={`tx-icon ${tx.type}`} style={{ width: '46px', height: '46px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tx.type === 'income' ? 'rgba(95, 208, 143, 0.15)' : 'rgba(255, 111, 94, 0.15)', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)', fontSize: '1.2rem', flexShrink: 0 }}>
                      <i className={`fa-solid ${iconForCategory(tx.category, tx.type)}`} />
                    </div>
                    
                    <div className="tx-info" style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.05rem' }}>
                        {tx.description}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                          {tx.category || 'Sem categoria'}
                        </span>
                        {tx.person && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                            <i className="fa-solid fa-user" style={{marginRight: '4px'}}/> {tx.person}
                          </span>
                        )}
                        {tx.groupId && (
                           <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'rgba(227, 176, 75, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 500 }}>
                             <i className="fa-solid fa-layer-group" style={{marginRight: '4px'}}/> Parcelado
                           </span>
                        )}
                      </div>
                    </div>

                    <div className="tx-value" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                        {tx.type === 'income' ? '+ ' : '- '}{formatCurrency(tx.amount)}
                      </div>
                      <div className="tx-actions" style={{ display: 'flex', gap: '0.8rem' }}>
                         <button onClick={() => setDetailsTx(tx)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><i className="fa-solid fa-eye" /></button>
                         {canEdit && (
                           <>
                             <button onClick={() => openEdit(tx)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><i className="fa-solid fa-pen" /></button>
                             <button onClick={() => requestDelete(tx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: 0.8 }}><i className="fa-solid fa-trash" /></button>
                           </>
                         )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de nova/editar transação */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit(onSubmit)}>
            <h3>{editingId ? 'Editar transação' : 'Nova transação'}</h3>

            <label>Descrição</label>
            <input {...register('description')} placeholder="Ex: Supermercado" />
            {errors.description && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.description.message}</span>}

            <label>Tipo</label>
            <select {...register('type')}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>

            <label>Valor {paymentMode === 'installments' && installmentValueType === 'total' ? '(total da compra)' : ''}</label>
            <input type="number" step="0.01" {...register('amount')} />
            {errors.amount && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.amount.message}</span>}

            <label>Data {paymentMode === 'installments' ? '(1ª parcela)' : ''}</label>
            <input type="date" {...register('date')} />

            <label>Categoria</label>
            <input {...register('category')} list="tx-categories" placeholder="Ex: Alimentação" />
            <datalist id="tx-categories">
              {availableCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <label>Forma de pagamento</label>
            <select {...register('paymentMethod')}>
              <option value="account">Conta corrente (padrão)</option>
              <optgroup label="Contas">
                {accounts.map((a) => (
                  <option key={a.id} value={`acc_${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cartões">
                {cards.map((c) => (
                  <option key={c.id} value={`card_${c.id}`}>
                    Cartão {c.name}
                  </option>
                ))}
              </optgroup>
            </select>

            {!editingId && watchedType === 'expense' && (
              <div style={{ margin: '0.75rem 0', padding: '10px', background: 'rgba(30,41,59,0.5)', borderRadius: '8px', border: '1px solid #334155' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={paymentMode === 'installments'}
                    onChange={(e) => setPaymentMode(e.target.checked ? 'installments' : 'single')}
                  />
                  Parcelar essa compra
                </label>

                {paymentMode === 'installments' && (
                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '90px' }}>
                      <label style={{ fontSize: '0.78rem' }}>Nº de parcelas</label>
                      <input
                        type="number"
                        min="2"
                        max="48"
                        value={installmentsCount}
                        onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label style={{ fontSize: '0.78rem' }}>Valor informado é</label>
                      <select value={installmentValueType} onChange={(e) => setInstallmentValueType(e.target.value)}>
                        <option value="total">Total da compra</option>
                        <option value="per">Valor de cada parcela</option>
                      </select>
                    </div>
                  </div>
                )}
                {paymentMode === 'installments' && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    {installmentValueType === 'total'
                      ? `${installmentsCount}x de ${formatCurrency((Number(watchedAmount) || 0) / installmentsCount)}`
                      : `Total: ${formatCurrency((Number(watchedAmount) || 0) * installmentsCount)}`}
                  </p>
                )}
              </div>
            )}

            {/* Divisão entre pessoas */}
            <div style={{ margin: '0.75rem 0', padding: '10px', background: 'rgba(30,41,59,0.5)', borderRadius: '8px', border: '1px solid #334155' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontWeight: 600 }}>
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} />
                Dividir com outras pessoas
              </label>

              {isSplit ? (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Quem divide:</span>
                    <button type="button" onClick={splitEqually} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>
                      <i className="fa-solid fa-calculator" /> Dividir igual
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {availablePersons.map((pName) => {
                      const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                      return (
                        <div key={pName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '0.85rem' }}>
                            <input type="checkbox" checked={isChecked} onChange={(e) => handleSplitCheck(pName, e.target.checked)} />
                            {pName}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            disabled={!isChecked}
                            placeholder="0.00"
                            value={splitItems[pName] || ''}
                            onChange={(e) => handleSplitValueChange(pName, e.target.value)}
                            style={{ width: '90px', padding: '4px 6px', fontSize: '0.85rem' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '8px' }}>
                  <label>Pessoa</label>
                  <input {...register('person')} placeholder={session.person} />
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de detalhes (somente leitura) */}
      {detailsTx && (
        <div className="modal-backdrop" onClick={() => setDetailsTx(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Detalhes da transação</h3>
            <p><strong>Descrição:</strong> {detailsTx.description}</p>
            <p><strong>Valor:</strong> {formatCurrency(detailsTx.amount)}</p>
            <p><strong>Tipo:</strong> {detailsTx.type === 'income' ? 'Receita' : 'Despesa'}</p>
            <p><strong>Data:</strong> {formatDate(detailsTx.date)}</p>
            <p><strong>Categoria:</strong> {detailsTx.category || '-'}</p>
            <p><strong>Pessoa:</strong> {detailsTx.person}</p>
            {detailsTx.totalInstallments && (
              <p>
                <strong>Parcela:</strong> {detailsTx.installmentIndex}/{detailsTx.totalInstallments} (total da compra:{' '}
                {formatCurrency(detailsTx.totalPurchaseAmount)})
              </p>
            )}
            {detailsTx.isSplit && Array.isArray(detailsTx.splitDetails) && (
              <div>
                <strong>Divisão:</strong>
                <ul>
                  {detailsTx.splitDetails.map((d) => (
                    <li key={d.person}>
                      {d.person}: {formatCurrency(d.amount)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setDetailsTx(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Excluir transação"
        message="Tem certeza que deseja excluir esta transação?"
        confirmLabel="Excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmModal
        isOpen={confirmBulkDelete}
        title="Excluir transações selecionadas"
        message={`Tem certeza que deseja excluir ${selectedIds.size} transação(ões)?`}
        confirmLabel="Excluir todas"
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Exclusão de parcelamento: essa aqui não é um confirm simples, tem
          3 caminhos (cancelar / só esta / todas), por isso um modal à parte */}
      {groupDeleteTx && (
        <div className="modal-backdrop" onClick={() => setGroupDeleteTx(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Excluir parcelamento</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              "{groupDeleteTx.description}" faz parte de um parcelamento. Deseja excluir só esta parcela ou todas as
              parcelas conectadas?
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setGroupDeleteTx(null)}>
                Cancelar
              </button>
              <button className="btn btn-ghost" onClick={handleDeleteJustThis}>
                Só esta parcela
              </button>
              <button className="btn btn-primary" onClick={handleDeleteWholeGroup}>
                Excluir todas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}