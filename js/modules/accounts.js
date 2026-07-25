class AccountsController {
    constructor() {
        this.accounts = window.Storage.get('accounts') || [];
        this.persons = [];
        this.activeTab = 'accounts';
        this.init();
        this.bindEvents();
    }

    init() {
        // Create a default account if empty
        if (this.accounts.length === 0) {
            const defaultAcc = {
                id: 'default_account',
                name: 'Carteira Principal',
                type: 'wallet',
                owner: 'Eduardo',
                balance: 0,
                color: '#6366f1'
            };
            this.accounts.push(defaultAcc);
            window.Storage.saveRecord('accounts', defaultAcc);
        }

        this.loadPersons();
        this.renderAccounts();
        this.renderPersons();
    }

    loadPersons() {
        let stored = window.Storage.get('persons') || [];
        if (stored.length === 0) {
            // Seed initial clean persons list
            const defaultPersons = [
                { id: 'p_eduardo', name: 'Eduardo', color: '#6366f1' },
                { id: 'p_mae', name: 'Mãe', color: '#ec4899' },
                { id: 'p_rodrigo', name: 'Rodrigo', color: '#10b981' }
            ];
            defaultPersons.forEach(p => window.Storage.saveRecord('persons', p));
            stored = defaultPersons;
        }
        this.persons = stored;
        this.populateOwnerSelects();
    }

    populateOwnerSelects() {
        const ownerSelect = document.getElementById('accOwnerSelect');
        if (!ownerSelect) return;

        ownerSelect.innerHTML = '';
        this.persons.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            ownerSelect.appendChild(opt);
        });
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        const btnAcc = document.getElementById('tabBtnAccounts');
        const btnPer = document.getElementById('tabBtnPersons');
        const secAcc = document.getElementById('accountsTabSection');
        const secPer = document.getElementById('personsTabSection');

        if (tabName === 'accounts') {
            if (btnAcc) { btnAcc.className = 'btn btn-sm btn-primary'; }
            if (btnPer) { btnPer.className = 'btn btn-sm btn-ghost'; }
            if (secAcc) secAcc.style.display = 'block';
            if (secPer) secPer.style.display = 'none';
        } else {
            if (btnAcc) { btnAcc.className = 'btn btn-sm btn-ghost'; }
            if (btnPer) { btnPer.className = 'btn btn-sm btn-primary'; }
            if (secAcc) secAcc.style.display = 'none';
            if (secPer) secPer.style.display = 'block';
            this.renderPersons();
        }
    }

    bindEvents() {
        const btnNovo = document.getElementById('btnNovaConta');
        const btnClose = document.getElementById('closeAccountModalBtn');
        const form = document.getElementById('accountForm');

        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                form.reset();
                document.getElementById('editAccountId').value = '';
                document.querySelector('#accountModalTitle').textContent = 'Nova Conta Bancária';
                this.populateOwnerSelects();
                window.UI.openModal('accountModal');
            });
        }
        
        if (btnClose) btnClose.addEventListener('click', () => window.UI.closeModal('accountModal'));
        
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAccount();
                window.UI.closeModal('accountModal');
                form.reset();
            });
        }
        
        // Delete Modal Events
        const closeDeleteBtn = document.getElementById('closeDeleteAccountModalBtn');
        const cancelDeleteBtn = document.getElementById('cancelDeleteAccountBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteAccountBtn');
        
        const closeDeleteModal = () => {
            window.UI.closeModal('deleteAccountModal');
        };
        
        if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteModal);
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => this.confirmDeleteAccount());

        const refreshAccountsHandler = () => {
            this.accounts = window.Storage.get('accounts') || [];
            this.loadPersons();
            this.renderAccounts();
            this.renderPersons();
        };
        window.addEventListener('dataUpdated', refreshAccountsHandler);
        window.addEventListener('fluxo:dataChanged', refreshAccountsHandler);
    }

    openEditModal(id) {
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;

        this.populateOwnerSelects();

        document.getElementById('editAccountId').value = acc.id;
        document.getElementById('accName').value = acc.name;
        document.getElementById('accType').value = acc.type;
        document.getElementById('accOwnerSelect').value = acc.owner || 'Eduardo';
        document.getElementById('accBalance').value = acc.balance;
        document.getElementById('accColor').value = acc.color;

        document.querySelector('#accountModalTitle').textContent = 'Editar Conta Bancária';
        window.UI.openModal('accountModal');
    }

    openDeleteModal(id) {
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;
        
        this.deletingAccountId = id;
        window.UI.openModal('deleteAccountModal');
    }

    async confirmDeleteAccount() {
        if (!this.deletingAccountId) return;
        const id = this.deletingAccountId;
        
        try {
            await window.Storage.deleteRecord('accounts', id);
            this.accounts = this.accounts.filter(a => a.id !== id);
            this.renderAccounts();
            window.UI.closeModal('deleteAccountModal');
            window.UI.showToast('Conta excluída com sucesso!', 'success');
        } catch (e) {
            console.error(e);
            window.UI.showToast('Erro ao excluir conta', 'error');
        }
    }

    saveAccount() {
        const editId = document.getElementById('editAccountId').value;
        const name = document.getElementById('accName').value.trim();
        const type = document.getElementById('accType').value;
        const owner = document.getElementById('accOwnerSelect').value;
        const balanceStr = document.getElementById('accBalance').value;
        const color = document.getElementById('accColor').value;

        if (!name || !owner) {
            window.UI.showToast('Preencha o nome e o titular da conta', 'error');
            return;
        }

        const balance = parseFloat(balanceStr) || 0;

        let acc = {};
        if (editId) {
            const existing = this.accounts.find(a => a.id === editId);
            if (existing) {
                acc = { ...existing, name, type, owner, balance, color };
            }
        } else {
            acc = {
                id: window.Utils.generateId(),
                name,
                type,
                owner,
                balance,
                color
            };
        }

        window.Storage.saveRecord('accounts', acc).then(() => {
            if (editId) {
                const idx = this.accounts.findIndex(a => a.id === editId);
                if (idx !== -1) this.accounts[idx] = acc;
            } else {
                this.accounts.push(acc);
            }
            this.renderAccounts();
            window.UI.showToast('Conta salva com sucesso!', 'success');
        }).catch(err => {
            console.error(err);
            window.UI.showToast('Erro ao salvar conta.', 'error');
        });
    }

    renderAccounts() {
        const container = document.getElementById('accountsContainer');
        if (!container) return;

        container.innerHTML = '';

        let visibleAccounts = this.accounts;
        if (window.currentUser && window.Auth && window.currentUser.role !== 'admin') {
            visibleAccounts = this.accounts.filter(a => window.Auth.canAccessPerson(a.owner));
        }

        const transactions = window.Storage.get('transactions') || [];
        const accountBalances = transactions.reduce((accMap, tx) => {
            if (tx.paymentMethod) {
                if (!accMap[tx.paymentMethod]) accMap[tx.paymentMethod] = 0;
                if (tx.type === 'income') accMap[tx.paymentMethod] += tx.amount;
                else if (tx.type === 'expense') accMap[tx.paymentMethod] -= tx.amount;
            }
            return accMap;
        }, {});

        visibleAccounts.forEach(acc => {
            const card = document.createElement('div');
            card.className = 'account-card glass-panel';
            card.style.borderLeft = `5px solid ${acc.color || '#10b981'}`;

            const calculatedBalance = (acc.balance || 0) + (accountBalances[acc.id] || 0);

            const typeIcons = {
                checking: 'fa-building-columns',
                savings: 'fa-piggy-bank',
                wallet: 'fa-wallet',
                investment: 'fa-chart-line'
            };

            const typeNames = {
                checking: 'Conta Corrente',
                savings: 'Poupança',
                wallet: 'Carteira / Dinheiro Espécie',
                investment: 'Investimentos'
            };

            card.innerHTML = `
                <div class="account-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: ${acc.color || '#10b981'}20; color: ${acc.color || '#10b981'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                            <i class="fa-solid ${typeIcons[acc.type] || 'fa-wallet'}"></i>
                        </div>
                        <div>
                            <div class="account-name" style="font-weight: 600; font-size: 1.05rem;">${window.Utils.escapeHTML(acc.name)}</div>
                            <div class="account-type" style="font-size: 0.78rem; color: var(--text-secondary);">${typeNames[acc.type] || 'Conta'} &bull; Titular: ${window.Utils.escapeHTML(acc.owner || 'Não definido')}</div>
                        </div>
                    </div>
                    <div class="account-actions">
                        <button class="btn btn-ghost primary btn-sm" onclick="window.AccountsApp.openEditModal('${acc.id}')" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn btn-ghost danger btn-sm" onclick="window.AccountsApp.openDeleteModal('${acc.id}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="account-body" style="margin-top: 1rem;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Saldo Atual Calculado</div>
                    <div class="account-balance" style="font-size: 1.4rem; font-weight: 700; color: ${calculatedBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        ${window.Utils.formatCurrency(calculatedBalance)}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        // Always append Add Account Button at end
        const addBtn = document.createElement('div');
        addBtn.className = 'add-account-btn';
        addBtn.id = 'btnNovaConta';
        addBtn.onclick = () => {
            const form = document.getElementById('accountForm');
            if (form) form.reset();
            document.getElementById('editAccountId').value = '';
            document.querySelector('#accountModalTitle').textContent = 'Nova Conta Bancária';
            this.populateOwnerSelects();
            window.UI.openModal('accountModal');
        };
        addBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i><span>Adicionar Nova Conta</span>`;
        container.appendChild(addBtn);
    }

    // ==========================================
    // GESTÃO DE PESSOAS VINCULADAS
    // ==========================================

    openPersonModal() {
        document.getElementById('personForm').reset();
        document.getElementById('personEditId').value = '';
        document.getElementById('personOldName').value = '';
        document.getElementById('personModalTitle').textContent = 'Cadastrar Nova Pessoa';
        window.UI.openModal('personModal');
    }

    openEditPersonModal(id) {
        const p = this.persons.find(item => item.id === id);
        if (!p) return;

        document.getElementById('personEditId').value = p.id;
        document.getElementById('personOldName').value = p.name;
        document.getElementById('personNameInput').value = p.name;
        document.getElementById('personColorInput').value = p.color || '#6366f1';
        document.getElementById('personModalTitle').textContent = 'Editar Pessoa Vinculada';
        window.UI.openModal('personModal');
    }

    async savePerson(e) {
        e.preventDefault();

        const editId = document.getElementById('personEditId').value;
        const oldName = document.getElementById('personOldName').value.trim();
        const newName = document.getElementById('personNameInput').value.trim();
        const color = document.getElementById('personColorInput').value;

        if (!newName) {
            window.UI.showToast('Informe o nome da pessoa.', 'error');
            return;
        }

        // Duplicate check
        const existing = this.persons.find(p => p.name.toLowerCase() === newName.toLowerCase() && p.id !== editId);
        if (existing) {
            window.UI.showToast('Já existe uma pessoa cadastrada com este nome.', 'error');
            return;
        }

        let personRecord = {
            id: editId || `p_${Date.now()}`,
            name: newName,
            color
        };

        try {
            await window.Storage.saveRecord('persons', personRecord);

            // Propagate renaming across all collections if editing existing person name
            if (oldName && oldName.toLowerCase() !== newName.toLowerCase()) {
                const txs = window.Storage.get('transactions') || [];
                txs.forEach(t => {
                    if (t.person && t.person.trim().toLowerCase() === oldName.toLowerCase()) {
                        t.person = newName;
                        window.Storage.saveRecord('transactions', t);
                    }
                });

                const accs = window.Storage.get('accounts') || [];
                accs.forEach(a => {
                    if (a.owner && a.owner.trim().toLowerCase() === oldName.toLowerCase()) {
                        a.owner = newName;
                        window.Storage.saveRecord('accounts', a);
                    }
                });

                const cards = window.Storage.get('cards') || [];
                cards.forEach(c => {
                    if (c.holder && c.holder.trim().toLowerCase() === oldName.toLowerCase()) {
                        c.holder = newName;
                        window.Storage.saveRecord('cards', c);
                    }
                });

                const users = window.Storage.get('users') || [];
                users.forEach(u => {
                    if (u.person && u.person.trim().toLowerCase() === oldName.toLowerCase()) {
                        u.person = newName;
                        window.Storage.saveRecord('users', u);
                    }
                });
            }

            if (window.Audit) {
                window.Audit.log('PERSON_SAVE', { oldName, newName });
            }

            this.loadPersons();
            this.renderPersons();
            this.renderAccounts();
            window.UI.closeModal('personModal');
            window.UI.showToast('Pessoa salva e sincronizada em todo o sistema!', 'success');
        } catch (err) {
            console.error('Erro ao salvar pessoa:', err);
            window.UI.showToast('Erro ao salvar pessoa.', 'error');
        }
    }

    openDeletePersonModal(id) {
        const p = this.persons.find(item => item.id === id);
        if (!p) return;

        if (this.persons.length <= 1) {
            window.UI.showToast('Você deve manter ao menos 1 pessoa vinculada cadastrada no sistema.', 'error');
            return;
        }

        document.getElementById('deletePersonId').value = p.id;
        document.getElementById('deletePersonName').textContent = p.name;

        const select = document.getElementById('deletePersonTransferSelect');
        if (select) {
            select.innerHTML = '';
            this.persons.filter(other => other.id !== id).forEach(other => {
                const opt = document.createElement('option');
                opt.value = other.name;
                opt.textContent = other.name;
                select.appendChild(opt);
            });
        }

        window.UI.openModal('deletePersonModal');
    }

    async confirmDeletePerson() {
        const id = document.getElementById('deletePersonId').value;
        const targetPersonName = document.getElementById('deletePersonTransferSelect')?.value;

        const personObj = this.persons.find(p => p.id === id);
        if (!personObj) return;

        const oldName = personObj.name;

        try {
            // Transfer all linked data to targetPersonName
            if (targetPersonName) {
                const txs = window.Storage.get('transactions') || [];
                txs.forEach(t => {
                    if (t.person && t.person.trim().toLowerCase() === oldName.toLowerCase()) {
                        t.person = targetPersonName;
                        window.Storage.saveRecord('transactions', t);
                    }
                });

                const accs = window.Storage.get('accounts') || [];
                accs.forEach(a => {
                    if (a.owner && a.owner.trim().toLowerCase() === oldName.toLowerCase()) {
                        a.owner = targetPersonName;
                        window.Storage.saveRecord('accounts', a);
                    }
                });

                const cards = window.Storage.get('cards') || [];
                cards.forEach(c => {
                    if (c.holder && c.holder.trim().toLowerCase() === oldName.toLowerCase()) {
                        c.holder = targetPersonName;
                        window.Storage.saveRecord('cards', c);
                    }
                });

                const users = window.Storage.get('users') || [];
                users.forEach(u => {
                    if (u.person && u.person.trim().toLowerCase() === oldName.toLowerCase()) {
                        u.person = targetPersonName;
                        window.Storage.saveRecord('users', u);
                    }
                });
            }

            await window.Storage.deleteRecord('persons', id);

            if (window.Audit) {
                window.Audit.log('PERSON_DELETE', { id, name: oldName, transferredTo: targetPersonName });
            }

            this.loadPersons();
            this.renderPersons();
            this.renderAccounts();
            window.UI.closeModal('deletePersonModal');
            window.UI.showToast('Pessoa excluída e histórico transferido com sucesso!', 'success');
        } catch (err) {
            console.error('Erro ao excluir pessoa:', err);
            window.UI.showToast('Erro ao excluir pessoa.', 'error');
        }
    }

    renderPersons() {
        const container = document.getElementById('personsContainer');
        if (!container) return;

        container.innerHTML = '';

        const txs = window.Storage.get('transactions') || [];
        const accs = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        const users = window.Storage.get('users') || [];

        this.persons.forEach(p => {
            const pNameClean = p.name.trim().toLowerCase();
            const txCount = txs.filter(t => t.person && t.person.trim().toLowerCase() === pNameClean).length;
            const accCount = accs.filter(a => a.owner && a.owner.trim().toLowerCase() === pNameClean).length;
            const cardCount = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === pNameClean).length;
            const userCount = users.filter(u => u.person && u.person.trim().toLowerCase() === pNameClean).length;

            const card = document.createElement('div');
            card.className = 'account-card glass-panel';
            card.style.borderLeft = `5px solid ${p.color || '#6366f1'}`;

            card.innerHTML = `
                <div class="account-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 42px; height: 42px; border-radius: 50%; background: ${p.color || '#6366f1'}20; color: ${p.color || '#6366f1'}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; border: 2px solid ${p.color || '#6366f1'};">
                            ${window.Utils.escapeHTML(p.name.substring(0, 2).toUpperCase())}
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary);">${window.Utils.escapeHTML(p.name)}</div>
                            <div style="font-size: 0.78rem; color: var(--text-secondary);">${userCount > 0 ? '<i class="fa-solid fa-user-check" style="color: var(--success); margin-right: 3px;"></i> Usuário do Sistema' : 'Titular Vinculado'}</div>
                        </div>
                    </div>
                    <div class="account-actions">
                        <button class="btn btn-ghost primary btn-sm" onclick="window.AccountsApp.openEditPersonModal('${p.id}')" title="Editar / Renomear"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                        <button class="btn btn-ghost danger btn-sm" onclick="window.AccountsApp.openDeletePersonModal('${p.id}')" title="Excluir / Mesclar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="account-body" style="margin-top: 1rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; background: var(--bg-primary); padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary);">
                        <i class="fa-solid fa-money-bill-transfer" style="color: var(--accent-primary);"></i> <strong>${txCount}</strong> lançamentos
                    </span>
                    <span style="font-size: 0.75rem; background: var(--bg-primary); padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary);">
                        <i class="fa-solid fa-wallet" style="color: var(--success);"></i> <strong>${accCount}</strong> contas
                    </span>
                    <span style="font-size: 0.75rem; background: var(--bg-primary); padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary);">
                        <i class="fa-solid fa-credit-card" style="color: #ec4899;"></i> <strong>${cardCount}</strong> cartões
                    </span>
                </div>
            `;
            container.appendChild(card);
        });

        // Append Add Person Button
        const addBtn = document.createElement('div');
        addBtn.className = 'add-account-btn';
        addBtn.onclick = () => this.openPersonModal();
        addBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i><span>Cadastrar Nova Pessoa</span>`;
        container.appendChild(addBtn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.AccountsApp = new AccountsController();
});
