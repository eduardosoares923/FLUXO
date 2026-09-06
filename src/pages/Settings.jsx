import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { useUIStore } from '../stores/useUIStore';
import { toast } from '../stores/useToastStore';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoading } from '../components/StateFeedback';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_CATEGORIES = [
  'Alimentação',
  'Moradia',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Salário',
  'Investimentos',
  'Assinaturas',
  'Outros',
];

export default function Settings() {
  const { session, hasPermission } = useAuth();
  const { theme, toggleTheme } = useUIStore();

  const { data: accounts, saveRecord: saveAccount } = useCollection('accounts');
  const { data: cards, saveRecord: saveCard } = useCollection('cards');
  const { data: transactions, saveRecord: saveTx } = useCollection('transactions');
  const { data: subscriptions, saveRecord: saveSub } = useCollection('subscriptions');

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newCat, setNewCat] = useState('');
  const [loadingCats, setLoadingCats] = useState(true);

  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const canManage = hasPermission('config_system');

  // Carrega categorias do Firestore
  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'categories'));
        if (snap.exists() && Array.isArray(snap.data().list)) {
          setCategories(snap.data().list);
        }
      } catch (e) {
        console.error('Erro ao carregar categorias:', e);
      } finally {
        setLoadingCats(false);
      }
    }
    loadSettings();
  }, []);

  async function handleAddCategory(e) {
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

  async function handleRemoveCategory(catToRemove) {
    const updated = categories.filter((c) => c !== catToRemove);
    setCategories(updated);

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: updated }, { merge: true });
      toast.info(`Categoria "${catToRemove}" removida.`);
    } catch (err) {
      toast.error('Erro ao atualizar categorias.');
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

  function handleFileSelected(e) {
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
        for (const a of parsed.accounts) {
          await saveAccount(a);
          count++;
        }
      }
      if (Array.isArray(parsed.cards)) {
        for (const c of parsed.cards) {
          await saveCard(c);
          count++;
        }
      }
      if (Array.isArray(parsed.subscriptions)) {
        for (const s of parsed.subscriptions) {
          await saveSub(s);
          count++;
        }
      }
      if (Array.isArray(parsed.transactions)) {
        for (const t of parsed.transactions) {
          await saveTx(t);
          count++;
        }
      }
      if (Array.isArray(parsed.categories)) {
        await setDoc(doc(db, 'settings', 'categories'), { list: parsed.categories }, { merge: true });
        setCategories(parsed.categories);
      }

      toast.success(`Backup restaurado com sucesso (${count} registros processados)!`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Erro ao restaurar backup.');
    } finally {
      setIsRestoring(false);
      setRestoreFile(null);
    }
  }

  if (loadingCats) return <PageLoading message="Carregando configurações..." />;

  return (
    <div className="settings-page" style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-header">
        <h2>Configurações do Sistema</h2>
      </div>

      {/* Seção de Perfil e Tema */}
      <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="icon-badge section-icon-badge blue">
            <i className="fa-solid fa-user-gear" />
          </span>
          Perfil e Preferências
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nome de Exibição</span>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px' }}>{session.name}</p>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Login / Usuário</span>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px' }}>{session.username}</p>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cargo / Permissão</span>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px', textTransform: 'capitalize' }}>{session.role}</p>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pessoa Vinculada</span>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px' }}>{session.person}</p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Tema da Interface</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Atualmente em modo {theme === 'dark' ? 'Escuro' : 'Claro'}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem' }}
          >
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
            Alternar para {theme === 'dark' ? 'Claro' : 'Escuro'}
          </button>
        </div>
      </div>

      {/* Seção de Gestão de Categorias */}
      <div className="settings-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="icon-badge section-icon-badge green">
            <i className="fa-solid fa-tags" />
          </span>
          Categorias Personalizadas
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          Gerencie as opções de categoria disponíveis para classificação de despesas e receitas.
        </p>

        {canManage && (
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
            <input
              type="text"
              placeholder="Nova categoria (ex: Assinaturas, Streaming, Mercado)..."
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-plus" /> Adicionar
            </button>
          </form>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {categories.map((cat) => (
            <span
              key={cat}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                padding: '5px 12px',
                borderRadius: '12px',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
              }}
            >
              {cat}
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(cat)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.8rem',
                    lineHeight: 1,
                  }}
                  title="Remover categoria"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Seção de Backup e Restauração */}
      <div className="settings-section">
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="icon-badge section-icon-badge purple">
            <i className="fa-solid fa-database" />
          </span>
          Backup e Segurança de Dados
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          Exporte uma cópia completa de suas contas, cartões e transações em JSON ou restaure um backup anterior.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportBackup}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 1.2rem' }}
          >
            <i className="fa-solid fa-download" /> Exportar Backup Completo (JSON)
          </button>

          {canManage && (
            <label
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
                margin: 0,
              }}
            >
              <i className="fa-solid fa-upload" /> Restaurar Backup (JSON)
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelected}
                style={{ display: 'none' }}
                disabled={isRestoring}
              />
            </label>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={restoreModalOpen}
        title="Restaurar Backup de Dados"
        message={`Deseja restaurar os dados do arquivo "${restoreFile?.name}"? Os registros contidos no backup serão importados e mesclados no sistema.`}
        confirmLabel="Confirmar Restauração"
        isDestructive={false}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setRestoreModalOpen(false);
          setRestoreFile(null);
        }}
      />
    </div>
  );
}
