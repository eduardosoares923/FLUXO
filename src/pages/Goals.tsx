import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../stores/useUIStore';
import {
  formatCurrency,
  maskCurrency,
  generateId,
  toPersonKeys,
} from '../utils/format';
import { toast } from '../stores/useToastStore';
import { Goal, GoalDeposit, Account, Transaction } from '../types';
import { MoneyField } from '../components/ui/MoneyField';
import { Select } from '../components/ui/Select';
import { MonthPicker } from '../components/ui/MonthPicker';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const MONTH_NAMES_FULL = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MONTH_NAMES_SHORT = [
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

const GOAL_ICONS: { id: string; label: string; path: React.ReactNode }[] = [
  {
    id: 'target',
    label: 'Alvo',
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  {
    id: 'wallet',
    label: 'Reserva',
    path: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="3" />
        <path d="M3 10h18M16 15h2" />
      </>
    ),
  },
  {
    id: 'car',
    label: 'Veículo',
    path: (
      <>
        <path d="M5 16l1.5-5a2 2 0 0 1 1.9-1.4h7.2a2 2 0 0 1 1.9 1.4L19 16" />
        <rect x="3" y="16" width="18" height="4" rx="1.5" />
      </>
    ),
  },
  {
    id: 'home',
    label: 'Casa',
    path: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  },
  {
    id: 'trend',
    label: 'Investimento',
    path: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  },
  {
    id: 'star',
    label: 'Viagem / Sonho',
    path: (
      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" />
    ),
  },
];

function computeGoalSaved(g: Goal): number {
  const init = Number(g.initial) || 0;
  const deps = Array.isArray(g.deposits)
    ? g.deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    : 0;
  return Number((init + deps).toFixed(2));
}

function formatDeadlineShort(ym?: string): string {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return 'Sem prazo';
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  const mName = MONTH_NAMES_SHORT[Math.max(0, Math.min(11, (m || 1) - 1))];
  return `até ${mName} ${y}`;
}

function formatDoneAtShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function computeMonthsRemaining(ym?: string): number {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return 12;
  const [dy, dm] = ym.slice(0, 7).split('-').map(Number);
  const now = new Date();
  const diff = (dy - now.getFullYear()) * 12 + (dm - (now.getMonth() + 1)) + 1;
  return Math.max(1, diff);
}

export function Goals() {
  const { data: goals, add, update, remove } = useCollection<Goal>('goals');
  const { data: accounts, update: updateAccount } = useCollection<Account>('accounts');
  const { add: addTx } = useCollection<Transaction>('transactions');
  const { session, canAccessAccount } = useAuth();
  const { privacyMode, selectedPeriod } = useUIStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  // Deposit modal state
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositFromAccountId, setDepositFromAccountId] = useState<string>('');
  const [savingDeposit, setSavingDeposit] = useState(false);

  // Goal form state
  const [name, setName] = useState('');
  const [target, setTarget] = useState<number>(0);
  const [initial, setInitial] = useState<number>(0);
  const [deadline, setDeadline] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [accountId, setAccountId] = useState<string>('');
  const [icon, setIcon] = useState<string>('target');

  const visibleAccounts = useMemo(
    () => (accounts || []).filter((a) => canAccessAccount(a)),
    [accounts, canAccessAccount]
  );

  const currentMonthName = useMemo(() => {
    if (selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)) {
      const m = parseInt(selectedPeriod.split('-')[1], 10) - 1;
      return MONTH_NAMES_FULL[Math.max(0, Math.min(11, m))];
    }
    return MONTH_NAMES_FULL[new Date().getMonth()];
  }, [selectedPeriod]);

  const { activeGoals, completedGoals, stats } = useMemo(() => {
    const all = goals || [];
    const active: Goal[] = [];
    const completed: Goal[] = [];

    let totalSaved = 0;
    let totalRemaining = 0;
    let monthlySuggestion = 0;

    all.forEach((g) => {
      const saved = computeGoalSaved(g);
      const tgt = Number(g.target) || 0;
      const isDone = Boolean(g.done) || (tgt > 0 && saved + 0.004 >= tgt);

      if (isDone) {
        completed.push(g);
      } else {
        active.push(g);
        const rem = Math.max(0, tgt - saved);
        totalSaved += saved;
        totalRemaining += rem;
        const months = computeMonthsRemaining(g.deadline);
        monthlySuggestion += rem / months;
      }
    });

    return {
      activeGoals: active,
      completedGoals: completed,
      stats: {
        totalSaved,
        totalRemaining,
        monthlySuggestion,
        activeCount: active.length,
      },
    };
  }, [goals]);

  const openNewGoalModal = () => {
    setEditingGoal(null);
    setName('');
    setTarget(0);
    setInitial(0);
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    setDeadline(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setAccountId(visibleAccounts[0]?.id || '');
    setIcon('target');
    setIsFormOpen(true);
  };

  const openEditGoalModal = (g: Goal) => {
    setEditingGoal(g);
    setName(g.name || '');
    setTarget(Number(g.target) || 0);
    setInitial(Number(g.initial) || 0);
    setDeadline(g.deadline || new Date().toISOString().slice(0, 7));
    setAccountId(g.accountId || '');
    setIcon(g.icon || 'target');
    setIsFormOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || target <= 0) {
      toast.warning('Informe o nome da meta e o valor desejado.');
      return;
    }

    try {
      if (editingGoal?.id) {
        await update(editingGoal.id, {
          name: name.trim(),
          target: Number(target),
          initial: Number(initial) || 0,
          deadline,
          accountId,
          icon,
        });
        toast.success('Meta atualizada.');
      } else {
        await add({
          name: name.trim(),
          target: Number(target),
          initial: Number(initial) || 0,
          deadline,
          accountId,
          icon,
          done: false,
          doneAt: '',
          owner: session?.person || session?.name || 'Geral',
          deposits: [],
          createdAt: new Date().toISOString(),
        });
        toast.success('Nova meta criada.');
      }
      setIsFormOpen(false);
    } catch {
      toast.error('Erro ao salvar meta.');
    }
  };

  const openDepositDialog = (g: Goal) => {
    setDepositGoal(g);
    const rem = Math.max(0, (Number(g.target) || 0) - computeGoalSaved(g));
    const months = computeMonthsRemaining(g.deadline);
    const suggested = rem > 0 ? Number((rem / months).toFixed(2)) : 100;
    setDepositAmount(suggested);
    setDepositFromAccountId('');
  };

  const handleConfirmDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositGoal?.id || depositAmount <= 0) {
      toast.warning('Informe um valor maior que zero para guardar.');
      return;
    }

    setSavingDeposit(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let transferId = '';

      if (
        depositFromAccountId &&
        depositGoal.accountId &&
        depositFromAccountId !== depositGoal.accountId
      ) {
        transferId = `transfer_${generateId()}`;
        const personField = session?.person || session?.name || 'Geral';
        const pKeys = toPersonKeys(personField);

        await addTx({
          description: `Meta: ${depositGoal.name}`,
          amount: Number(depositAmount),
          type: 'transfer_out',
          category: 'Transferência',
          date: today,
          paymentMethod: `acc_${depositFromAccountId}`,
          transferAccountId: depositGoal.accountId,
          person: personField,
          personKeys: pKeys,
          userId: session?.id,
          transferId,
          createdAt: new Date().toISOString(),
        });

        await addTx({
          description: `Meta: ${depositGoal.name}`,
          amount: Number(depositAmount),
          type: 'transfer_in',
          category: 'Transferência',
          date: today,
          paymentMethod: `acc_${depositGoal.accountId}`,
          transferAccountId: depositFromAccountId,
          person: personField,
          personKeys: pKeys,
          userId: session?.id,
          transferId,
          createdAt: new Date().toISOString(),
        });

        const sourceAcc = (accounts || []).find((a) => a.id === depositFromAccountId);
        if (sourceAcc?.id) {
          const bal =
            sourceAcc.computedBalance !== undefined
              ? Number(sourceAcc.computedBalance)
              : Number(sourceAcc.balance || 0);
          await updateAccount(sourceAcc.id, {
            computedBalance: Number((bal - Number(depositAmount)).toFixed(2)),
          });
        }

        const destAcc = (accounts || []).find((a) => a.id === depositGoal.accountId);
        if (destAcc?.id) {
          const bal =
            destAcc.computedBalance !== undefined
              ? Number(destAcc.computedBalance)
              : Number(destAcc.balance || 0);
          await updateAccount(destAcc.id, {
            computedBalance: Number((bal + Number(depositAmount)).toFixed(2)),
          });
        }
      }

      const newDeposit: GoalDeposit = {
        id: generateId(),
        amount: Number(depositAmount),
        date: today,
        fromAccountId: depositFromAccountId,
        transferId,
      };

      const nextDeposits = [...(depositGoal.deposits || []), newDeposit];
      const newSaved =
        (Number(depositGoal.initial) || 0) +
        nextDeposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const reached =
        Number(depositGoal.target) > 0 &&
        newSaved + 0.004 >= Number(depositGoal.target);

      await update(depositGoal.id, {
        deposits: nextDeposits,
        done: reached ? true : depositGoal.done,
        doneAt: reached && !depositGoal.doneAt ? new Date().toISOString() : depositGoal.doneAt || '',
      });

      toast.success(
        reached
          ? `Parabéns! Você atingiu a meta "${depositGoal.name}"!`
          : `${formatCurrency(depositAmount)} guardado em "${depositGoal.name}".`
      );
      setDepositGoal(null);
    } catch {
      toast.error('Não foi possível registrar o valor na meta.');
    } finally {
      setSavingDeposit(false);
    }
  };

  const handleMarkCompleted = async (g: Goal) => {
    if (!g.id) return;
    try {
      await update(g.id, {
        done: true,
        doneAt: new Date().toISOString(),
      });
      toast.success(`Meta "${g.name}" marcada como concluída.`);
    } catch {
      toast.error('Erro ao concluir meta.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await remove(deleteTarget.id);
      toast.success('Meta excluída.');
    } catch {
      toast.error('Erro ao excluir meta.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top bar */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={openNewGoalModal}
          className="px-4 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm flex items-center gap-2 shadow-sm hover:opacity-95 transition-opacity"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Nova meta</span>
        </button>
      </div>

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">
            Guardado nas metas
          </div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-pri tracking-tight">
            {maskCurrency(stats.totalSaved, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-muted mt-1">
            {stats.activeCount}{' '}
            {stats.activeCount === 1 ? 'meta ativa' : 'metas ativas'}
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">
            Falta guardar
          </div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-ink tracking-tight">
            {maskCurrency(stats.totalRemaining, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-muted mt-1">
            para fechar todas
          </div>
        </div>

        <div className="rounded-[24px] bg-card border border-border p-5 shadow-xs">
          <div className="text-xs font-semibold text-muted mb-1.5">
            Sugestão para {currentMonthName}
          </div>
          <div className="font-display text-2xl md:text-[28px] font-bold text-ink tracking-tight">
            {maskCurrency(stats.monthlySuggestion, privacyMode)}
          </div>
          <div className="text-xs font-semibold text-pri mt-1">
            baseado nos prazos
          </div>
        </div>
      </div>

      {/* Active Goals Grid */}
      {activeGoals.length === 0 ? (
        <div className="rounded-[24px] bg-card border border-border p-10 text-center space-y-2">
          <div className="font-display text-base font-bold text-ink">
            Nenhuma meta ativa no momento
          </div>
          <p className="text-xs text-muted max-w-md mx-auto">
            Crie metas como Reserva de emergência, Viagem ou Trocar de celular para acompanhar quanto falta guardar a cada mês.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {activeGoals.map((g) => {
            const saved = computeGoalSaved(g);
            const tgt = Math.max(1, Number(g.target) || 1);
            const pct = Math.min(100, Math.max(0, Math.floor((saved / tgt) * 100)));
            const radius = 22;
            const circ = 2 * Math.PI * radius;
            const offset = circ - (pct / 100) * circ;

            return (
              <div
                key={g.id}
                className="rounded-[24px] bg-card border border-border p-5 shadow-xs flex flex-col justify-between gap-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle
                          cx="28"
                          cy="28"
                          r={radius}
                          fill="none"
                          stroke="var(--track)"
                          strokeWidth="5"
                        />
                        <circle
                          cx="28"
                          cy="28"
                          r={radius}
                          fill="none"
                          stroke="var(--pri)"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={circ}
                          strokeDashoffset={offset}
                        />
                      </svg>
                      <span className="absolute font-display text-xs font-bold text-ink">
                        {pct}%
                      </span>
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-ink truncate">
                        {g.name}
                      </h3>
                      <div className="text-xs text-muted mt-0.5">
                        {formatDeadlineShort(g.deadline)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Editar ${g.name}`}
                      onClick={() => openEditGoalModal(g)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Concluir ${g.name}`}
                      onClick={() => handleMarkCompleted(g)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-pri hover:bg-priSoft transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${g.name}`}
                      onClick={() => setDeleteTarget(g)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-spend hover:bg-spendSoft transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-2xl font-bold text-ink tracking-tight">
                    {maskCurrency(saved, privacyMode)}
                  </span>
                  <span className="text-xs font-semibold text-muted">
                    de {maskCurrency(g.target, privacyMode)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openDepositDialog(g)}
                  className="w-full min-h-[44px] rounded-[16px] bg-priSoft text-priInk font-bold text-xs md:text-sm hover:opacity-90 transition-opacity"
                >
                  Guardar valor
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Concluídas Section */}
      {completedGoals.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="font-display text-base font-bold text-ink">Concluídas</h2>
          <div className="space-y-2.5">
            {completedGoals.map((g) => {
              const doneDateLabel = formatDoneAtShort(g.doneAt);
              return (
                <div
                  key={g.id}
                  className="rounded-[22px] bg-card border border-border p-4 md:p-5 flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-priSoft text-priInk flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-ink truncate">
                        {g.name}
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">
                        Meta de {maskCurrency(g.target, privacyMode)} atingida
                        {doneDateLabel ? ` em ${doneDateLabel}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded-pill bg-priSoft text-priInk text-xs font-bold">
                      Concluída
                    </span>
                    <button
                      type="button"
                      aria-label={`Excluir ${g.name}`}
                      onClick={() => setDeleteTarget(g)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-spend hover:bg-spendSoft transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Nova / Editar Meta */}
      <Dialog.Root open={isFormOpen} onOpenChange={setIsFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[460px] max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                {editingGoal ? 'Editar meta' : 'Nova meta'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Formulário para criar ou editar uma meta de economia.
            </Dialog.Description>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Nome da meta
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Reserva de emergência, Viagem"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Valor da meta
                  </label>
                  <MoneyField
                    value={target}
                    onValueChange={setTarget}
                    ariaLabel="Valor da meta"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Valor já guardado
                  </label>
                  <MoneyField
                    value={initial}
                    onValueChange={setInitial}
                    ariaLabel="Valor já guardado"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Prazo desejado
                  </label>
                  <MonthPicker
                    value={deadline}
                    onChange={setDeadline}
                    className="w-full justify-between"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Conta onde fica guardado
                  </label>
                  <Select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    ariaLabel="Conta onde o dinheiro fica guardado"
                  >
                    <option value="">Nenhuma conta</option>
                    {visibleAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">
                  Ícone
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {GOAL_ICONS.map((ic) => (
                    <button
                      key={ic.id}
                      type="button"
                      aria-label={ic.label}
                      onClick={() => setIcon(ic.id)}
                      className={`h-11 rounded-[14px] flex items-center justify-center border transition-colors ${
                        icon === ic.id
                          ? 'bg-priSoft text-priInk border-pri'
                          : 'bg-neutral text-muted border-transparent hover:text-ink'
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        {ic.path}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Guardar Valor */}
      <Dialog.Root
        open={Boolean(depositGoal)}
        onOpenChange={(open) => {
          if (!open) setDepositGoal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none">
            <Dialog.Title className="font-display text-lg font-bold text-ink mb-1">
              Guardar em {depositGoal?.name}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-muted mb-4">
              Informe o valor que você está reservando para esta meta.
            </Dialog.Description>

            <form onSubmit={handleConfirmDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Valor a guardar
                </label>
                <MoneyField
                  value={depositAmount}
                  onValueChange={setDepositAmount}
                  ariaLabel="Valor a guardar"
                />
              </div>

              {visibleAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Sair de qual conta? (opcional)
                  </label>
                  <Select
                    value={depositFromAccountId}
                    onChange={(e) => setDepositFromAccountId(e.target.value)}
                    ariaLabel="Conta de origem"
                  >
                    <option value="">Apenas anotar na meta</option>
                    {visibleAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositGoal(null)}
                  className="px-4 min-h-[44px] rounded-[18px] bg-neutral text-ink font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDeposit}
                  className="px-5 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm disabled:opacity-50"
                >
                  {savingDeposit ? 'Salvando...' : 'Guardar valor'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={'Excluir meta'}
        message={
          deleteTarget
            ? `Deseja excluir a meta "${deleteTarget.name}"?`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default Goals;
