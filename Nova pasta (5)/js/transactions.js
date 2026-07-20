class TransactionsController {
    constructor() {
        let globalTx = window.Storage.get('transactions') || [];
        
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                globalTx = globalTx.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
            }
        }
        
        this.allTransactions = globalTx;
        this.filteredTransactions = [...this.allTransactions];
        this.accounts = window.Storage.get('accounts') || [];
        this.cards = window.Storage.get('cards') || [];
        
        this.init();
        this.bindEvents();
    }

    init() {
        this.renderTable();
    }

    bindEvents() {
        const searchInput = document.getElementById('searchFilter');
        const typeSelect = document.getElementById('typeFilter');
        const catSelect = document.getElementById('categoryFilter');
        const btnFilter = document.getElementById('btnFilter');
        
        window.addEventListener('dataUpdated', () => {
            let globalTx = window.Storage.get('transactions') || [];
            if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
                if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                    globalTx = globalTx.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
                }
            }
            this.allTransactions = globalTx;
            this.filteredTransactions = [...this.allTransactions];
            this.renderTable();
        });

        const applyFilters = () => {
            const search = searchInput.value.toLowerCase();
            const type = typeSelect.value;
            const cat = catSelect.value;

            this.filteredTransactions = this.allTransactions.filter(tx => {
                const matchSearch = tx.description.toLowerCase().includes(search);
                const matchType = type === 'all' || tx.type === type;
                const matchCat = cat === 'all' || tx.category === cat;
                return matchSearch && matchType && matchCat;
            });

            // Sort newest first
            this.filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        };

        if (btnFilter) btnFilter.addEventListener('click', applyFilters);
        if (searchInput) searchInput.addEventListener('keyup', (e) => { if(e.key === 'Enter') applyFilters(); });
        
        // Event Delegation for Table Actions
        const tbody = document.getElementById('transactionsTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="delete"]');
                if (btn) {
                    this.deleteTransaction(btn.dataset.id);
                }
            });
        }
        
        const btnDeleteAll = document.getElementById('btnDeleteAllTransactions');
        if (btnDeleteAll) {
            btnDeleteAll.addEventListener('click', () => {
                if (this.allTransactions.length === 0) {
                    window.UI.showToast('Nenhum lançamento para excluir.', 'warning');
                    return;
                }
                
                window.UI.confirmDialog('Tem certeza que deseja EXCLUIR TODOS os lançamentos? Esta ação não pode ser desfeita!', 'Atenção Crítica', () => {
                    window.Storage.set('transactions', []);
                    this.allTransactions = [];
                    this.filteredTransactions = [];
                    this.renderTable();
                    window.UI.showToast('Todos os lançamentos foram excluídos com sucesso.', 'success');
                });
            });
        }
    }

    getPaymentMethodName(methodStr) {
        if (!methodStr || methodStr === 'account') {
            const defaultAcc = this.accounts.find(a => a.id === 'default_account');
            return defaultAcc ? defaultAcc.name : 'Conta Corrente';
        }
        
        if (methodStr.startsWith('acc_')) {
            const id = methodStr.replace('acc_', '');
            const acc = this.accounts.find(a => a.id === id);
            return acc ? acc.name : 'Conta Desconhecida';
        }
        
        if (methodStr.startsWith('card_')) {
            const id = methodStr.replace('card_', '');
            const card = this.cards.find(c => c.id === id);
            return card ? `Cartão ${card.name}` : 'Cartão Desconhecido';
        }
        
        return methodStr;
    }

    deleteTransaction(id) {
        window.UI.confirmDialog('Deseja realmente excluir este lançamento? Esta ação afeta seu saldo e limites de cartão.', 'Confirmação', () => {
            const txIndex = this.allTransactions.findIndex(t => t.id === id);
            if (txIndex > -1) {
                const tx = this.allTransactions[txIndex];
                
                // Refund credit card limits if it was a card expense
                if (tx.paymentMethod && tx.paymentMethod.startsWith('card_') && tx.type === 'expense') {
                    const cardId = tx.paymentMethod.replace('card_', '');
                    const cardIndex = this.cards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        this.cards[cardIndex].usedLimit -= tx.amount;
                        if (this.cards[cardIndex].usedLimit < 0) this.cards[cardIndex].usedLimit = 0;
                        window.Storage.set('cards', this.cards);
                    }
                }
                
                // Remove from array and global storage
                this.allTransactions.splice(txIndex, 1);
                
                let globalTx = window.Storage.get('transactions') || [];
                const globalIndex = globalTx.findIndex(t => t.id === id);
                if (globalIndex > -1) {
                    globalTx.splice(globalIndex, 1);
                    window.Storage.set('transactions', globalTx);
                }
                
                window.UI.showToast('Lançamento excluído com sucesso!', 'success');
                
                // Re-apply filters to update UI
                document.getElementById('btnFilter').click();
            }
        });
    }

    renderTable() {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.filteredTransactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum lançamento encontrado.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        const limit = 100;
        const txsToRender = this.filteredTransactions.slice(0, limit);

        txsToRender.forEach(tx => {
            const isIncome = tx.type === 'income';
            const badgeClass = isIncome ? 'income' : 'expense';
            const badgeText = isIncome ? 'Receita' : 'Despesa';
            const sign = isIncome ? '+' : '-';
            const amountColor = isIncome ? 'var(--success)' : 'var(--text-primary)';

            htmlBuffer += `
                <tr>
                    <td>${window.Utils.formatDate(tx.date)}</td>
                    <td style="font-weight: 500;">${window.Utils.escapeHTML(tx.description)}</td>
                    <td>${window.Utils.escapeHTML(tx.category)}</td>
                    <td>${window.Utils.escapeHTML(this.getPaymentMethodName(tx.paymentMethod))}</td>
                    <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
                    <td style="color: ${amountColor}; font-weight: 600;">${sign} ${window.Utils.formatCurrency(tx.amount)}</td>
                    <td class="tx-actions">
                        <button class="btn btn-ghost danger btn-sm" title="Excluir" data-action="delete" data-id="${tx.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        if (this.filteredTransactions.length > limit) {
            htmlBuffer += `<tr><td colspan="7" style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">Mostrando os 100 lançamentos mais recentes. Use os filtros acima para buscar lançamentos mais antigos.</td></tr>`;
        }
        
        tbody.innerHTML = htmlBuffer;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('transactionsTableBody')) {
        window.transactionsController = new TransactionsController();
    }
});
