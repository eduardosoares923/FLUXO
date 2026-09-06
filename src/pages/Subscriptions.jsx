import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, getCardInvoiceMonth, toPersonKeys } from '../utils/format';
import { subscriptionSchema } from '../schemas/financialSchemas';
import { PageLoading, PageError, EmptyState } from '../components/StateFeedback';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../stores/useToastStore';

export default function Subscriptions() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  const { data: subs, loading, error, saveRecord, deleteRecord } = useCollection('subscriptions');
  const { data: transactions, saveRecord: saveTx, deleteRecord: deleteTx } = useCollection('transactions');
  const { data: accounts } = useCollection('accounts');
  const { data: cards } = useCollection('cards');
  const { data: personsList } = useCollection('persons');

  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');

  // Divisão entre pessoas (split)
  const [isSplit, setIsSplit] = useState(false);
  const [splitItems, setSplitItems] = useState({});

  const canEdit = hasPermission('subscriptions', 'edit');

  const availablePersons = useMemo(() => {
    const list = (personsList || []).map((p) => p.name?.trim()).filter(Boolean);
    return list.length > 0 ? list : ['Eduardo', 'Mãe', 'Rodrigo'];
  }, [personsList]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      name: '',
      amount: '',
      billingDay: 10,
      category: 'Assinaturas',
      paymentMethod: 'account',
      person: '',
    },
  });

  const watchedAmount = watch('amount');

  // Sincronização da assinatura com as transações do mês corrente
  async function syncSubscriptionWithTransaction(sub, isCancel = false) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = String(sub.billingDay || 10).padStart(2, '0');
    const txDate = `${currentYear}-${currentMonth}-${dayStr}`;

    const existingTx = transactions.find(
      (t) => t.subscriptionId === sub.id && t.date?.startsWith(`${currentYear}-${currentMonth}`)
    );

    if (isCancel || sub.status === 'pausada') {
      if (existingTx) {
        await deleteTx(existingTx.id);
      }
      return;
    }

    const txRecord = {
      id: existingTx?.id || undefined,
      subscriptionId: sub.id,
      description: `${sub.name} (Assinatura)`,
      amount: Number(sub.amount),
      type: 'expense',
      category: sub.category || 'Assinaturas',
      date: txDate,
      paymentMethod: sub.paymentMethod,
      person: sub.person || session.person,
      userId: session.id,
      isSubscription: true,
    };

    if (sub.paymentMethod.startsWith('card_')) {
      const cardId = sub.paymentMethod.replace('card_', '');
      const card = cards.find((c) => String(c.id) === cardId);
      if (card) txRecord.invoiceMonth = getCardInvoiceMonth(txDate, card.closeDay);
    }

    await saveTx(txRecord);
  }

  // Filtragem e Permissões
  const visible = useMemo(() => {
    return subs
      .filter((s) => session.role === 'admin' || canAccessPerson(s.person))
      .filter((s) => {
        const matchSearch =
          !search ||
          s.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.category?.toLowerCase().includes(search.toLowerCase());

        const matchPayment = paymentFilter === 'all' || s.paymentMethod === paymentFilter;

        const matchPerson =
          personFilter === 'all' ||
          (s.isSplit && s.splitDetails?.some((d) => d.person === personFilter)) ||
          s.person?.toLowerCase().includes(personFilter.toLowerCase());

        return matchSearch && matchPayment && matchPerson;
      });
  }, [subs, session, canAccessPerson, search, paymentFilter, personFilter]);

  // Métricas
  const { totalMonthly, activeCount, pausedCount, nextDue } = useMemo(() => {
    let sum = 0;
    let active = 0;
    let paused = 0;
    const todayDay = new Date().getDate();
    let minDaysDiff = Infinity;
    let nextSub = null;

    visible.forEach((s) => {
      const amt = Number(s.amount) || 0;
      if (s.status !== 'pausada') {
        sum += amt;
        active++;
        const bDay = Number(s.billingDay) || 10;
        let diff = bDay - todayDay;
        if (diff < 0) diff += 30;
        if (diff < minDaysDiff) {
          minDaysDiff = diff;
          nextSub = s;
        }
      } else {
        paused++;
      }
    });

    return {
      totalMonthly: sum,
      activeCount: active,
      pausedCount: paused,
      nextDue: nextSub ? `Dia ${nextSub.billingDay} (${nextSub.name})` : 'Nenhuma',
    };
  }, [visible]);

  function openNew() {
    reset({
      name: '',
      amount: '',
      billingDay: 10,
      category: 'Assinaturas',
      paymentMethod: 'account',
      person: session.person || '',
    });
    setIsSplit(false);
    setSplitItems({});
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(s) {
    reset({
      name: s.name || '',
      amount: s.amount ?? '',
      billingDay: s.billingDay ?? 10,
      category: s.category || 'Assinaturas',
      paymentMethod: s.paymentMethod || 'account',
      person: s.person || session.person || '',
    });

    setIsSplit(Boolean(s.isSplit));
    if (s.isSplit && Array.isArray(s.splitDetails)) {
      const map = {};
      s.splitDetails.forEach((d) => {
        map[d.person] = d.amount;
      });
      setSplitItems(map);
    } else {
      setSplitItems({});
    }

    setEditingId(s.id);
    setShowForm(true);
  }

  function handleSplitCheck(personName, checked) {
    setSplitItems((prev) => {
      const copy = { ...prev };
      if (checked) {
        copy[personName] = copy[personName] || '';
      } else {
        delete copy[personName];
      }
      return copy;
    });
  }

  function handleSplitValueChange(personName, val) {
    setSplitItems((prev) => ({
      ...prev,
      [personName]: val,
    }));
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
        if (Math.abs(sum - totalAmt) > 0.05) {
          toast.error(
            `A soma das cotas (${formatCurrency(sum)}) deve ser igual ao valor total (${formatCurrency(totalAmt)}).`
          );
          return;
        }

        finalPerson = details.map((d) => d.person).join(', ');
        finalSplitDetails = details;
      }

      const existing = editingId ? subs.find((s) => s.id === editingId) : null;
      const status = existing ? existing.status || 'ativa' : 'ativa';

      const record = {
        id: editingId || undefined,
        name: data.name.trim(),
        amount: Number(data.amount),
        billingDay: Number(data.billingDay),
        category: data.category?.trim() || 'Assinaturas',
        paymentMethod: data.paymentMethod,
        person: finalPerson,
        personKeys: toPersonKeys(finalPerson),
        status,
        isSplit,
        splitDetails: finalSplitDetails,
        updatedAt: new Date().toISOString(),
      };

      const saved = await saveRecord(record);
      await syncSubscriptionWithTransaction(saved);

      toast.success(editingId ? 'Assinatura atualizada!' : 'Assinatura cadastrada!');
      setShowForm(false);
    } catch (err) {
      toast.error('Erro ao salvar assinatura.');
    }
  }

  async function handleTogglePause(s) {
    const nextStatus = s.status === 'pausada' ? 'ativa' : 'pausada';
    try {
      const updated = { ...s, status: nextStatus };
      await saveRecord(updated);
      await syncSubscriptionWithTransaction(updated);
      toast.info(nextStatus === 'ativa' ? 'Assinatura reativada!' : 'Assinatura pausada.');
    } catch (err) {
      toast.error('Erro ao alterar status.');
    }
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;
    try {
      const subToDelete = subs.find((s) => s.id === deleteId);
      if (subToDelete) {
        await syncSubscriptionWithTransaction(subToDelete, true);
      }
      await deleteRecord(deleteId);
      toast.success('Assinatura excluída com sucesso!');
    } catch (err) {
      toast.error('Erro ao excluir assinatura.');
    } finally {
      setDeleteId(null);
    }
  }

  function getPaymentLabel(pm) {
    if (pm === 'account') return 'Conta principal';
    if (pm.startsWith('acc_')) {
      const a = accounts.find((acc) => `acc_${acc.id}` === pm);
      return a ? `Conta: ${a.name}` : 'Conta';
    }
    if (pm.startsWith('card_')) {
      const c = cards.find((card) => `card_${card.id}` === pm);
      return c ? `Cartão: ${c.name}` : 'Cartão';
    }
    return pm;
  }

  if (loading) return <PageLoading message="Carregando assinaturas..." />;
  if (error) return <PageError error={error} title="Erro ao carregar assinaturas" />;

  return (
    <div className="subscriptions-page">
      <div className="page-header">
        <h2>Assinaturas e Recorrências</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Nova assinatura
          </button>
        )}
      </div>

      {/* KPIs de Assinaturas */}
      <div className="summary-row">
        <div className="kpi-card balance">
          <span>Gasto Mensal Recorrente</span>
          <strong>{formatCurrency(totalMonthly)}</strong>
        </div>
        <div className="kpi-card income">
          <span>Assinaturas Ativas</span>
          <strong>{activeCount}</strong>
          {pausedCount > 0 && (
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({pausedCount} pausadas)</small>
          )}
        </div>
        <div className="kpi-card expense">
          <span>Próxima Cobrança</span>
          <strong style={{ fontSize: '1.2rem' }}>{nextDue}</strong>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          margin: '1.5rem 0',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <i
            className="fa-solid fa-magnifying-glass"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
            }}
          />
          <input
            type="text"
            placeholder="Buscar por serviço ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '180px' }}
        >
          <option value="all">Todas as Formas de Pagamento</option>
          <optgroup label="Contas">
            {accounts.map((a) => (
              <option key={a.id} value={`acc_${a.id}`}>
                Conta: {a.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Cartões">
            {cards.map((c) => (
              <option key={c.id} value={`card_${c.id}`}>
                Cartão: {c.name}
              </option>
            ))}
          </optgroup>
        </select>

        <select
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}
        >
          <option value="all">Todas as Pessoas</option>
          {availablePersons.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Grid de Assinaturas */}
      {visible.length === 0 ? (
        <EmptyState
          icon="fa-rotate"
          title="Nenhuma assinatura encontrada"
          description="Cadastre serviços mensais como Netflix, Spotify, planos de saúde ou condomínio."
          actionLabel={canEdit ? 'Nova assinatura' : undefined}
          onAction={canEdit ? openNew : undefined}
        />
      ) : (
        <div className="accounts-grid">
          {visible.map((s) => {
            const isPaused = s.status === 'pausada';
            return (
              <div
                className="account-card"
                key={s.id}
                style={{
                  opacity: isPaused ? 0.7 : 1,
                  borderLeft: isPaused ? '4px solid var(--warning, #eab308)' : '4px solid var(--success, #10b981)',
                }}
              >
                <div className="account-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="icon-badge subscription-icon">
                      <i className="fa-solid fa-repeat" />
                    </span>
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{s.name}</strong>
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: isPaused ? 'rgba(224, 182, 76, 0.15)' : 'rgba(95, 208, 143, 0.15)',
                          color: isPaused ? 'var(--warning)' : 'var(--success)',
                          fontWeight: 600,
                        }}
                      >
                        {isPaused ? 'Pausada' : 'Ativa'}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="card-actions">
                      <button
                        onClick={() => handleTogglePause(s)}
                        title={isPaused ? 'Reativar assinatura' : 'Pausar cobrança'}
                      >
                        <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`} />
                      </button>
                      <button onClick={() => openEdit(s)} title="Editar">
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button onClick={() => setDeleteId(s.id)} title="Excluir">
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  )}
                </div>

                <span className="account-balance" style={{ fontSize: '1.4rem' }}>
                  {formatCurrency(s.amount)}{' '}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ mês</span>
                </span>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-regular fa-calendar" style={{ width: '16px', color: 'var(--text-secondary)' }} />
                    Cobra todo dia {s.billingDay}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-credit-card" style={{ width: '16px', color: 'var(--text-secondary)' }} />
                    {getPaymentLabel(s.paymentMethod)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-user" style={{ width: '16px', color: 'var(--text-secondary)' }} />
                    {s.person || 'Eu'}
                  </span>
                </div>

                {s.isSplit && s.splitDetails && (
                  <div
                    style={{
                      marginTop: '10px',
                      paddingTop: '8px',
                      borderTop: '1px dashed var(--glass-border)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}
                  >
                    {s.splitDetails.map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.75rem',
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--glass-border)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {item.person}: {formatCurrency(item.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação/Edição */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit(onSubmit)}
            style={{ maxWidth: '520px' }}
          >
            <h3>{editingId ? 'Editar Assinatura' : 'Nova Assinatura'}</h3>

            <label>Nome do Serviço</label>
            <input {...register('name')} placeholder="Ex: Netflix, Spotify, Amazon Prime, Academia..." />
            {errors.name && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.name.message}</span>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label>Valor Mensal</label>
                <input type="number" step="0.01" {...register('amount')} placeholder="0.00" />
                {errors.amount && (
                  <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.amount.message}</span>
                )}
              </div>

              <div>
                <label>Dia de Cobrança</label>
                <input type="number" min="1" max="31" {...register('billingDay')} />
                {errors.billingDay && (
                  <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.billingDay.message}</span>
                )}
              </div>
            </div>

            <label>Forma de Pagamento</label>
            <select {...register('paymentMethod')}>
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
            {errors.paymentMethod && (
              <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{errors.paymentMethod.message}</span>
            )}

            <label>Categoria</label>
            <input {...register('category')} placeholder="Assinaturas" />

            {/* Divisão entre pessoas */}
            <div style={{ margin: '1rem 0', padding: '12px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', border: '1px solid #334155' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={isSplit}
                  onChange={(e) => setIsSplit(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                Dividir custo com outras pessoas (Rateio)
              </label>

              {isSplit ? (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Selecione quem divide:</span>
                    <button
                      type="button"
                      onClick={splitEqually}
                      style={{
                        background: '#334155',
                        border: 'none',
                        color: '#f8fafc',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      <i className="fa-solid fa-calculator" style={{ marginRight: '4px' }} /> Dividir igualmente
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {availablePersons.map((pName) => {
                      const isChecked = Object.prototype.hasOwnProperty.call(splitItems, pName);
                      return (
                        <div
                          key={pName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(15, 23, 42, 0.4)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleSplitCheck(pName, e.target.checked)}
                            />
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
                <div style={{ marginTop: '10px' }}>
                  <label>Pessoa Titular</label>
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

      <ConfirmModal
        isOpen={!!deleteId}
        title="Excluir Assinatura"
        message="Tem certeza que deseja excluir esta assinatura? Os lançamentos vinculados a ela serão removidos."
        confirmLabel="Excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
