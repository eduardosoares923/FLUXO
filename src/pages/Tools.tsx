import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../stores/useUIStore';
import {
  formatCurrency,
  maskCurrency,
  parseTxDate,
  normalize,
} from '../utils/format';
import { toast } from '../stores/useToastStore';
import { TagItem, Transaction } from '../types';
import { db } from '../firebase';
import {
  doc,
  writeBatch,
  deleteDoc,
  arrayRemove,
} from 'firebase/firestore';
import { MoneyField } from '../components/ui/MoneyField';
import { NumberField } from '../components/ui/NumberField';
import { Select } from '../components/ui/Select';
import { DatePicker } from '../components/ui/DatePicker';
import { Switch } from '../components/ui/Switch';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  useTripState,
  TRIP_CURRENCIES,
  fetchExchangeRateToBRL,
  formatTripRate,
  getTripCurrencySymbol,
} from '../utils/travelMode';

const TAG_COLORS = [
  '#236B52',
  '#C65347',
  '#D9822B',
  '#1E6FB8',
  '#8E0FC7',
  '#00838F',
];

function impliedMonthlyRate(cash: number, inst: number, n: number): number {
  if (inst * n <= cash || cash <= 0 || n <= 0) return 0;
  let lo = 0.0;
  let hi = 1.0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const pv = (inst * (1 - Math.pow(1 + mid, -n))) / mid;
    if (pv > cash) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export function Tools() {
  const { data: tagsDocs, add: addTag, update: updateTag } =
    useCollection<TagItem>('tags');
  const { data: transactions } = useCollection<Transaction>('transactions');
  const { canAccessTransaction } = useAuth();
  const { privacyMode, selectedPeriod } = useUIStore();
  const { trip, updateTrip } = useTripState();

  const [activeTab, setActiveTab] = useState<'tags' | 'calculadoras' | 'viagem'>(
    'tags'
  );

  // --- TAGS STATE ---
  const [selectedTagName, setSelectedTagName] = useState<string>('');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<{
    id?: string;
    name: string;
    color: string;
  } | null>(null);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState(TAG_COLORS[0]);
  const [tagToDelete, setTagToDelete] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [deletingTag, setDeletingTag] = useState(false);

  // --- CALCULATORS STATE ---
  // 1. Juros compostos
  const [ciInitial, setCiInitial] = useState<number>(5000);
  const [ciMonthly, setCiMonthly] = useState<number>(500);
  const [ciRateStr, setCiRateStr] = useState<string>('0,9');
  const [ciMonths, setCiMonths] = useState<number>(24);

  // 2. À vista ou parcelado
  const [cvCash, setCvCash] = useState<number>(2700);
  const [cvCount, setCvCount] = useState<number>(10);
  const [cvInstallment, setCvInstallment] = useState<number>(300);

  // 3. Meta de economia
  const [sgGoal, setSgGoal] = useState<number>(10000);
  const [sgMonths, setSgMonths] = useState<number>(12);

  // --- TRAVEL MODE FETCH STATE ---
  const [fetchingRate, setFetchingRate] = useState(false);
  const [rateInputStr, setRateInputStr] = useState<string>(() =>
    trip.rate.toLocaleString('pt-BR', {
      minimumFractionDigits: trip.rate < 0.1 ? 4 : 2,
      maximumFractionDigits: trip.rate < 0.1 ? 4 : 2,
    })
  );

  useEffect(() => {
    setRateInputStr(
      trip.rate.toLocaleString('pt-BR', {
        minimumFractionDigits: trip.rate < 0.1 ? 4 : 2,
        maximumFractionDigits: trip.rate < 0.1 ? 4 : 2,
      })
    );
  }, [trip.rate]);

  const visibleTxs = useMemo(
    () => (transactions || []).filter((t) => canAccessTransaction(t)),
    [transactions, canAccessTransaction]
  );

  // Merge tags from Firestore + tags present on transactions
  const mergedTags = useMemo(() => {
    const map = new Map<
      string,
      {
        id?: string;
        name: string;
        color: string;
        txs: Transaction[];
        total: number;
      }
    >();

    (tagsDocs || []).forEach((docItem, idx) => {
      if (!docItem.name) return;
      const key = normalize(docItem.name);
      map.set(key, {
        id: docItem.id,
        name: docItem.name,
        color: docItem.color || TAG_COLORS[idx % TAG_COLORS.length],
        txs: [],
        total: 0,
      });
    });

    visibleTxs.forEach((tx) => {
      if (!Array.isArray(tx.tags)) return;
      tx.tags.forEach((tName) => {
        const clean = String(tName || '').trim();
        if (!clean) return;
        const key = normalize(clean);
        if (!map.has(key)) {
          map.set(key, {
            name: clean,
            color: TAG_COLORS[map.size % TAG_COLORS.length],
            txs: [],
            total: 0,
          });
        }
        const entry = map.get(key)!;
        entry.txs.push(tx);
        entry.total += Number(tx.amount) || 0;
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );
  }, [tagsDocs, visibleTxs]);

  useEffect(() => {
    if (mergedTags.length > 0) {
      const exists = mergedTags.some(
        (t) => normalize(t.name) === normalize(selectedTagName)
      );
      if (!selectedTagName || !exists) {
        setSelectedTagName(mergedTags[0].name);
      }
    } else {
      setSelectedTagName('');
    }
  }, [mergedTags, selectedTagName]);

  const activeTagDetail = useMemo(
    () =>
      mergedTags.find(
        (t) => normalize(t.name) === normalize(selectedTagName)
      ) || null,
    [mergedTags, selectedTagName]
  );

  const openNewTagModal = () => {
    setEditingTag(null);
    setTagNameInput('');
    setTagColorInput(TAG_COLORS[mergedTags.length % TAG_COLORS.length]);
    setIsTagModalOpen(true);
  };

  const openEditTagModal = (tag: { id?: string; name: string; color: string }) => {
    setEditingTag(tag);
    setTagNameInput(tag.name);
    setTagColorInput(tag.color);
    setIsTagModalOpen(true);
  };

  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tagNameInput.trim();
    if (!clean) {
      toast.warning('Informe o nome da tag.');
      return;
    }

    try {
      if (editingTag) {
        const oldName = editingTag.name;
        if (editingTag.id) {
          await updateTag(editingTag.id, {
            name: clean,
            color: tagColorInput,
          });
        } else {
          await addTag({
            name: clean,
            color: tagColorInput,
            createdAt: new Date().toISOString(),
          });
        }

        // If renamed, update matching transactions in batches of 400
        if (normalize(oldName) !== normalize(clean)) {
          const matching = visibleTxs.filter(
            (tx) =>
              tx.id &&
              Array.isArray(tx.tags) &&
              tx.tags.some((t) => normalize(t) === normalize(oldName))
          );

          for (let i = 0; i < matching.length; i += 400) {
            const chunk = matching.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((tx) => {
              const updatedTags = (tx.tags || []).map((t) =>
                normalize(t) === normalize(oldName) ? clean : t
              );
              batch.update(doc(db, 'transactions', tx.id!), {
                tags: Array.from(new Set(updatedTags)),
              });
            });
            await batch.commit();
          }
        }

        setSelectedTagName(clean);
        toast.success('Tag atualizada.');
      } else {
        if (mergedTags.some((t) => normalize(t.name) === normalize(clean))) {
          toast.warning('Essa tag já existe.');
          return;
        }
        await addTag({
          name: clean,
          color: tagColorInput,
          createdAt: new Date().toISOString(),
        });
        setSelectedTagName(clean);
        toast.success(`Tag "${clean}" criada.`);
      }
      setIsTagModalOpen(false);
    } catch {
      toast.error('Erro ao salvar tag.');
    }
  };

  const handleConfirmDeleteTag = async () => {
    if (!tagToDelete || deletingTag) return;
    setDeletingTag(true);
    try {
      const targetNorm = normalize(tagToDelete.name);
      const matchingTxs = visibleTxs.filter(
        (tx) =>
          tx.id &&
          Array.isArray(tx.tags) &&
          tx.tags.some((t) => normalize(t) === targetNorm)
      );

      // Remove tag from transactions in batches of 400 using writeBatch + arrayRemove
      for (let i = 0; i < matchingTxs.length; i += 400) {
        const chunk = matchingTxs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((tx) => {
          const realStrings = (tx.tags || []).filter(
            (t) => normalize(t) === targetNorm
          );
          if (realStrings.length > 0 && tx.id) {
            batch.update(doc(db, 'transactions', tx.id), {
              tags: arrayRemove(...realStrings),
            });
          }
        });
        await batch.commit();
      }

      if (tagToDelete.id) {
        await deleteDoc(doc(db, 'tags', tagToDelete.id));
      }

      toast.success(`Tag "${tagToDelete.name}" excluída.`);
      setTagToDelete(null);
    } catch {
      toast.error('Erro ao excluir tag.');
    } finally {
      setDeletingTag(false);
    }
  };

  // --- CALCULATOR FORMULAS ---
  const compoundResult = useMemo(() => {
    const s0 = Math.max(0, Number(ciInitial) || 0);
    const m = Math.max(0, Number(ciMonthly) || 0);
    const parsedRate =
      parseFloat(String(ciRateStr || '0').replace(',', '.')) || 0;
    const r = Math.max(0, parsedRate) / 100;
    const k = Math.max(1, Number(ciMonths) || 1);

    let total = s0;
    for (let i = 0; i < k; i++) {
      total = total * (1 + r) + m;
    }
    const invested = s0 + m * k;
    const yieldAmt = Math.max(0, total - invested);
    return { k, total, yieldAmt };
  }, [ciInitial, ciMonthly, ciRateStr, ciMonths]);

  const cashVsInstResult = useMemo(() => {
    const cash = Math.max(0, Number(cvCash) || 0);
    const n = Math.max(1, Number(cvCount) || 1);
    const inst = Math.max(0, Number(cvInstallment) || 0);
    const ratePct = impliedMonthlyRate(cash, inst, n);
    const formattedRate = ratePct.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return { cash, n, inst, ratePct, formattedRate };
  }, [cvCash, cvCount, cvInstallment]);

  const monthlyIncomeRef = useMemo(() => {
    const ym =
      selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)
        ? selectedPeriod
        : new Date().toISOString().slice(0, 7);
    const [yr, mo] = ym.split('-').map(Number);
    let sum = 0;
    visibleTxs.forEach((tx) => {
      if (tx.type !== 'income') return;
      const d = parseTxDate(tx.date);
      if (d && d.getFullYear() === yr && d.getMonth() === mo - 1) {
        sum += Number(tx.amount) || 0;
      }
    });
    return sum > 0 ? sum : 7430;
  }, [visibleTxs, selectedPeriod]);

  const savingsGoalResult = useMemo(() => {
    const goal = Math.max(0, Number(sgGoal) || 0);
    const months = Math.max(1, Number(sgMonths) || 1);
    const perMonth = goal / months;
    const pct =
      monthlyIncomeRef > 0 ? Math.round((perMonth / monthlyIncomeRef) * 100) : 0;
    return { goal, months, perMonth, pct };
  }, [sgGoal, sgMonths, monthlyIncomeRef]);

  // --- TRAVEL MODE HANDLERS ---
  const handleCurrencyChange = (nextCode: string) => {
    const found = TRIP_CURRENCIES.find((c) => c.code === nextCode);
    if (!found) return;
    updateTrip({
      code: found.code,
      rate: found.defaultRate,
      destination: trip.destination || found.country,
    });
  };

  const handleUpdateExchangeRate = async () => {
    if (fetchingRate) return;
    setFetchingRate(true);
    try {
      const rate = await fetchExchangeRateToBRL(trip.code);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      updateTrip({
        rate,
        updatedAt: `Cotação atualizada hoje, ${hh}:${mm}.`,
      });
      toast.success(`Cotação atualizada: ${formatTripRate(rate)}`);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível buscar a cotação.');
    } finally {
      setFetchingRate(false);
    }
  };

  const sampleForeignAmount = 20;
  const sampleBrlConverted = sampleForeignAmount * (Number(trip.rate) || 1);
  const currencySymbol = getTripCurrencySymbol(trip.code);

  return (
    <div className="space-y-5 pb-8">
      {/* Top bar: Segmented tabs + Action button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-pill bg-seg p-1">
          {(
            [
              { id: 'tags', label: 'Tags' },
              { id: 'calculadoras', label: 'Calculadoras' },
              { id: 'viagem', label: 'Modo viagem' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 min-h-[38px] rounded-pill text-xs font-bold transition-all ${
                activeTab === t.id
                  ? 'bg-segOn text-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          <Link
            to="/import"
            className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-xs md:text-sm inline-flex items-center gap-2 hover:border-pri/40 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <span>Importar extrato</span>
          </Link>

          {activeTab === 'tags' && (
            <button
              type="button"
              onClick={openNewTagModal}
              className="px-4 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-sm flex items-center gap-2 shadow-sm hover:opacity-95 transition-opacity"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Nova tag</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: TAGS */}
      {activeTab === 'tags' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left grid of tag pills/cards */}
          <div className="lg:col-span-6">
            {mergedTags.length === 0 ? (
              <div className="rounded-[24px] bg-card border border-border p-8 text-center space-y-2">
                <div className="font-display text-sm font-bold text-ink">
                  Nenhuma tag criada ainda
                </div>
                <p className="text-xs text-muted">
                  Crie tags como Viagem, Reforma ou Trabalho para agrupar lançamentos de diferentes categorias.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {mergedTags.map((tag) => {
                  const isSelected =
                    normalize(tag.name) === normalize(selectedTagName);
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => setSelectedTagName(tag.name)}
                      className={`min-h-[60px] px-4 py-3.5 rounded-[20px] bg-card border text-left flex items-center justify-between gap-2 transition-all ${
                        isSelected
                          ? 'border-pri ring-1 ring-pri/30 shadow-xs'
                          : 'border-border hover:border-pri/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-bold text-sm text-ink truncate">
                          {tag.name}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-muted shrink-0">
                        {tag.txs.length}{' '}
                        {tag.txs.length === 1 ? 'lançamento' : 'lançamentos'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right selected tag detail card */}
          <div className="lg:col-span-6">
            {activeTagDetail ? (
              <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: activeTagDetail.color }}
                    />
                    <h2 className="font-display text-base font-bold text-ink">
                      {activeTagDetail.name}
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-pri">
                    {activeTagDetail.txs.length}{' '}
                    {activeTagDetail.txs.length === 1
                      ? 'lançamento'
                      : 'lançamentos'}
                    , {maskCurrency(activeTagDetail.total, privacyMode)} no total
                  </span>
                </div>

                {activeTagDetail.txs.length === 0 ? (
                  <p className="text-xs text-muted py-6 text-center">
                    Nenhum lançamento marcado com esta tag até agora.
                  </p>
                ) : (
                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {activeTagDetail.txs.map((tx) => (
                      <div
                        key={tx.id || `${tx.description}-${tx.date}`}
                        className="py-3 flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-semibold text-ink truncate">
                          {tx.description}
                        </span>
                        <span className="font-display font-bold text-ink shrink-0">
                          {maskCurrency(tx.amount, privacyMode)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => openEditTagModal(activeTagDetail)}
                    className="px-4 min-h-[40px] rounded-[14px] bg-card border border-border text-ink font-bold text-xs hover:bg-neutral transition-colors"
                  >
                    Editar tag
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTagToDelete({
                        id: activeTagDetail.id,
                        name: activeTagDetail.name,
                      })
                    }
                    className="px-4 min-h-[40px] rounded-[14px] bg-spendSoft text-spendText font-bold text-xs hover:opacity-90 transition-opacity"
                  >
                    Excluir tag
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] bg-card border border-border p-8 text-center text-xs text-muted">
                Selecione uma tag ao lado para ver os lançamentos vinculados.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CALCULADORAS */}
      {activeTab === 'calculadoras' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* 1. Juros compostos */}
          <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
            <h2 className="font-display text-base font-bold text-ink">
              Juros compostos
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Valor inicial
                </label>
                <MoneyField
                  value={ciInitial}
                  onValueChange={setCiInitial}
                  ariaLabel="Valor inicial"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Aporte mensal
                </label>
                <MoneyField
                  value={ciMonthly}
                  onValueChange={setCiMonthly}
                  ariaLabel="Aporte mensal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Juros ao mês (%)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ciRateStr}
                    onChange={(e) => setCiRateStr(e.target.value)}
                    aria-label="Juros ao mês em porcentagem"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-ink font-medium outline-none focus:border-pri"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Meses
                  </label>
                  <NumberField
                    value={ciMonths}
                    onValueChange={setCiMonths}
                    min={1}
                    max={600}
                    ariaLabel="Quantidade de meses"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[18px] bg-priSoft p-4 text-xs font-semibold text-priInk leading-relaxed">
              Em {compoundResult.k} meses você terá{' '}
              <span className="font-bold">
                {formatCurrency(compoundResult.total)}
              </span>
              , sendo{' '}
              <span className="font-bold">
                {formatCurrency(compoundResult.yieldAmt)}
              </span>{' '}
              de rendimento.
            </div>
          </div>

          {/* 2. À vista ou parcelado */}
          <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
            <h2 className="font-display text-base font-bold text-ink">
              À vista ou parcelado
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Preço à vista
                </label>
                <MoneyField
                  value={cvCash}
                  onValueChange={setCvCash}
                  ariaLabel="Preço à vista"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Parcelas
                  </label>
                  <NumberField
                    value={cvCount}
                    onValueChange={setCvCount}
                    min={1}
                    max={120}
                    ariaLabel="Número de parcelas"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Valor da parcela
                  </label>
                  <MoneyField
                    value={cvInstallment}
                    onValueChange={setCvInstallment}
                    ariaLabel="Valor de cada parcela"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[18px] bg-priSoft p-4 text-xs font-semibold text-priInk leading-relaxed">
              {cashVsInstResult.ratePct > 0 ? (
                <>
                  O parcelado embute{' '}
                  <span className="font-bold">
                    {cashVsInstResult.formattedRate}% ao mês
                  </span>
                  . Se você consegue render mais que isso, pague parcelado. Se não, pague à vista.
                </>
              ) : (
                <>
                  Parcelado sai{' '}
                  <span className="font-bold">
                    {formatCurrency(cashVsInstResult.inst * cashVsInstResult.n)}
                  </span>{' '}
                  no total, sem juros embutidos.
                </>
              )}
            </div>
          </div>

          {/* 3. Meta de economia */}
          <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
            <h2 className="font-display text-base font-bold text-ink">
              Meta de economia
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Quero juntar
                </label>
                <MoneyField
                  value={sgGoal}
                  onValueChange={setSgGoal}
                  ariaLabel="Valor que quero juntar"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Em quantos meses
                </label>
                <NumberField
                  value={sgMonths}
                  onValueChange={setSgMonths}
                  min={1}
                  max={600}
                  ariaLabel="Em quantos meses"
                />
              </div>
            </div>

            <div className="rounded-[18px] bg-priSoft p-4 text-xs font-semibold text-priInk leading-relaxed">
              Guarde{' '}
              <span className="font-bold">
                {formatCurrency(savingsGoalResult.perMonth)}
              </span>{' '}
              por mês
              {savingsGoalResult.pct > 0
                ? `, ${savingsGoalResult.pct}% da sua renda.`
                : '.'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MODO VIAGEM */}
      {activeTab === 'viagem' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Card: Modo viagem */}
          <div className="lg:col-span-7 rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  Modo viagem
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Converte gastos em moeda estrangeira para reais
                </p>
              </div>
              <Switch
                checked={trip.enabled}
                onCheckedChange={(checked) => updateTrip({ enabled: checked })}
                ariaLabel="Ativar modo viagem"
              />
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Destino
                </label>
                <input
                  type="text"
                  value={trip.destination}
                  onChange={(e) => updateTrip({ destination: e.target.value })}
                  placeholder="Estados Unidos"
                  aria-label="Destino da viagem"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Moeda
                  </label>
                  <Select
                    value={trip.code}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    ariaLabel="Moeda da viagem"
                  >
                    {TRIP_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Cotação
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateInputStr}
                    onChange={(e) => {
                      setRateInputStr(e.target.value);
                      const num = parseFloat(
                        e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
                      );
                      if (Number.isFinite(num) && num > 0) {
                        updateTrip({ rate: num });
                      }
                    }}
                    aria-label="Cotação em reais"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm font-medium text-ink outline-none focus:border-pri"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Ida
                  </label>
                  <DatePicker
                    value={trip.start}
                    onChange={(val) => updateTrip({ start: val })}
                    ariaLabel="Data de ida"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    Volta
                  </label>
                  <DatePicker
                    value={trip.end}
                    onChange={(val) => updateTrip({ end: val })}
                    ariaLabel="Data de volta"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={fetchingRate}
                onClick={handleUpdateExchangeRate}
                className="px-4 min-h-[42px] rounded-[16px] bg-priSoft text-priInk font-bold text-xs md:text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {fetchingRate ? 'Atualizando...' : 'Atualizar cotação'}
              </button>
              <span className="text-xs text-muted">
                {trip.updatedAt || `Cotação atual: ${formatTripRate(trip.rate)}`}
              </span>
            </div>
          </div>

          {/* Right Card: Durante a viagem */}
          <div className="lg:col-span-5 rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
            <h2 className="font-display text-base font-bold text-ink">
              Durante a viagem
            </h2>

            <div className="divide-y divide-border">
              <div className="py-3.5 first:pt-0 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-ink">Pausar fixas</div>
                  <div className="text-xs text-muted mt-0.5">
                    Não cobra assinaturas pausadas
                  </div>
                </div>
                <Switch
                  checked={trip.pauseFixed}
                  onCheckedChange={(checked) =>
                    updateTrip({ pauseFixed: checked })
                  }
                  ariaLabel="Pausar fixas durante a viagem"
                />
              </div>

              <div className="py-3.5 last:pb-0 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-ink">
                    Marcar com a tag Viagem
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Adiciona a tag nos lançamentos do período
                  </div>
                </div>
                <Switch
                  checked={trip.tagOn}
                  onCheckedChange={(checked) => updateTrip({ tagOn: checked })}
                  ariaLabel="Marcar lançamentos com a tag Viagem"
                />
              </div>
            </div>

            <div className="rounded-[18px] bg-priSoft p-4 text-xs font-semibold text-priInk leading-relaxed">
              Quando você lançar {currencySymbol} 20,00, o Wynd salva{' '}
              <span className="font-bold">
                {formatCurrency(sampleBrlConverted)}
              </span>{' '}
              e guarda o valor original em moeda estrangeira.
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova / Editar Tag */}
      <Dialog.Root open={isTagModalOpen} onOpenChange={setIsTagModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none">
            <Dialog.Title className="font-display text-lg font-bold text-ink mb-4">
              {editingTag ? 'Editar tag' : 'Nova tag'}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Escolha o nome e a cor da tag.
            </Dialog.Description>

            <form onSubmit={handleSaveTag} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Nome da tag
                </label>
                <input
                  type="text"
                  value={tagNameInput}
                  onChange={(e) => setTagNameInput(e.target.value)}
                  placeholder="Ex: Viagem, Reforma, Trabalho"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">
                  Cor
                </label>
                <div className="flex items-center gap-2.5">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${c}`}
                      onClick={() => setTagColorInput(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform ${
                        tagColorInput === c ? 'scale-110 ring-2 ring-ink' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(false)}
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

      <ConfirmDialog
        isOpen={Boolean(tagToDelete)}
        title={'Excluir tag'}
        message={
          tagToDelete
            ? `Deseja excluir a tag "${tagToDelete.name}"? Ela será removida dos lançamentos vinculados, sem apagar nenhuma transação.`
            : ''
        }
        confirmLabel={deletingTag ? 'Excluindo...' : 'Excluir tag'}
        onConfirm={handleConfirmDeleteTag}
        onCancel={() => setTagToDelete(null)}
      />
    </div>
  );
}

export default Tools;
