class SubscriptionsController {
    constructor() {
        this.subscriptions = window.Storage.get('subscriptions') || [];
        this.init();
        this.bindEvents();
    }

    init() {
        this.populateDropdowns();
        this.renderSubscriptions();
    }

    populateDropdowns() {
        const paymentSelect = document.getElementById('subPaymentMethod');
        const cardFilter = document.getElementById('subCardFilter');
        const personSelect = document.getElementById('subPerson');
        const personFilter = document.getElementById('subPersonFilter');

        let accounts = window.Storage.get('accounts') || [];
        let cards = window.Storage.get('cards') || [];
        let personsList = window.Storage.get('persons') || [];
        let personNames = personsList.map(p => p.name.trim());
        if (personNames.length === 0) personNames = ['Eduardo', 'Mãe', 'Rodrigo'];

        if (paymentSelect) {
            paymentSelect.innerHTML = '';
            const groupAcc = document.createElement('optgroup');
            groupAcc.label = "Contas";
            accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
                opt.textContent = `Conta: ${acc.name}`;
                groupAcc.appendChild(opt);
            });
            paymentSelect.appendChild(groupAcc);

            if (cards.length > 0) {
                const groupCard = document.createElement('optgroup');
                groupCard.label = "Cartões de Crédito";
                cards.forEach(card => {
                    const opt = document.createElement('option');
                    opt.value = `card_${card.id}`;
                    opt.textContent = `Cartão: ${card.name} (Final ${card.last4})`;
                    groupCard.appendChild(opt);
                });
                paymentSelect.appendChild(groupCard);
            }
        }

        if (cardFilter) {
            cardFilter.innerHTML = '<option value="all">Todos os Cartões / Contas</option>';
            cards.forEach(card => {
                const opt = document.createElement('option');
                opt.value = `card_${card.id}`;
                opt.textContent = `Cartão ${card.name}`;
                cardFilter.appendChild(opt);
            });
            accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
                opt.textContent = `Conta ${acc.name}`;
                cardFilter.appendChild(opt);
            });
        }

        if (personSelect) {
            personSelect.innerHTML = '';
            personNames.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                personSelect.appendChild(opt);
            });
        }

        if (personFilter) {
            personFilter.innerHTML = '<option value="all">Todas as Pessoas</option>';
            personNames.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                personFilter.appendChild(opt);
            });
        }
    }

    bindEvents() {
        const btnNovo = document.getElementById('btnNovaAssinatura');
        const form = document.getElementById('subscriptionForm');

        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                if (form) form.reset();
                document.getElementById('subEditId').value = '';
                document.querySelector('#subscriptionModal .modal-title').innerHTML = `<i class="fa-solid fa-arrows-rotate" style="color: var(--accent-primary); margin-right: 0.4rem;"></i> Cadastrar Nova Assinatura`;
                window.UI.openModal('subscriptionModal');
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSubscription();
            });
        }

        const searchInput = document.getElementById('subSearchInput');
        const statusFilter = document.getElementById('subStatusFilter');
        const cardFilter = document.getElementById('subCardFilter');
        const personFilter = document.getElementById('subPersonFilter');

        [searchInput, statusFilter, cardFilter, personFilter].forEach(el => {
            if (el) el.addEventListener('change', () => this.renderSubscriptions());
            if (el && el.tagName === 'INPUT') el.addEventListener('keyup', () => this.renderSubscriptions());
        });

        const grid = document.getElementById('subscriptionsGrid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const action = btn.dataset.action;
                const id = btn.dataset.id;

                if (action === 'edit') this.openEditModal(id);
                if (action === 'togglePause') this.togglePause(id);
                if (action === 'delete') this.deleteSubscription(id);
            });
        }
    }

    async saveSubscription() {
        const editId = document.getElementById('subEditId').value;
        const name = document.getElementById('subName').value.trim();
        const category = document.getElementById('subCategory').value;
        const amount = parseFloat(document.getElementById('subAmount').value);
        const paymentMethod = document.getElementById('subPaymentMethod').value;
        const person = document.getElementById('subPerson').value;
        const billingDay = parseInt(document.getElementById('subBillingDay').value);
        const periodicity = document.getElementById('subPeriodicity').value;
        const status = document.getElementById('subStatus').value;

        if (!name || isNaN(amount) || amount <= 0) {
            window.UI.showToast('Preencha os campos obrigatórios corretamente', 'error');
            return;
        }

        let subToSave;
        if (editId) {
            const index = this.subscriptions.findIndex(s => s.id === editId);
            if (index !== -1) {
                this.subscriptions[index] = {
                    ...this.subscriptions[index],
                    name, category, amount, paymentMethod, person, billingDay, periodicity, status,
                    updatedAt: new Date().toISOString()
                };
                subToSave = this.subscriptions[index];
            }
        } else {
            subToSave = {
                id: window.Utils.generateId(),
                name, category, amount, paymentMethod, person, billingDay, periodicity, status,
                createdAt: new Date().toISOString()
            };
            this.subscriptions.push(subToSave);
        }

        if (subToSave) {
            try {
                await window.Storage.saveRecord('subscriptions', subToSave);
                this.syncSubscriptionTransactions(subToSave);
                
                window.UI.closeModal('subscriptionModal');
                window.UI.showToast(editId ? 'Assinatura atualizada com sucesso!' : 'Assinatura cadastrada com sucesso! 🔄', 'success');
                this.renderSubscriptions();
            } catch (e) {
                console.error(e);
                window.UI.showToast('Erro ao salvar assinatura', 'error');
            }
        }
    }

    syncSubscriptionTransactions(sub) {
        let allTxs = window.Storage.get('transactions') || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        // Ensure monthly transaction exists for current & next month
        for (let offset = 0; offset <= 2; offset++) {
            const d = new Date(currentYear, currentMonth + offset, sub.billingDay || 10);
            const dateStr = d.toISOString().split('T')[0];

            const exists = allTxs.some(t => t.subscriptionId === sub.id && t.date === dateStr);
            if (!exists && sub.status !== 'cancelada') {
                const newTx = {
                    id: window.Utils.generateId(),
                    type: 'expense',
                    description: sub.name,
                    amount: sub.amount,
                    date: dateStr,
                    category: sub.category || 'Assinaturas',
                    paymentMethod: sub.paymentMethod,
                    person: sub.person || 'Eu',
                    isRecurring: true,
                    isSubscription: true,
                    subscriptionId: sub.id,
                    recurringStatus: sub.status,
                    createdAt: new Date().toISOString()
                };
                allTxs.push(newTx);
                window.Storage.saveRecord('transactions', newTx);
            }
        }
    }

    openEditModal(id) {
        const sub = this.subscriptions.find(s => s.id === id);
        if (!sub) return;

        document.getElementById('subEditId').value = sub.id;
        document.getElementById('subName').value = sub.name;
        document.getElementById('subCategory').value = sub.category || 'Assinaturas';
        document.getElementById('subAmount').value = sub.amount;
        document.getElementById('subPaymentMethod').value = sub.paymentMethod;
        document.getElementById('subPerson').value = sub.person || 'Eu';
        document.getElementById('subBillingDay').value = sub.billingDay || 10;
        document.getElementById('subPeriodicity').value = sub.periodicity || 'mensal';
        document.getElementById('subStatus').value = sub.status || 'ativa';

        document.querySelector('#subscriptionModal .modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--accent-primary); margin-right: 0.4rem;"></i> Editar Assinatura`;
        window.UI.openModal('subscriptionModal');
    }

    async togglePause(id) {
        const sub = this.subscriptions.find(s => s.id === id);
        if (!sub) return;

        sub.status = (sub.status === 'pausada') ? 'ativa' : 'pausada';
        await window.Storage.saveRecord('subscriptions', sub);
        window.UI.showToast(`Assinatura "${sub.name}" ${sub.status === 'ativa' ? 'reativada 🟢' : 'pausada ⏸️'} com sucesso!`, 'success');
        this.renderSubscriptions();
    }

    deleteSubscription(id) {
        const sub = this.subscriptions.find(s => s.id === id);
        if (!sub) return;

        window.UI.confirmDialog(`Deseja realmente excluir a assinatura "${sub.name}"? As cobranças futuras serão removidas, mas os lançamentos antigos do extrato serão mantidos.`, 'Excluir Assinatura', async () => {
            try {
                await window.Storage.deleteRecord('subscriptions', id);
                this.subscriptions = this.subscriptions.filter(s => s.id !== id);
                this.renderSubscriptions();
                window.UI.showToast('Assinatura excluída com sucesso!', 'success');
            } catch (e) {
                console.error(e);
                window.UI.showToast('Erro ao excluir assinatura', 'error');
            }
        });
    }

    getCategoryIcon(cat) {
        const icons = {
            'Entretenimento': '🍿',
            'Contas e serviços': '⚡',
            'Educação': '🎓',
            'Assinaturas': '🔄',
            'Tecnologia': '💻',
            'Saúde': '🏥',
            'Outros': '📦'
        };
        return icons[cat] || '📦';
    }

    getPaymentMethodName(pm) {
        if (!pm) return 'Conta Corrente';
        if (pm.startsWith('card_')) {
            const cards = window.Storage.get('cards') || [];
            const c = cards.find(card => card.id === pm.replace('card_', ''));
            return c ? `Cartão ${c.name}` : 'Cartão de Crédito';
        }
        if (pm.startsWith('acc_')) {
            const accs = window.Storage.get('accounts') || [];
            const a = accs.find(acc => acc.id === pm.replace('acc_', ''));
            return a ? `Conta ${a.name}` : 'Conta Corrente';
        }
        return 'Conta Corrente';
    }

    renderSubscriptions() {
        const grid = document.getElementById('subscriptionsGrid');
        if (!grid) return;

        this.subscriptions = window.Storage.get('subscriptions') || [];
        let subsToRender = [...this.subscriptions];

        // Seed initial default subscriptions if empty
        if (subsToRender.length === 0) {
            const defaultSubs = [
                { id: 'sub_1', name: 'Netflix', category: 'Entretenimento', amount: 39.90, paymentMethod: 'account', person: 'Eduardo', billingDay: 10, periodicity: 'mensal', status: 'ativa' },
                { id: 'sub_2', name: 'Spotify', category: 'Entretenimento', amount: 21.90, paymentMethod: 'account', person: 'Eduardo', billingDay: 15, periodicity: 'mensal', status: 'ativa' },
                { id: 'sub_3', name: 'Internet Banda Larga', category: 'Contas e serviços', amount: 100.00, paymentMethod: 'account', person: 'Eduardo', billingDay: 5, periodicity: 'mensal', status: 'ativa' }
            ];
            defaultSubs.forEach(s => window.Storage.saveRecord('subscriptions', s));
            this.subscriptions = defaultSubs;
            subsToRender = defaultSubs;
        }

        const searchVal = (document.getElementById('subSearchInput')?.value || '').toLowerCase();
        const statusVal = document.getElementById('subStatusFilter')?.value || 'all';
        const cardVal = document.getElementById('subCardFilter')?.value || 'all';
        const personVal = document.getElementById('subPersonFilter')?.value || 'all';

        if (searchVal) {
            subsToRender = subsToRender.filter(s => s.name.toLowerCase().includes(searchVal) || (s.category && s.category.toLowerCase().includes(searchVal)));
        }
        if (statusVal !== 'all') {
            subsToRender = subsToRender.filter(s => (s.status || 'ativa').toLowerCase() === statusVal);
        }
        if (cardVal !== 'all') {
            subsToRender = subsToRender.filter(s => s.paymentMethod === cardVal);
        }
        if (personVal !== 'all') {
            subsToRender = subsToRender.filter(s => (s.person || 'Eu').toLowerCase() === personVal.toLowerCase());
        }

        // Calculate KPIs
        const activeSubs = this.subscriptions.filter(s => (s.status || 'ativa') === 'ativa');
        const activeCount = activeSubs.length;
        const totalMonthly = activeSubs.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

        const cardSet = new Set(activeSubs.map(s => s.paymentMethod).filter(Boolean));
        const cardsCount = cardSet.size;

        const kpiActive = document.getElementById('kpiActiveSubsCount');
        const kpiMonthly = document.getElementById('kpiTotalMonthlyAmount');
        const kpiNextInfo = document.getElementById('kpiNextBillingInfo');
        const kpiNextDate = document.getElementById('kpiNextBillingDate');
        const kpiCards = document.getElementById('kpiCardsCount');

        if (kpiActive) kpiActive.textContent = activeCount;
        if (kpiMonthly) kpiMonthly.textContent = window.Utils.formatCurrency(totalMonthly);
        if (kpiCards) kpiCards.textContent = cardsCount;

        if (activeSubs.length > 0) {
            const today = new Date();
            const sortedByDay = [...activeSubs].sort((a, b) => (a.billingDay || 10) - (b.billingDay || 10));
            const nextSub = sortedByDay.find(s => s.billingDay >= today.getDate()) || sortedByDay[0];
            if (nextSub && kpiNextInfo && kpiNextDate) {
                kpiNextInfo.textContent = nextSub.name;
                kpiNextDate.textContent = `Dia ${nextSub.billingDay} (${window.Utils.formatCurrency(nextSub.amount)})`;
            }
        } else {
            if (kpiNextInfo) kpiNextInfo.textContent = '-';
            if (kpiNextDate) kpiNextDate.textContent = 'Nenhuma pendente';
        }

        grid.innerHTML = '';
        if (subsToRender.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-secondary);" class="glass-panel">
                    <i class="fa-solid fa-arrows-rotate" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p style="font-size: 1rem; font-weight: 600; margin: 0;">Nenhuma assinatura encontrada</p>
                    <p style="font-size: 0.82rem; margin-top: 0.25rem;">Clique no botão "+ Nova Assinatura" para cadastrar.</p>
                </div>
            `;
            return;
        }

        subsToRender.forEach(sub => {
            const status = sub.status || 'ativa';
            let badgeClass = 'income';
            let badgeText = '🟢 Ativa';
            if (status === 'pausada') { badgeClass = 'warning'; badgeText = '⏸️ Pausada'; }
            if (status === 'cancelada') { badgeClass = 'expense'; badgeText = '🔴 Cancelada'; }

            const catIcon = this.getCategoryIcon(sub.category);
            const pmName = this.getPaymentMethodName(sub.paymentMethod);

            const cardEl = document.createElement('div');
            cardEl.className = 'glass-panel';
            cardEl.style.cssText = 'padding: 1.25rem; border-radius: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; box-shadow: 0 4px 16px rgba(0,0,0,0.12); position: relative; overflow: hidden;';

            cardEl.innerHTML = `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span style="font-size: 1.4rem;">${catIcon}</span>
                            <div>
                                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">${window.Utils.escapeHTML(sub.name)}</h3>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">${window.Utils.escapeHTML(sub.category || 'Assinaturas')} &bull; ${window.Utils.escapeHTML(sub.person || 'Eu')}</span>
                            </div>
                        </div>
                        <span class="tx-badge ${badgeClass}" style="font-weight: 700; font-size: 0.72rem;">${badgeText}</span>
                    </div>

                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 10px; padding: 0.85rem; margin-bottom: 0.85rem;">
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Valor da Cobrança</div>
                        <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-primary); margin-top: 0.1rem;">
                            ${window.Utils.formatCurrency(sub.amount)} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary);">/ ${sub.periodicity || 'mês'}</span>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                        <div><i class="fa-solid fa-credit-card" style="color: var(--accent-primary);"></i> ${window.Utils.escapeHTML(pmName)}</div>
                        <div><i class="fa-solid fa-calendar-day" style="color: var(--accent-primary);"></i> Todo dia ${sub.billingDay || 10}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 0.4rem; border-top: 1px solid var(--glass-border); padding-top: 0.85rem; margin-top: 0.25rem;">
                    <button class="btn btn-outline btn-sm" data-action="edit" data-id="${sub.id}" style="flex: 1; font-size: 0.78rem;">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="btn btn-outline btn-sm" data-action="togglePause" data-id="${sub.id}" style="flex: 1; font-size: 0.78rem;">
                        <i class="fa-solid ${status === 'pausada' ? 'fa-play' : 'fa-pause'}"></i> ${status === 'pausada' ? 'Retomar' : 'Pausar'}
                    </button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${sub.id}" title="Excluir Assinatura" style="padding: 0.4rem 0.6rem;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;

            grid.appendChild(cardEl);
        });
    }
}

const initSubscriptions = () => {
    if (!window.subscriptionsController && document.getElementById('subscriptionsGrid')) {
        window.subscriptionsController = new SubscriptionsController();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubscriptions);
} else {
    initSubscriptions();
}
