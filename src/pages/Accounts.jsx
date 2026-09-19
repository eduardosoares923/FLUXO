import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, normalize } from '../utils/format';
import { accountSchema, personSchema } from '../schemas/financialSchemas';
import { PageLoading } from '../components/StateFeedback';

export default function Accounts() {
  const { session, hasPermission, canAccessPerson } = useAuth();
  
  // Dados do Firestore
  const { data: accounts, loading: loadingAcc, saveRecord: saveAcc, deleteRecord: deleteAcc } = useCollection('accounts');
  const { data: persons, loading: loadingPers, saveRecord: savePers, deleteRecord: deletePers } = useCollection('persons');
  
  // Estado de interface
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'persons'
  const [showAccForm, setShowAccForm] = useState(false);
  const [showPersForm, setShowPersForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const canEdit = hasPermission('accounts', 'edit');
  const visibleAccounts = session.role === 'admin' ? accounts : accounts.filter((a) => canAccessPerson(a.owner));

  // Formulário de Contas
  const formAcc = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: '', bank: '', balance: 0, owner: '' }
  });

  // Formulário de Pessoas
  const formPers = useForm({
    resolver: zodResolver(personSchema),
    defaultValues: { name: '', color: '#4d8dff' }
  });

  // ---- HANDLERS DE CONTA ----
  function openAccNew() {
    formAcc.reset({ name: '', bank: '', balance: 0, owner: '' });
    setEditingId(null);
    setShowAccForm(true);
  }

  function openAccEdit(acc) {
    formAcc.reset({ name: acc.name || '', bank: acc.bank || '', balance: acc.balance || 0, owner: acc.owner || '' });
    setEditingId(acc.id);
    setShowAccForm(true);
  }

  async function onSaveAcc(data) {
    const owner = data.owner || session.person || 'Eu';
    await saveAcc({
      id: editingId || undefined,
      name: data.name,
      bank: data.bank,
      balance: data.balance,
      owner,
      ownerKey: normalize(owner),
    });
    setShowAccForm(false);
  }

  // ---- HANDLERS DE PESSOA ----
  function openPersNew() {
    formPers.reset({ name: '', color: '#4d8dff' });
    setEditingId(null);
    setShowPersForm(true);
  }

  function openPersEdit(p) {
    formPers.reset({ name: p.name || '', color: p.color || '#4d8dff' });
    setEditingId(p.id);
    setShowPersForm(true);
  }

  async function onSavePers(data) {
    await savePers({
      id: editingId || undefined,
      name: data.name,
      color: data.color,
      normalizedName: normalize(data.name),
    });
    setShowPersForm(false);
  }

  if (loadingAcc || loadingPers) return <PageLoading />;

  return (
    <div className="accounts-page">
      <div className="page-header" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <div className="month-nav" style={{ flex: 1 }}>
          <button 
            className={activeTab === 'accounts' ? 'btn btn-primary' : 'btn btn-ghost'} 
            onClick={() => setActiveTab('accounts')}
            style={{ borderRadius: '12px' }}
          >
            Contas Bancárias
          </button>
          <button 
            className={activeTab === 'persons' ? 'btn btn-primary' : 'btn btn-ghost'} 
            onClick={() => setActiveTab('persons')}
            style={{ borderRadius: '12px' }}
          >
            Pessoas
          </button>
        </div>
        
        {canEdit && activeTab === 'accounts' && (
          <button className="btn btn-primary" onClick={openAccNew}>
            <i className="fa-solid fa-plus" /> Nova conta
          </button>
        )}
        {canEdit && activeTab === 'persons' && (
          <button className="btn btn-primary" onClick={openPersNew}>
            <i className="fa-solid fa-plus" /> Nova pessoa
          </button>
        )}
      </div>

      {/* ABA DE CONTAS */}
      {activeTab === 'accounts' && (
        <div className="accounts-grid">
          {visibleAccounts.map((acc) => (
            <div className="account-card" key={acc.id}>
              <div className="account-card-header">
                <div className="account-card-title">
                  <span className="icon-badge account-icon">
                    <i className="fa-solid fa-building-columns" />
                  </span>
                  <strong>{acc.name}</strong>
                </div>
                {canEdit && (
                  <div className="card-actions">
                    <button onClick={() => openAccEdit(acc)}><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => { if(confirm('Excluir esta conta?')) deleteAcc(acc.id); }}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                )}
              </div>
              <span className="account-bank" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{acc.bank}</span>
              <span className="account-balance" style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{formatCurrency(acc.balance)}</span>
              {acc.owner && <span className="account-owner" style={{ fontSize: '0.8rem', opacity: 0.8 }}>Resp: {acc.owner}</span>}
            </div>
          ))}
          {visibleAccounts.length === 0 && <p className="empty-state">Nenhuma conta cadastrada.</p>}
        </div>
      )}

      {/* ABA DE PESSOAS */}
      {activeTab === 'persons' && (
        <div className="accounts-grid">
          {persons.map((p) => (
            <div className="account-card" key={p.id}>
              <div className="account-card-header">
                <div className="account-card-title">
                  <span className="icon-badge" style={{ backgroundColor: p.color + '25', color: p.color }}>
                    <i className="fa-solid fa-user" />
                  </span>
                  <strong>{p.name}</strong>
                </div>
                {canEdit && (
                  <div className="card-actions">
                    <button onClick={() => openPersEdit(p)}><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => { if(confirm('Excluir esta pessoa?')) deletePers(p.id); }}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {persons.length === 0 && <p className="empty-state">Nenhuma pessoa cadastrada.</p>}
        </div>
      )}

      {/* MODAL DE CONTAS */}
      {showAccForm && (
        <div className="modal-backdrop" onClick={() => setShowAccForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={formAcc.handleSubmit(onSaveAcc)}>
            <h3>{editingId ? 'Editar conta' : 'Nova conta'}</h3>
            
            <label>Nome da Conta</label>
            <input {...formAcc.register('name')} placeholder="Ex: Nubank, Carteira..." />
            {formAcc.formState.errors.name && <span className="login-error">{formAcc.formState.errors.name.message}</span>}

            <label>Banco (opcional)</label>
            <input {...formAcc.register('bank')} />

            <label>Saldo inicial</label>
            <input type="number" step="0.01" {...formAcc.register('balance')} />

            <label>Pessoa (Dono)</label>
            <select {...formAcc.register('owner')}>
              <option value="">Selecione...</option>
              {persons.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAccForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={formAcc.formState.isSubmitting}>Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE PESSOAS */}
      {showPersForm && (
        <div className="modal-backdrop" onClick={() => setShowPersForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={formPers.handleSubmit(onSavePers)}>
            <h3>{editingId ? 'Editar Pessoa' : 'Nova Pessoa'}</h3>
            
            <label>Nome</label>
            <input {...formPers.register('name')} placeholder="Ex: Eduardo, Mãe..." />
            {formPers.formState.errors.name && <span className="login-error">{formPers.formState.errors.name.message}</span>}

            <label>Cor de identificação</label>
            <input type="color" {...formPers.register('color')} style={{ width: '100%', height: '45px', padding: '2px', cursor: 'pointer' }} />

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowPersForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={formPers.formState.isSubmitting}>Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
