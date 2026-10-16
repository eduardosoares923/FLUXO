import React, { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useCollection } from '../../hooks/useCollection';
import { formatCurrency } from '../../utils/format';
import { Card, Transaction, Subscription } from '../../types';
import { ScrollArea } from './ScrollArea';

interface NoticeItem {
  id: string;
  title: string;
  detail: string;
  tone: 'spend' | 'pri';
}

const READ_STORAGE_KEY = 'wynd_read_notices_v1';

function loadReadNoticeIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadNoticeIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignora falha de localStorage
  }
}

function daysUntilDayOfMonth(targetDay: number, now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayStart = new Date(year, month, now.getDate()).getTime();

  let candidate = new Date(year, month, targetDay);
  if (candidate.getTime() < todayStart) {
    candidate = new Date(year, month + 1, targetDay);
  }
  return Math.round((candidate.getTime() - todayStart) / (1000 * 60 * 60 * 24));
}

export function NotificationsBell() {
  const { data: cards } = useCollection<Card>('cards');
  const { data: subscriptions } = useCollection<Subscription>('subscriptions');
  const { data: transactions } = useCollection<Transaction>('transactions');
  const { data: paidInvoices } = useCollection<any>('paidInvoices');
  const { data: goals } = useCollection<any>('goals');
  const { data: settingsData } = useCollection<any>('settings');

  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadNoticeIds());

  const notices = useMemo<NoticeItem[]>(() => {
    const list: NoticeItem[] = [];
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Fatura de cartão vencendo em até 3 dias
    for (const card of cards) {
      if (!card.dueDay) continue;
      const diff = daysUntilDayOfMonth(Number(card.dueDay), now);
      if (diff >= 0 && diff <= 3) {
        const isPaid = paidInvoices.some(
          (p: any) => String(p.cardId) === String(card.id) && p.month === currentYM
        );
        if (isPaid) continue;
        const invoiceTotal = transactions
          .filter(
            (t) =>
              t.paymentMethod === `card_${card.id}` &&
              (t.invoiceMonth ? t.invoiceMonth === currentYM : (t.date || '').startsWith(currentYM))
          )
          .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

        if (invoiceTotal > 0) {
          const whenLabel =
            diff === 0 ? 'vence hoje' : diff === 1 ? 'vence amanhã' : `vence em ${diff} dias`;
          list.push({
            id: `card_${card.id}_${currentYM}_${diff}`,
            title: `Fatura ${card.name} ${whenLabel}`,
            detail: `Valor atual de ${formatCurrency(invoiceTotal)}`,
            tone: 'spend',
          });
        }
      }
    }

    // 2. Fixa vencendo em até 3 dias
    for (const sub of subscriptions) {
      if (sub.active === false || !sub.day) continue;
      const diff = daysUntilDayOfMonth(Number(sub.day), now);
      if (diff >= 0 && diff <= 3) {
        const whenLabel =
          diff === 0 ? 'vence hoje' : diff === 1 ? 'vence amanhã' : `vence em ${diff} dias`;
        list.push({
          id: `sub_${sub.id}_${currentYM}_${diff}`,
          title: `${sub.name} ${whenLabel}`,
          detail: `${formatCurrency(Number(sub.amount) || 0)} em ${sub.category || 'Fixa'}`,
          tone: 'spend',
        });
      }
    }

    // 3. Meta que chegou em 50, 75 ou 100% (coleção goals e tetos de gastos em settings)
    for (const goal of goals) {
      const target = Number(goal.targetAmount ?? goal.target ?? 0);
      const current = Number(goal.currentAmount ?? goal.current ?? 0);
      if (target <= 0) continue;
      const pct = Math.round((current / target) * 100);
      const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : 0;
      if (milestone > 0) {
        list.push({
          id: `goal_${goal.id}_${milestone}`,
          title: `Meta ${goal.name || 'Financeira'} em ${milestone}%`,
          detail: `${formatCurrency(current)} de ${formatCurrency(target)}`,
          tone: 'pri',
        });
      }
    }

    const budgetsDoc = settingsData.find((d: any) => d.id === 'budgets');
    const budgetsMap: Record<string, number> = budgetsDoc?.limits || {};
    for (const [cat, limit] of Object.entries(budgetsMap)) {
      const maxVal = Number(limit) || 0;
      if (maxVal <= 0) continue;
      const spent = transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.category === cat &&
            (t.date || '').startsWith(currentYM)
        )
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const pct = Math.round((spent / maxVal) * 100);
      const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : 0;
      if (milestone > 0) {
        list.push({
          id: `budget_${cat}_${currentYM}_${milestone}`,
          title: `Meta de ${cat} atingiu ${milestone}%`,
          detail: `${formatCurrency(spent)} de ${formatCurrency(maxVal)} no mês`,
          tone: milestone >= 100 ? 'spend' : 'pri',
        });
      }
    }

    return list;
  }, [cards, subscriptions, transactions, paidInvoices, goals, settingsData]);

  const unreadNotices = useMemo(
    () => notices.filter((n) => !readIds.has(n.id)),
    [notices, readIds]
  );

  function markAllAsRead() {
    const next = new Set(readIds);
    for (const n of notices) next.add(n.id);
    setReadIds(next);
    saveReadNoticeIds(next);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Avisos"
          onContextMenu={(e) => e.preventDefault()}
          className="relative w-11 h-11 rounded-full border border-border bg-card text-ink flex items-center justify-center hover:bg-neutral transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadNotices.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2.5 w-2.5 h-2.5 rounded-full bg-spend ring-2 ring-card"
            />
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-[9999] w-[320px] sm:w-[340px] rounded-[24px] border border-border bg-card p-4 text-ink shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-border">
            <span className="font-display font-bold text-base text-ink">Avisos</span>
            {unreadNotices.length > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs font-bold text-pri hover:underline py-1 px-2 rounded-pill"
              >
                Marcar como lidos
              </button>
            )}
          </div>

          {notices.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">
              Nenhum aviso pendente no momento.
            </p>
          ) : (
            <ScrollArea maxHeight="280px">
              <div className="flex flex-col gap-2 pr-1">
                {notices.map((n) => {
                  const isUnread = !readIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      className={`p-3 rounded-[18px] border transition-colors ${
                        isUnread
                          ? 'bg-neutral/60 border-border'
                          : 'bg-card border-border/50 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-ink leading-snug">
                          {n.title}
                        </span>
                        {isUnread && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
                              n.tone === 'spend' ? 'bg-spend' : 'bg-pri'
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{n.detail}</p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default NotificationsBell;
