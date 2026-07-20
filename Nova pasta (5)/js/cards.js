class CardsController {
    constructor() {
        this.cards = window.Storage.get('cards') || [];
        this.init();
        this.bindEvents();
    }

    init() {
        this.renderCards();
    }

    bindEvents() {
        const btnNovo = document.getElementById('btnNovoCartao');
        const btnClose = document.getElementById('closeCardModalBtn');
        const modal = document.getElementById('cardModal');
        const form = document.getElementById('cardForm');

        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                form.reset();
                document.getElementById('editCardId').value = '';
                document.querySelector('#cardModal .modal-title').textContent = 'Novo Cartão de Crédito';
                window.UI.openModal('cardModal');
            });
        }
        if (btnClose) btnClose.addEventListener('click', () => window.UI.closeModal('cardModal'));
        
        const invoiceModal = document.getElementById('invoiceModal');
        const btnCloseInvoice = document.getElementById('closeInvoiceModalBtn');
        if (btnCloseInvoice && invoiceModal) {
            btnCloseInvoice.addEventListener('click', () => window.UI.closeModal('invoiceModal'));
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCard();
            });
        }
        
        // Event Delegation para ações dos cartões
        const container = document.getElementById('cardsContainer');
        if (container) {
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                
                if (action === 'invoice') this.openInvoiceModal(id);
                if (action === 'edit') this.openEditModal(id);
                if (action === 'delete') this.deleteCard(id);
            });
        }
    }

    openEditModal(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card) return;

        document.getElementById('editCardId').value = card.id;
        document.getElementById('cardName').value = card.name;
        document.getElementById('cardBrand').value = card.brand;
        document.getElementById('cardHolder').value = card.holder;
        document.getElementById('cardLimit').value = card.limit;
        document.getElementById('cardColor').value = card.color;
        document.getElementById('cardCloseDay').value = card.closeDay;
        document.getElementById('cardDueDay').value = card.dueDay;

        document.querySelector('#cardModal .modal-title').textContent = 'Editar Cartão';
        window.UI.openModal('cardModal');
    }

    openInvoiceModal(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card) return;

        document.getElementById('invoiceModalTitle').textContent = `Fatura: ${card.name}`;
        
        const listEl = document.getElementById('invoiceTransactionList');
        listEl.innerHTML = '';

        const allTransactions = window.Storage.get('transactions') || [];
        // Filter transactions for this card
        const cardTransactions = allTransactions.filter(tx => tx.paymentMethod === `card_${id}`);

        if (cardTransactions.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma compra registrada neste cartão.</div>`;
        } else {
            // Sort newest first
            cardTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            cardTransactions.forEach(tx => {
                const iconBg = 'expense'; // Cartão geralmente é despesa
                const iconClass = 'fa-arrow-down';
                const sign = '-';

                const item = document.createElement('div');
                item.className = 'transaction-item';
                item.innerHTML = `
                    <div class="tx-info">
                        <div class="tx-icon ${iconBg}">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div class="tx-details">
                            <span class="tx-desc">${window.Utils.escapeHTML(tx.description)}</span>
                            <span class="tx-date">${window.Utils.formatDate(tx.date)} &bull; ${window.Utils.escapeHTML(tx.category)}</span>
                        </div>
                    </div>
                    <div class="tx-amount ${iconBg}">${sign} ${window.Utils.formatCurrency(tx.amount)}</div>
                `;
                listEl.appendChild(item);
            });
        }

        window.UI.openModal('invoiceModal');
    }

    saveCard() {
        const editId = document.getElementById('editCardId').value;
        const name = document.getElementById('cardName').value.trim();
        const brand = document.getElementById('cardBrand').value.trim();
        const holder = document.getElementById('cardHolder').value.trim();
        const limitStr = document.getElementById('cardLimit').value;
        const color = document.getElementById('cardColor').value;
        const closeDay = parseInt(document.getElementById('cardCloseDay').value);
        const dueDay = parseInt(document.getElementById('cardDueDay').value);

        if (!name || !brand || !holder || !limitStr) {
            window.UI.showToast('Preencha os campos obrigatórios', 'error');
            return;
        }

        const limit = parseFloat(limitStr);

        if (editId) {
            const index = this.cards.findIndex(c => c.id === editId);
            if (index !== -1) {
                this.cards[index] = {
                    ...this.cards[index],
                    name, brand, holder, limit, color, closeDay, dueDay
                };
            }
        } else {
            const last4 = Math.floor(1000 + Math.random() * 9000);
            this.cards.push({
                id: window.Utils.generateId(),
                name, brand, holder, limit,
                usedLimit: 0, color, closeDay, dueDay, last4
            });
        }

        window.Storage.set('cards', this.cards);
        this.renderCards();
        
        window.UI.closeModal('cardModal');
        const form = document.getElementById('cardForm');
        if (form) form.reset();
        
        window.UI.showToast(editId ? 'Cartão atualizado com sucesso!' : 'Cartão adicionado com sucesso!', 'success');
    }

    deleteCard(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card) return;
        
        window.UI.confirmDialog(`Tem certeza que deseja excluir o cartão ${card.name}? Isso não excluirá as transações vinculadas a ele.`, 'Confirmação', () => {
            this.cards = this.cards.filter(c => c.id !== id);
            window.Storage.set('cards', this.cards);
            this.renderCards();
            window.UI.showToast('Cartão excluído com sucesso!', 'success');
        });
    }

    renderCards() {
        const container = document.getElementById('cardsContainer');
        if (!container) return;

        // Limpa tudo exceto o botão de adicionar
        const addBtn = document.getElementById('btnNovoCartao');
        container.innerHTML = '';

        this.cards.forEach(card => {
            const available = card.limit - card.usedLimit;
            const percentage = (card.usedLimit / card.limit) * 100;
            
            let barClass = 'safe';
            if (percentage > 80) barClass = 'danger';
            else if (percentage > 50) barClass = 'warning';

            const cardEl = document.createElement('div');
            cardEl.className = 'card-wrapper';
            cardEl.innerHTML = `
                <div class="credit-card" style="background-color: ${card.color};">
                    <div class="card-bank">
                        <span>${window.Utils.escapeHTML(card.name)}</span>
                        <i class="fa-solid fa-wifi" style="transform: rotate(90deg);"></i>
                    </div>
                    <div class="card-chip"></div>
                    <div class="card-number">**** **** **** ${card.last4}</div>
                    <div class="card-footer">
                        <div class="card-holder">${window.Utils.escapeHTML(card.holder)}</div>
                        <div class="card-brand">${window.Utils.escapeHTML(card.brand)}</div>
                    </div>
                </div>
                <div class="card-details">
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <button class="btn btn-primary btn-sm" data-action="invoice" data-id="${card.id}">
                            <i class="fa-solid fa-list"></i> Fatura
                        </button>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Limite Total</span>
                        <span class="detail-value">${window.Utils.formatCurrency(card.limit)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Limite Disponível</span>
                        <span class="detail-value" style="color: var(--success);">${window.Utils.formatCurrency(available)}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar ${barClass}" style="width: ${percentage}%"></div>
                    </div>
                    <div class="detail-row" style="margin-top: 1rem;">
                        <span class="detail-label">Fatura Atual (Usado)</span>
                        <span class="detail-value">${window.Utils.formatCurrency(card.usedLimit)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Vencimento</span>
                        <span class="detail-value">Dia ${card.dueDay}</span>
                    </div>
                </div>
                <div class="card-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; padding: 1rem; border-top: 1px solid var(--glass-border);">
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${card.id}">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${card.id}">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </div>
            `;
            container.appendChild(cardEl);
        });

        // Recoloca o botão no final
        if (addBtn) container.appendChild(addBtn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('cardsContainer')) {
        window.cardsController = new CardsController();
    }
});
