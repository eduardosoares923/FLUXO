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

        const refreshCardsHandler = () => {
            this.cards = window.Storage.get('cards') || [];
            this.renderCards();
        };
        window.addEventListener('dataUpdated', refreshCardsHandler);
        window.addEventListener('fluxo:dataChanged', refreshCardsHandler);
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

        document.getElementById('invoiceModalTitle').textContent = `Fatura: ${card.name} (Dia ${card.closeDay || 1} / Venc. ${card.dueDay || 10})`;
        
        const listEl = document.getElementById('invoiceTransactionList');
        listEl.innerHTML = '';

        const allTransactions = window.Storage.get('transactions') || [];
        const cardTransactions = allTransactions.filter(tx => tx.paymentMethod === `card_${id}`);
        const totalInvoice = cardTransactions.reduce((sum, tx) => sum + (tx.type === 'expense' ? parseFloat(tx.amount) : -parseFloat(tx.amount)), 0);

        if (cardTransactions.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma compra registrada neste cartão.</div>`;
        } else {
            const headerInfo = document.createElement('div');
            headerInfo.style.cssText = 'padding: 0.75rem 1rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border);';
            headerInfo.innerHTML = `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Total Utilizado na Fatura</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--danger);">${window.Utils.formatCurrency(totalInvoice)}</div>
                </div>
                <div style="font-size: 0.8rem; text-align: right; color: var(--text-secondary);">
                    <div>Fechamento: <strong>Dia ${card.closeDay || 1}</strong></div>
                    <div>Vencimento: <strong style="color: var(--accent-primary);">Dia ${card.dueDay || 10}</strong></div>
                </div>
            `;
            listEl.appendChild(headerInfo);

            cardTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            cardTransactions.forEach(tx => {
                const isExpense = tx.type === 'expense';
                const iconBg = isExpense ? 'expense' : 'income';
                const iconClass = isExpense ? 'fa-arrow-down' : 'fa-arrow-up';
                const sign = isExpense ? '-' : '+';
                const color = isExpense ? 'var(--danger)' : 'var(--success)';

                const dueMonthStr = window.Utils.getCardInvoiceMonth ? window.Utils.getCardInvoiceMonth(tx.date, card.closeDay || 1, card.dueDay || 10) : '';
                let dueBadge = '';
                if (dueMonthStr) {
                    const [dYear, dMonth] = dueMonthStr.split('-');
                    dueBadge = `<span style="font-size: 0.7rem; background: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600; display: inline-block; margin-top: 0.2rem;">Venc. ${card.dueDay}/${dMonth}/${dYear}</span>`;
                }

                const item = document.createElement('div');
                item.className = 'transaction-item';
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--glass-border);';
                item.innerHTML = `
                    <div class="tx-info" style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="tx-icon ${iconBg}" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${isExpense ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; color: ${color}; flex-shrink: 0;">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div class="tx-details">
                            <div class="tx-desc" style="font-weight: 600; font-size: 0.9rem;">${window.Utils.escapeHTML(tx.description)}</div>
                            <div class="tx-date" style="font-size: 0.75rem; color: var(--text-secondary);">${window.Utils.formatDate(tx.date)} &bull; ${window.Utils.escapeHTML(tx.category)}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="tx-amount ${iconBg}" style="font-weight: 700; font-size: 0.95rem; color: ${color};">${sign} ${window.Utils.formatCurrency(tx.amount)}</div>
                        ${dueBadge}
                    </div>
                `;
                listEl.appendChild(item);
            });
        }

        window.UI.openModal('invoiceModal');
    }

    async saveCard() {
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
        let cardToSave = null;

        if (editId) {
            const index = this.cards.findIndex(c => c.id === editId);
            if (index !== -1) {
                this.cards[index] = {
                    ...this.cards[index],
                    name, brand, holder, limit, color, closeDay, dueDay
                };
                cardToSave = this.cards[index];
            }
        } else {
            const last4 = Math.floor(1000 + Math.random() * 9000);
            cardToSave = {
                id: window.Utils.generateId(),
                name, brand, holder, limit,
                usedLimit: 0, color, closeDay, dueDay, last4
            };
            this.cards.push(cardToSave);
        }

        if (cardToSave) {
            try {
                await window.Storage.saveRecord('cards', cardToSave);
                this.renderCards();
                
                window.UI.closeModal('cardModal');
                const form = document.getElementById('cardForm');
                if (form) form.reset();
                
                window.UI.showToast(editId ? 'Cartão atualizado com sucesso!' : 'Cartão adicionado com sucesso!', 'success');
            } catch (e) {
                console.error(e);
                window.UI.showToast('Erro ao salvar cartão', 'error');
            }
        }
    }

    deleteCard(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card) return;
        
        window.UI.confirmDialog(`Tem certeza que deseja excluir o cartão ${card.name}? Isso não excluirá as transações vinculadas a ele.`, 'Confirmação', async () => {
            try {
                await window.Storage.deleteRecord('cards', id);
                this.cards = this.cards.filter(c => c.id !== id);
                this.renderCards();
                window.UI.showToast('Cartão excluído com sucesso!', 'success');
            } catch (e) {
                console.error(e);
                window.UI.showToast('Erro ao excluir cartão', 'error');
            }
        });
    }

    renderCards() {
        const container = document.getElementById('cardsContainer');
        if (!container) return;

        const addBtn = document.getElementById('btnNovoCartao');
        container.innerHTML = '';

        let visibleCards = this.cards;
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                const uName = (window.currentUser.name || '').trim().toLowerCase();
                visibleCards = this.cards.filter(c => c.holder && c.holder.trim().toLowerCase() === uName);
            }
        }

        const allTransactions = window.Storage.get('transactions') || [];

        visibleCards.forEach(card => {
            const cardTxs = allTransactions.filter(tx => tx.type === 'expense' && tx.paymentMethod === `card_${card.id}`);
            const totalUsed = cardTxs.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
            
            const cardLimit = parseFloat(card.limit) || 0;
            const available = cardLimit - totalUsed;
            const percentage = cardLimit > 0 ? (totalUsed / cardLimit) * 100 : 0;
            
            let barClass = 'safe';
            if (percentage > 80) barClass = 'danger';
            else if (percentage > 50) barClass = 'warning';

            const metrics = window.Utils.getCardMetrics(card.closeDay, card.dueDay);

            const cardEl = document.createElement('div');
            cardEl.className = 'card-wrapper';
            cardEl.style.cssText = 'background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--glass-border); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 4px 20px rgba(0,0,0,0.15); transition: transform 0.2s ease, box-shadow 0.2s ease;';

            cardEl.innerHTML = `
                <!-- Top Header: Card Visual + Actions -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <!-- Sleek Realistic Card Badge -->
                    <div class="credit-card" style="background: linear-gradient(135deg, ${card.color || '#8A05BE'}, ${card.color ? card.color + 'dd' : '#4a0080'}); width: 100%; max-width: 280px; height: 150px; border-radius: 12px; padding: 1rem 1.25rem; color: white; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 8px 16px rgba(0,0,0,0.25); position: relative; overflow: hidden; flex-shrink: 0;">
                        <div style="position: absolute; right: -20px; bottom: -20px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.06); pointer-events: none;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 800; font-size: 1.1rem; letter-spacing: 0.5px;">${window.Utils.escapeHTML(card.name)}</span>
                            <i class="fa-solid fa-wifi" style="transform: rotate(90deg); font-size: 1rem; opacity: 0.8;"></i>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 32px; height: 24px; background: linear-gradient(135deg, #ffd700, #b8860b); border-radius: 4px; border: 1px solid rgba(255,255,255,0.3);"></div>
                        </div>
                        <div>
                            <div style="font-family: monospace; font-size: 1rem; letter-spacing: 2px; opacity: 0.9;">**** **** **** ${card.last4 || '0000'}</div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 0.2rem;">
                                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">${window.Utils.escapeHTML(card.holder)}</span>
                                <span style="font-weight: 700; font-style: italic; font-size: 0.9rem;">${window.Utils.escapeHTML(card.brand)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Quick Action Buttons -->
                    <div style="display: flex; flex-direction: flex-row; gap: 0.5rem; align-items: center;">
                        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${card.id}" title="Editar Cartão" style="width: 36px; height: 36px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${card.id}" title="Excluir Cartão" style="width: 36px; height: 36px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>

                <!-- Clean Invoice & Limit Summary (Nubank Style) -->
                <div style="display: flex; flex-direction: column; gap: 0.75rem; background: var(--bg-primary); border-radius: 12px; padding: 1rem; border: 1px solid var(--glass-border);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Fatura Atual</span>
                            <div style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin-top: 0.1rem;">${window.Utils.formatCurrency(totalUsed)}</div>
                        </div>
                        <button class="btn btn-primary btn-sm" data-action="invoice" data-id="${card.id}" style="padding: 0.4rem 1rem; border-radius: 20px; font-weight: 600;">
                            <i class="fa-solid fa-list-ul"></i> Ver Fatura
                        </button>
                    </div>

                    <!-- Sleek Limit Progress Bar -->
                    <div>
                        <div class="progress-bar-container" style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; margin-bottom: 0.35rem;">
                            <div class="progress-bar ${barClass}" style="width: ${Math.min(percentage, 100)}%; height: 100%; border-radius: 3px;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary);">
                            <span>Disponível: <strong style="color: var(--success);">${window.Utils.formatCurrency(available)}</strong></span>
                            <span>Limite: ${window.Utils.formatCurrency(cardLimit)}</span>
                        </div>
                    </div>
                </div>

                <!-- Smart Date Badges Grid (Clean Pills) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem;">
                    <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.5rem 0.75rem;">
                        <div style="font-size: 0.7rem; color: #10b981; font-weight: 700; text-transform: uppercase;"><i class="fa-solid fa-star"></i> Melhor Dia</div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-top: 0.1rem;">${metrics.formattedMelhorDia}</div>
                    </div>

                    <div style="background: var(--bg-primary); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.5rem 0.75rem;">
                        <div style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Fechamento</div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-top: 0.1rem;">${metrics.formattedFechamento}</div>
                    </div>

                    <div style="background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 8px; padding: 0.5rem 0.75rem;">
                        <div style="font-size: 0.7rem; color: #818cf8; font-weight: 700; text-transform: uppercase;">Vencimento</div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-top: 0.1rem;">${metrics.formattedVencimento}</div>
                    </div>
                </div>

                <!-- Destination Status Banner -->
                <div style="font-size: 0.78rem; padding: 0.5rem 0.75rem; background: var(--bg-primary); border-radius: 8px; border-left: 3px solid ${metrics.vaiParaProxima ? '#818cf8' : '#10b981'}; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.25rem;">
                    <span style="color: var(--text-secondary);">Compras hoje entram na:</span>
                    <strong style="color: ${metrics.vaiParaProxima ? '#818cf8' : '#10b981'};">${metrics.destinoCompraHoje}</strong>
                </div>
            `;
            container.appendChild(cardEl);
        });

        if (addBtn) container.appendChild(addBtn);
    }
}

const initCards = () => {
    if (!window.cardsController && document.getElementById('cardsContainer')) {
        window.cardsController = new CardsController();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCards);
} else {
    initCards();
}
