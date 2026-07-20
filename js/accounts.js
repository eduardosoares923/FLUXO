class AccountsController {
    constructor() {
        this.accounts = window.Storage.get('accounts') || [];
        this.init();
        this.bindEvents();
    }

    init() {
        // Create a default account if empty
        if (this.accounts.length === 0) {
            this.accounts.push({
                id: 'default_account',
                name: 'Carteira Principal',
                type: 'wallet',
                owner: 'Eu',
                balance: 0,
                color: '#6366f1'
            });
            window.Storage.set('accounts', this.accounts);
        }
        this.renderAccounts();
    }

    bindEvents() {
        const btnNovo = document.getElementById('btnNovaConta');
        const btnClose = document.getElementById('closeAccountModalBtn');
        const modal = document.getElementById('accountModal');
        const form = document.getElementById('accountForm');

        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                form.reset();
                document.getElementById('editAccountId').value = '';
                document.querySelector('#accountModal .modal-title').textContent = 'Nova Conta Bancária';
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
                
                const isEdit = document.getElementById('editAccountId').value !== '';
                window.UI.showToast(isEdit ? 'Conta atualizada com sucesso!' : 'Conta adicionada com sucesso!', 'success');
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
        
        const actionRadios = document.querySelectorAll('input[name="deleteAccountAction"]');
        const transferSelect = document.getElementById('deleteAccountTransferSelect');
        if (actionRadios && transferSelect) {
            actionRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    transferSelect.style.display = e.target.value === 'transfer' ? 'block' : 'none';
                });
            });
        }
    }

    openEditModal(id) {
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;

        document.getElementById('editAccountId').value = acc.id;
        document.getElementById('accName').value = acc.name;
        document.getElementById('accType').value = acc.type;
        document.getElementById('accOwner').value = acc.owner;
        document.getElementById('accBalance').value = acc.balance;
        document.getElementById('accColor').value = acc.color;

        document.querySelector('#accountModal .modal-title').textContent = 'Editar Conta';
        window.UI.openModal('accountModal');
    }

    openDeleteModal(id) {
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;
        
        if (this.accounts.length === 1) {
            window.UI.showToast('Você precisa ter pelo menos uma conta bancária.', 'error');
            return;
        }

        document.getElementById('deleteAccountIdInput').value = acc.id;
        document.getElementById('deleteAccountName').textContent = acc.name;
        
        const transactions = window.Storage.get('transactions') || [];
        const linkedTransactions = transactions.filter(tx => 
            tx.paymentMethod === `acc_${acc.id}` || (acc.id === 'default_account' && tx.paymentMethod === 'account')
        );
        
        const warningEl = document.getElementById('deleteAccountWarning');
        const countEl = document.getElementById('deleteAccountTxCount');
        const optionsEl = document.getElementById('deleteAccountOptions');
        const selectEl = document.getElementById('deleteAccountTransferSelect');
        const radioDelete = document.getElementById('actionDeleteTx');
        
        if (linkedTransactions.length > 0) {
            countEl.textContent = linkedTransactions.length;
            warningEl.style.display = 'block';
            optionsEl.style.display = 'block';
            radioDelete.checked = true;
            selectEl.style.display = 'none';
            
            // Populate transfer options
            selectEl.innerHTML = '';
            this.accounts.filter(a => a.id !== id).forEach(a => {
                const opt = document.createElement('option');
                opt.value = `acc_${a.id}`;
                opt.textContent = a.name;
                selectEl.appendChild(opt);
            });
        } else {
            warningEl.style.display = 'none';
            optionsEl.style.display = 'none';
        }
        
        window.UI.openModal('deleteAccountModal');
    }

    confirmDeleteAccount() {
        const id = document.getElementById('deleteAccountIdInput').value;
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;
        
        const transactions = window.Storage.get('transactions') || [];
        const linkedTransactions = transactions.filter(tx => 
            tx.paymentMethod === `acc_${acc.id}` || (acc.id === 'default_account' && tx.paymentMethod === 'account')
        );
        
        if (linkedTransactions.length > 0) {
            const action = document.querySelector('input[name="deleteAccountAction"]:checked').value;
            if (action === 'delete') {
                const newTransactions = transactions.filter(tx => 
                    !(tx.paymentMethod === `acc_${acc.id}` || (acc.id === 'default_account' && tx.paymentMethod === 'account'))
                );
                window.Storage.set('transactions', newTransactions);
            } else if (action === 'transfer') {
                const targetAccVal = document.getElementById('deleteAccountTransferSelect').value;
                transactions.forEach(tx => {
                    if (tx.paymentMethod === `acc_${acc.id}` || (acc.id === 'default_account' && tx.paymentMethod === 'account')) {
                        tx.paymentMethod = targetAccVal;
                    }
                });
                window.Storage.set('transactions', transactions);
            }
        }
        
        this.accounts = this.accounts.filter(a => a.id !== id);
        window.Storage.set('accounts', this.accounts);
        
        window.UI.closeModal('deleteAccountModal');
        this.renderAccounts();
        window.UI.showToast('Conta bancária excluída com sucesso.', 'success');
    }

    saveAccount() {
        const editId = document.getElementById('editAccountId').value;
        const name = document.getElementById('accName').value;
        const type = document.getElementById('accType').value;
        const owner = document.getElementById('accOwner').value;
        const balance = parseFloat(document.getElementById('accBalance').value);
        const color = document.getElementById('accColor').value;

        if (editId) {
            const index = this.accounts.findIndex(a => a.id === editId);
            if (index !== -1) {
                // If the balance changed, we might want to create a transaction, but for simplicity we just update it.
                this.accounts[index] = { ...this.accounts[index], name, type, owner, balance, color };
            }
        } else {
            const acc = {
                id: window.Utils.generateId(),
                name,
                type,
                owner,
                balance,
                color
            };
            this.accounts.push(acc);
        }

        window.Storage.set('accounts', this.accounts);
        this.renderAccounts();
    }

    renderAccounts() {
        const container = document.getElementById('accountsContainer');
        if (!container) return;

        const addBtn = document.getElementById('btnNovaConta');
        container.innerHTML = '';

        // Let's compute actual balance from transactions!
        const transactions = window.Storage.get('transactions') || [];

        const accountBalances = transactions.reduce((accMap, tx) => {
            if (tx.paymentMethod) {
                if (!accMap[tx.paymentMethod]) accMap[tx.paymentMethod] = 0;
                if (tx.type === 'income') accMap[tx.paymentMethod] += tx.amount;
                else if (tx.type === 'expense') accMap[tx.paymentMethod] -= tx.amount;
            }
            return accMap;
        }, {});

        this.accounts.forEach(acc => {
            
            // Re-calculate the current balance of this specific account based on transactions
            // The initial balance is a starting point
            const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
            let currentBalance = acc.balance + (accountBalances[accIdStr] || 0);

            const cardEl = document.createElement('div');
            cardEl.className = 'account-card';
            
            let icon = 'fa-building-columns';
            if (acc.type === 'wallet') icon = 'fa-wallet';
            if (acc.type === 'savings') icon = 'fa-piggy-bank';
            if (acc.type === 'investment') icon = 'fa-chart-line';

            cardEl.innerHTML = `
                <div class="account-header">
                    <div class="account-icon" style="background-color: ${window.Utils.escapeHTML(acc.color)};">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <div class="account-title-group">
                        <div class="account-name">${window.Utils.escapeHTML(acc.name)}</div>
                        <div class="account-owner">Titular: ${window.Utils.escapeHTML(acc.owner)}</div>
                    </div>
                </div>
                <div class="account-balance-group">
                    <div class="balance-label">Saldo Atual</div>
                    <div class="balance-value">${window.Utils.formatCurrency(currentBalance)}</div>
                </div>
                <div class="account-actions">
                    <button class="btn btn-secondary btn-sm" onclick="window.accountsController.openEditModal('${window.Utils.escapeHTML(acc.id)}')">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.accountsController.openDeleteModal('${window.Utils.escapeHTML(acc.id)}')">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </div>
            `;
            container.appendChild(cardEl);
        });

        if (addBtn) container.appendChild(addBtn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('accountsContainer')) {
        window.accountsController = new AccountsController();
    }
});
