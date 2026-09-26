import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { useUIStore } from '../stores/useUIStore';
import { toast } from '../stores/useToastStore';
import { ConfirmModal } from '../components/ConfirmModal';
import { CustomSelect } from '../components/CustomSelect';
import { PageLoading } from '../components/StateFeedback';
import { db } from '../firebase';
import { User } from '../types';

const DEFAULT_CATEGORIES = [
  'Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação',
  'Lazer', 'Salário', 'Investimentos', 'Assinaturas', 'Outros',
];

const ICON_OPTIONS = [
  'fa-bag-shopping', 'fa-house', 'fa-car', 'fa-bus', 'fa-heart-pulse', 'fa-graduation-cap',
  'fa-gamepad', 'fa-film', 'fa-plane', 'fa-utensils', 'fa-mug-hot', 'fa-dumbbell',
  'fa-gift', 'fa-paw', 'fa-baby', 'fa-shirt', 'fa-wrench', 'fa-bolt',
  'fa-mobile-screen', 'fa-money-bill-wave', 'fa-piggy-bank', 'fa-chart-line', 'fa-rotate', 'fa-tag',
];

export default function Settings() {
  const { session, hasPermission } = useAuth() as { session: User; hasPermission: (r: string, a?: string) => boolean };
  const { theme, toggleTheme } = useUIStore();

  const { data: accounts, saveRecord: saveAccount } = useCollection('accounts');
  const { data: cards, saveRecord: saveCard } = useCollection('cards');
  const { data: transactions, saveRecord: saveTx } = useCollection('transactions');
  const { data: subscriptions, saveRecord: saveSub } = useCollection('subscriptions');
  const { data: persons, saveRecord: savePerson } = useCollection('persons');
  const { data: paidInvoices, saveRecord: savePaidInvoice } = useCollection('paidInvoices');

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoryStyles, setCategoryStyles] = useState<Record<string, { icon: string; color: string }>>({});
  const [newCat, setNewCat] = useState('');
  const [loadingCats, setLoadingCats] = useState(true);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const canManage = hasPermission('config_system');

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'categories'));
        if (snap.exists() && Array.isArray(snap.data().list)) {
          setCategories(snap.data().list);
        }
        const budgetsSnap = await getDoc(doc(db, 'settings', 'budgets'));
        if (budgetsSnap.exists()) {
          setBudgets(budgetsSnap.data() as Record<string, number>);
        }
        const stylesSnap = await getDoc(doc(db, 'settings', 'categoryStyles'));
        if (stylesSnap.exists()) {
          setCategoryStyles(stylesSnap.data() as Record<string, { icon: string; color: string }>);
        }
      } catch (e) {
        console.error('Erro ao carregar categorias:', e);
      } finally {
        setLoadingCats(false);
      }
    }
    loadSettings();
  }, []);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const clean = newCat.trim();
    if (!clean) return;
    if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.warning('Esta categoria já existe.');
      return;
    }

    const updated = [...categories, clean];
    setCategories(updated);
    setNewCat('');

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: updated }, { merge: true });
      toast.success(`Categoria "${clean}" adicionada!`);
    } catch (err) {
      toast.error('Erro ao salvar categoria no banco.');
    }
  }

  async function handleRemoveCategory(catToRemove: string) {
    const updated = categories.filter((c) => c !== catToRemove);
    setCategories(updated);

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: updated }, { merge: true });
      toast.info(`Categoria "${catToRemove}" removida.`);
    } catch (err) {
      toast.error('Erro ao atualizar categorias.');
    }
  }

  async function handleCategoryStyleChange(cat: string, field: 'icon' | 'color', value: string) {
    const updated = { ...categoryStyles, [cat]: { icon: categoryStyles[cat]?.icon || ICON_OPTIONS[0], color: categoryStyles[cat]?.color || '#e3b04b', [field]: value } };
    setCategoryStyles(updated);
    try {
      await setDoc(doc(db, 'settings', 'categoryStyles'), updated, { merge: true });
    } catch {
      toast.error('Erro ao salvar estilo da categoria.');
    }
  }

  function handleBudgetChange(cat: string, value: string) {
    setBudgets((prev) => ({ ...prev, [cat]: Number(value) || 0 }));
  }

  async function handleBudgetSave(cat: string) {
    try {
      await setDoc(doc(db, 'settings', 'budgets'), { [cat]: budgets[cat] || 0 }, { merge: true });
      toast.success(`Meta de "${cat}" salva!`);
    } catch (err) {
      toast.error('Erro ao salvar meta.');
    }
  }

  function handleExportBackup() {
    try {
      const backupData = {
        version: '2.0-react',
        exportedAt: new Date().toISOString(),
        accounts,
        cards,
        transactions,
        subscriptions,
        categories,
        persons,
        paidInvoices,
        budgets,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_fluxo_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup exportado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar arquivo de backup.');
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreModalOpen(true);
    e.target.value = '';
  }

  async function handleConfirmRestore() {
    if (!restoreFile) return;
    setIsRestoring(true);
    setRestoreModalOpen(false);

    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);

      if (!parsed.accounts && !parsed.transactions) {
        throw new Error('Arquivo de backup inválido.');
      }

      let count = 0;
      if (Array.isArray(parsed.accounts)) {
        for (const a of parsed.accounts) { await saveAccount(a); count++; }
      }
      if (Array.isArray(parsed.cards)) {
        for (const c of parsed.cards) { await saveCard(c); count++; }
      }
      if (Array.isArray(parsed.subscriptions)) {
        for (const s of parsed.subscriptions) { await saveSub(s); count++; }
      }
      if (Array.isArray(parsed.persons)) {
        for (const p of parsed.persons) { await savePerson(p); count++; }
      }
      if (Array.isArray(parsed.paidInvoices)) {
        for (const inv of parsed.paidInvoices) { await savePaidInvoice(inv); count++; }
      }
      if (Array.isArray(parsed.transactions)) {
        for (const t of parsed.transactions) { await saveTx(t); count++; }
      }
      if (Array.isArray(parsed.categories)) {
        await setDoc(doc(db, 'settings', 'categories'), { list: parsed.categories }, { merge: true });
        setCategories(parsed.categories);
      }
      if (parsed.budgets && typeof parsed.budgets === 'object') {
        await setDoc(doc(db, 'settings', 'budgets'), parsed.budgets, { merge: true });
        setBudgets(parsed.budgets);
      }

      toast.success(`Backup restaurado com sucesso (${count} registros)!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao restaurar backup.');
    } finally {
      setIsRestoring(false);
      setRestoreFile(null);
    }
  }

  if (loadingCats) return <PageLoading message="Carregando configurações..." />;

  return (
    <div className="animate-in fade-in duration-500 max-w-[850px] mx-auto pb-12">
      <div className="mb-8">
        <h2 className="text-[1.8rem] font-bold text-[#f2f0ea]">Configurações do Sistema</h2>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 mb-8 shadow-xl relative overflow-hidden">
        <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#3b82f6]" />
        
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/20 text-[#3b82f6] flex items-center justify-center">
            <i className="fa-solid fa-user-gear" />
          </div>
          Perfil e Preferências
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div>
            <span className="block text-xs uppercase tracking-wider font-semibold text-[#8fa39a] mb-1">Nome de Exibição</span>
            <p className="font-bold text-[#f2f0ea] text-lg">{session.name}</p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wider font-semibold text-[#8fa39a] mb-1">Login / Usuário</span>
            <p className="font-bold text-[#f2f0ea] text-lg">{session.username}</p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wider font-semibold text-[#8fa39a] mb-1">Cargo</span>
            <p className="font-bold text-[#f2f0ea] text-lg capitalize">{session.role}</p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wider font-semibold text-[#8fa39a] mb-1">Pessoa Vinculada</span>
            <p className="font-bold text-[#f2f0ea] text-lg">{session.person}</p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <strong className="block text-[#f2f0ea] mb-1">Tema da Interface</strong>
            <span className="text-sm text-[#8fa39a]">Atualmente em modo {theme === 'dark' ? 'Escuro' : 'Claro'}</span>
          </div>
          <button onClick={toggleTheme} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl font-medium transition-colors border border-white/10">
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun text-yellow-400' : 'fa-moon text-blue-400'}`} />
            Alternar para {theme === 'dark' ? 'Claro' : 'Escuro'}
          </button>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 mb-8 shadow-xl relative overflow-hidden">
        <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#10b981]" />
        
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#10b981]/20 text-[#10b981] flex items-center justify-center">
            <i className="fa-solid fa-tags" />
          </div>
          Categorias Personalizadas
        </h3>
        <p className="text-sm text-[#8fa39a] mb-6">Gerencie as opções de categoria disponíveis para classificação de despesas e receitas.</p>

        {canManage && (
          <form onSubmit={handleAddCategory} className="flex gap-3 mb-6">
            <input type="text" placeholder="Nova categoria (ex: Streaming)..." value={newCat} onChange={(e) => setNewCat(e.target.value)} className="flex-1 p-3 rounded-xl border border-white/[0.08] bg-[#141d1a] text-[#f2f0ea] focus:border-[#10b981] outline-none" />
            <button type="submit" className="px-5 py-3 rounded-xl bg-[#10b981]/20 text-[#10b981] font-bold transition-all hover:bg-[#10b981]/30 border border-[#10b981]/30 shrink-0">
              <i className="fa-solid fa-plus mr-1" /> Adicionar
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-2.5">
          {categories.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-sm font-medium text-[#f2f0ea]">
              <i className={`fa-solid ${categoryStyles[cat]?.icon || 'fa-tag'}`} style={{ color: categoryStyles[cat]?.color || '#8fa39a' }} />
              {cat}
              {canManage && (
                <>
                  <CustomSelect value={categoryStyles[cat]?.icon || ''} onChange={(e) => handleCategoryStyleChange(cat, 'icon', e.target.value)} size="sm" className="w-28">
                    <option value="" disabled>Ícone</option>
                    {ICON_OPTIONS.map((ic) => (<option key={ic} value={ic}>{ic.replace('fa-', '')}</option>))}
                  </CustomSelect>
                  <input type="color" value={categoryStyles[cat]?.color || '#e3b04b'} onChange={(e) => handleCategoryStyleChange(cat, 'color', e.target.value)} className="w-6 h-6 rounded-md cursor-pointer bg-transparent border border-white/20" title="Cor da categoria" />
                  <button type="button" onClick={() => handleRemoveCategory(cat)} className="text-[#8fa39a] hover:text-red-400 transition-colors focus:outline-none" title="Remover categoria">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 mb-8 shadow-xl relative overflow-hidden">
        <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#f59e0b]" />

        <h3 className="text-xl font-bold text-[#f2f0ea] mb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/20 text-[#f59e0b] flex items-center justify-center">
            <i className="fa-solid fa-bullseye" />
          </div>
          Metas de Gasto por Categoria
        </h3>
        <p className="text-sm text-[#8fa39a] mb-6">Defina um limite mensal por categoria. O Dashboard avisa quando o gasto do mês estiver perto ou passar da meta.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <span className="flex-1 text-sm font-medium text-[#f2f0ea] truncate">{cat}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Sem meta"
                value={budgets[cat] || ''}
                onChange={(e) => handleBudgetChange(cat, e.target.value)}
                onBlur={() => handleBudgetSave(cat)}
                disabled={!canManage}
                className="w-28 p-2 rounded-lg bg-black/40 border border-white/10 text-[#f2f0ea] text-right outline-none focus:border-[#f59e0b] disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="w-1 absolute top-0 bottom-0 left-0 bg-[#8b5cf6]" />
        
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/20 text-[#8b5cf6] flex items-center justify-center">
            <i className="fa-solid fa-database" />
          </div>
          Backup e Segurança de Dados
        </h3>
        <p className="text-sm text-[#8fa39a] mb-6">Exporte uma cópia completa de suas contas, cartões, transações, assinaturas, pessoas e faturas pagas em JSON, ou restaure um backup anterior.</p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={handleExportBackup} className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors">
            <i className="fa-solid fa-download" /> Exportar Backup Completo
          </button>

          {canManage && (
            <label className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#8fa39a] hover:text-white font-medium border border-white/10 transition-colors cursor-pointer">
              <i className="fa-solid fa-upload" /> Restaurar Backup (JSON)
              <input type="file" accept=".json" onChange={handleFileSelected} className="hidden" disabled={isRestoring} />
            </label>
          )}
        </div>
      </div>

      <ConfirmModal isOpen={restoreModalOpen} title="Restaurar Backup de Dados" message={`Deseja restaurar os dados do arquivo "${restoreFile?.name}"? Os registros contidos no backup serão importados e mesclados no sistema.`} confirmLabel="Confirmar Restauração" onConfirm={handleConfirmRestore} onCancel={() => { setRestoreModalOpen(false); setRestoreFile(null); }} />
    </div>
  );
}
