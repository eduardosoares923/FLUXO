import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../context/AuthContext';
import { useUIStore, THEME_OPTIONS, ThemeMode } from '../stores/useUIStore';
import { toast } from '../stores/useToastStore';
import { db, auth } from '../firebase';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  query,
  where,
} from 'firebase/firestore';
import { MoneyField } from '../components/ui/MoneyField';
import { PageContainer } from '../components/ui/PageContainer';

const DEFAULT_CATEGORIES = [
  'Moradia',
  'Mercado',
  'Transporte',
  'Lazer',
  'Saúde',
  'Assinaturas',
  'Restaurantes',
  'Salário',
];

export function Settings() {
  const { session, logout } = useAuth();
  const { themeMode, setThemeMode, selectedPeriod } = useUIStore();
  const { data: settingsDocs } = useCollection<any>('settings');
  const { data: allUsers } = useCollection<any>('users', {}, { unscoped: true });

  const [newCategory, setNewCategory] = useState('');
  const [localBudgets, setLocalBudgets] = useState<Record<string, number>>({});
  const [savingBudgets, setSavingBudgets] = useState(false);

  // Mudar de família
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [requestingSwitch, setRequestingSwitch] = useState(false);

  // Backup
  const [exportingExcel, setExportingExcel] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Excluir minha conta
  const [deleteText, setDeleteText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const myUserDoc = useMemo(
    () => (allUsers || []).find((u: any) => u.id === session?.id),
    [allUsers, session?.id]
  );

  const categoriesDoc = useMemo(
    () => (settingsDocs || []).find((d: any) => d.id === 'categories'),
    [settingsDocs]
  );

  const budgetsDoc = useMemo(
    () => (settingsDocs || []).find((d: any) => d.id === 'budgets'),
    [settingsDocs]
  );

  const categories: string[] = useMemo(() => {
    if (Array.isArray(categoriesDoc?.list) && categoriesDoc.list.length > 0) {
      return categoriesDoc.list;
    }
    return DEFAULT_CATEGORIES;
  }, [categoriesDoc]);

  useEffect(() => {
    if (budgetsDoc?.limits && typeof budgetsDoc.limits === 'object') {
      setLocalBudgets(budgetsDoc.limits);
    }
  }, [budgetsDoc]);

  const saveCategoriesList = async (nextList: string[]) => {
    const famId = session?.familyId || session?.id || '';
    await setDoc(
      doc(db, 'settings', 'categories'),
      {
        list: nextList,
        familyId: famId,
        ownerUid: session?.id || '',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategory.trim();
    if (!clean) return;
    if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.warning('Essa categoria já existe.');
      return;
    }
    try {
      await saveCategoriesList([...categories, clean]);
      setNewCategory('');
      toast.success(`Categoria "${clean}" adicionada.`);
    } catch {
      toast.error('Não foi possível adicionar a categoria.');
    }
  };

  const handleRemoveCategory = async (cat: string) => {
    const next = categories.filter((c) => c !== cat);
    try {
      await saveCategoriesList(next);
      toast.info(`Categoria "${cat}" removida.`);
    } catch {
      toast.error('Erro ao remover categoria.');
    }
  };

  const handleBudgetChange = async (cat: string, val: number) => {
    const next = { ...localBudgets, [cat]: val };
    if (val <= 0) {
      delete next[cat];
    }
    setLocalBudgets(next);
    setSavingBudgets(true);
    try {
      const famId = session?.familyId || session?.id || '';
      await setDoc(
        doc(db, 'settings', 'budgets'),
        {
          limits: next,
          familyId: famId,
          ownerUid: session?.id || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      toast.error('Não foi possível salvar a meta da categoria.');
    } finally {
      setSavingBudgets(false);
    }
  };

  const handleExportExcelBackup = async () => {
    if (exportingExcel) return;
    const fbUser = auth?.currentUser;
    if (!fbUser) {
      toast.error('Sua sessão expirou. Saia e entre novamente.');
      return;
    }
    setExportingExcel(true);
    toast.info('Preparando arquivo Excel...');
    try {
      const idToken = await fbUser.getIdToken();
      const period =
        selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)
          ? selectedPeriod
          : new Date().toISOString().slice(0, 7);
      const resp = await fetch('/api/export-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          period,
          person: 'todos',
        }),
      });
      if (!resp.ok) {
        toast.error('Não foi possível exportar o Excel agora.');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Wynd-Backup-${period}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Cópia em Excel exportada com sucesso.');
    } catch {
      toast.error('Falha ao baixar planilha Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportJSONBackup = async () => {
    try {
      const famId = session?.familyId || session?.id || '';
      const cols = [
        'accounts',
        'cards',
        'transactions',
        'subscriptions',
        'persons',
        'paid_invoices',
        'settings',
        'goals',
        'tags',
      ];
      const backup: Record<string, any[]> = {};

      for (const colName of cols) {
        const q = famId
          ? query(collection(db, colName), where('familyId', '==', famId))
          : collection(db, colName);
        const snap = await getDocs(q);
        backup[colName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wynd-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup completo baixado.');
    } catch {
      toast.error('Erro ao gerar backup.');
    }
  };

  const handleRestoreJSONBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestoringBackup(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const famId = session?.familyId || session?.id || '';
      const cols = [
        'accounts',
        'cards',
        'transactions',
        'subscriptions',
        'persons',
        'paid_invoices',
        'settings',
        'goals',
        'tags',
      ];

      let batch = writeBatch(db);
      let ops = 0;

      for (const colName of cols) {
        const arr = parsed[colName];
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          const { id, ...rest } = item;
          const docId = id || doc(collection(db, colName)).id;
          batch.set(
            doc(db, colName, docId),
            {
              ...rest,
              familyId: rest.familyId || famId,
              ownerUid: rest.ownerUid || session?.id || '',
            },
            { merge: true }
          );
          ops++;
          if (ops >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
      }
      if (ops > 0) await batch.commit();
      toast.success('Backup restaurado com sucesso.');
    } catch {
      toast.error('Arquivo de backup inválido.');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleRequestFamilySwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      toast.warning('Digite o código de convite da outra família.');
      return;
    }
    if (!session?.id) return;

    setRequestingSwitch(true);
    try {
      const targetAdmin = (allUsers || []).find((u: any) => {
        const uCode = (
          u.inviteCode ||
          (u.familyId || u.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
        ).toUpperCase();
        return uCode === code;
      });

      if (!targetAdmin) {
        toast.error('Nenhuma família encontrada com este código de convite.');
        return;
      }

      const targetFamilyId = targetAdmin.familyId || targetAdmin.id;
      if (targetFamilyId === (session.familyId || session.id)) {
        toast.info('Você já faz parte desta família.');
        return;
      }

      await updateDoc(doc(db, 'users', session.id), {
        pendingFamilyId: targetFamilyId,
      });
      setInviteCodeInput('');
      toast.success(
        'Pedido enviado! Aguarde a aprovação do administrador da outra família.'
      );
    } catch {
      toast.error('Erro ao enviar pedido de mudança de família.');
    } finally {
      setRequestingSwitch(false);
    }
  };

  const handleCancelFamilySwitch = async () => {
    if (!session?.id) return;
    try {
      await updateDoc(doc(db, 'users', session.id), {
        pendingFamilyId: deleteField(),
      });
      toast.info('Pedido de mudança de família cancelado.');
    } catch {
      toast.error('Não foi possível cancelar o pedido.');
    }
  };

  const handleDeleteMyAccount = async () => {
    if (deleteText.trim().toUpperCase() !== 'EXCLUIR' || !session?.id) return;
    const fbUser = auth?.currentUser;
    if (!fbUser) {
      toast.error('Sua sessão expirou. Saia e entre novamente.');
      return;
    }

    setDeletingAccount(true);
    try {
      const idToken = await fbUser.getIdToken();
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json().catch(() => ({}));
      if (response.status !== 200) {
        toast.error(data?.error || 'Não foi possível excluir sua conta.');
        return;
      }

      toast.success('Sua conta foi excluída.');
      await logout();
    } catch {
      toast.error('Erro ao excluir sua conta.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const initial = (session?.name || session?.username || 'U')
    .trim()
    .charAt(0)
    .toUpperCase();

  const roleLabel =
    session?.role === 'admin'
      ? 'Administrador'
      : session?.role === 'gerente'
        ? 'Gerente'
        : 'Membro';

  const budgetCategories = useMemo(
    () => categories.filter((c) => c.toLowerCase() !== 'salário'),
    [categories]
  );

  return (
    <PageContainer className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column */}
      <div className="lg:col-span-7 space-y-5">
        {/* Perfil */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <h2 className="font-display text-base font-bold text-ink">Perfil</h2>

          <div className="flex items-center gap-3.5 pb-2">
            <div className="w-11 h-11 rounded-full bg-priSoft text-priInk font-display font-bold text-base flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-ink truncate">
                {session?.name || 'Usuário'}
              </div>
              <div className="text-xs text-muted truncate">
                {myUserDoc?.email || `${session?.username || 'usuario'}@wynd.app`}
              </div>
            </div>
          </div>

          <div className="divide-y divide-border text-sm">
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Nome</span>
              <span className="font-bold text-ink">{session?.name || '-'}</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Usuário</span>
              <span className="font-bold text-ink">{session?.username || '-'}</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Cargo</span>
              <span className="font-bold text-ink">{roleLabel}</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">
                Pessoa vinculada
              </span>
              <span className="font-bold text-ink">
                {session?.person || session?.name || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Tema */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-3.5">
          <h2 className="font-display text-base font-bold text-ink">Tema</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 rounded-[20px] bg-seg p-1.5">
            {THEME_OPTIONS.map((opt) => {
              const active = themeMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setThemeMode(opt.value as ThemeMode)}
                  className={`min-h-[42px] px-3 py-2 rounded-[16px] text-xs font-bold transition-all ${
                    active
                      ? 'bg-segOn text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Categorias */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <h2 className="font-display text-base font-bold text-ink">Categorias</h2>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill bg-neutral text-xs font-bold text-ink"
              >
                <span>{cat}</span>
                <button
                  type="button"
                  aria-label={`Remover categoria ${cat}`}
                  onClick={() => handleRemoveCategory(cat)}
                  className="text-muted hover:text-spend ml-0.5 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nova categoria, por exemplo Streaming"
              aria-label="Nova categoria"
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-pri"
            />
            <button
              type="submit"
              className="px-5 min-h-[44px] rounded-[18px] bg-priSoft text-priInk font-bold text-xs md:text-sm hover:opacity-90 transition-opacity shrink-0"
            >
              Adicionar
            </button>
          </form>
        </div>

        {/* Metas por categoria */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Metas por categoria
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Quando o gasto do mês passa da meta, a barra em Relatórios fica vermelha.
              </p>
            </div>
            {savingBudgets && (
              <span className="text-[11px] font-bold text-pri shrink-0">
                Salvando...
              </span>
            )}
          </div>

          <div className="divide-y divide-border">
            {budgetCategories.map((cat) => {
              const val = localBudgets[cat];
              return (
                <div
                  key={cat}
                  className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-4"
                >
                  <span className="text-sm font-bold text-ink">{cat}</span>
                  <div className="w-40">
                    <MoneyField
                      value={val && val > 0 ? val : ''}
                      onValueChange={(num) => handleBudgetChange(cat, num)}
                      placeholder="Sem meta"
                      ariaLabel={`Meta para ${cat}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="lg:col-span-5 space-y-5">
        {/* Backup */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">Backup</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Baixe uma cópia de contas, cartões, transações, fixas, pessoas e faturas pagas.
            </p>
          </div>

          <button
            type="button"
            disabled={exportingExcel}
            onClick={handleExportExcelBackup}
            className="w-full min-h-[46px] px-4 rounded-[18px] bg-fab text-fabIcon font-bold text-sm shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {exportingExcel ? 'Exportando Excel...' : 'Exportar tudo em Excel'}
          </button>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleExportJSONBackup}
              className="flex-1 min-h-[40px] px-3 rounded-[14px] bg-neutral text-ink font-bold text-xs hover:opacity-90 transition-opacity"
            >
              Baixar cópia JSON
            </button>
            <button
              type="button"
              disabled={restoringBackup}
              onClick={() => restoreInputRef.current?.click()}
              className="flex-1 min-h-[40px] px-3 rounded-[14px] bg-neutral text-ink font-bold text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {restoringBackup ? 'Restaurando...' : 'Restaurar JSON'}
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreJSONBackup}
              className="sr-only hidden"
              tabIndex={-1}
            />
          </div>
        </div>

        {/* Mudar de família */}
        <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-4">
          <h2 className="font-display text-base font-bold text-ink">
            Mudar de família
          </h2>

          {myUserDoc?.pendingFamilyId ? (
            <div className="rounded-[18px] bg-priSoft p-4 space-y-2.5">
              <div className="text-xs font-bold text-priInk">
                Você tem um pedido de mudança aguardando aprovação.
              </div>
              <button
                type="button"
                onClick={handleCancelFamilySwitch}
                className="px-3.5 min-h-[36px] rounded-[12px] bg-card text-ink text-xs font-bold border border-border"
              >
                Cancelar pedido
              </button>
            </div>
          ) : (
            <form onSubmit={handleRequestFamilySwitch} className="space-y-2">
              <label className="block text-xs font-bold text-muted">
                Código de convite da outra família
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="Digite o código"
                  aria-label="Código de convite da outra família"
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink uppercase tracking-wider outline-none focus:border-pri"
                />
                <button
                  type="submit"
                  disabled={requestingSwitch}
                  className="px-4 min-h-[44px] rounded-[18px] bg-card border border-border text-ink font-bold text-xs md:text-sm hover:bg-neutral transition-colors shrink-0 disabled:opacity-50"
                >
                  {requestingSwitch ? 'Enviando...' : 'Pedir para mudar'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-[18px] bg-neutral p-3.5 text-xs text-muted leading-relaxed">
            Seus lançamentos de hoje não vão junto. A mudança só vale depois que o chefe da outra família aprovar.
          </div>
        </div>

        {/* Excluir minha conta */}
        <div className="rounded-[24px] bg-card border border-spend p-5 md:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-spendText">
              Excluir minha conta
            </h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Apaga seu usuário e seus lançamentos pessoais. Para confirmar, digite EXCLUIR abaixo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Digite EXCLUIR"
              aria-label="Digite EXCLUIR para confirmar exclusão da conta"
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-sm text-ink outline-none focus:border-spend"
            />
            <button
              type="button"
              disabled={
                deletingAccount || deleteText.trim().toUpperCase() !== 'EXCLUIR'
              }
              onClick={handleDeleteMyAccount}
              className="px-4 min-h-[44px] rounded-[18px] bg-spend text-white font-bold text-xs md:text-sm hover:opacity-95 transition-opacity shrink-0 disabled:opacity-40"
            >
              {deletingAccount ? 'Excluindo...' : 'Excluir minha conta'}
            </button>
          </div>
        </div>

        {/* Links legais */}
        <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted px-1">
          <Link
            to="/termos"
            className="font-semibold hover:text-ink transition-colors"
          >
            Termos de uso
          </Link>
          <Link
            to="/privacidade"
            className="font-semibold hover:text-ink transition-colors"
          >
            Política de privacidade
          </Link>
          <Link
            to="/excluir-conta"
            className="font-semibold hover:text-ink transition-colors"
          >
            Exclusão de conta e dados
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}

export default Settings;
