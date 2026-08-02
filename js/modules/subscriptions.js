class SubscriptionsController {
    constructor() {
        this.subscriptions = window.Storage.get('subscriptions') || [];
        this.init();
        this.bindEvents();
    }

    init() {
        this.populateDropdowns();
        this.renderSubscriptions();
        this.syncAllActiveSubscriptions();
    }

    async syncAllActiveSubscriptions() {
        const subs = window.Storage.get('subscriptions') || [];
        const activeSubs = subs.filter(s => s.status === 'ativa');
        for (const sub of activeSubs) {
            await this.syncSubscriptionTransactions(sub);
        }
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

        const subSplitPersonsList = document.getElementById('subSplitPersonsList');
        if (subSplitPersonsList) {
            subSplitPersonsList.innerHTML = '';
            personNames.forEach(pName => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255,255,255,0.03); padding: 0.4rem 0.75rem; border-radius: 6px; border: 1px solid var(--glass-border);';
                row.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; margin: 0; flex: 1;">
                        <input type="checkbox" class="sub-split-cb" data-person="${window.Utils.escapeHTML(pName)}" style="width: 16px; height: 16px; accent-color: var(--accent-primary);">
                        <span>${window.Utils.escapeHTML(pName)}</span>
                    </label>
                    <div style="display: flex; align-items: center; gap: 0.25rem;">
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">R$</span>
                        <input type="number" step="0.01" min="0" class="form-control sub-split-val" data-person="${window.Utils.escapeHTML(pName)}" placeholder="0,00" style="width: 105px; padding: 0.25rem 0.5rem; font-size: 0.85rem;" disabled>
                    </div>
                `;
                subSplitPersonsList.appendChild(row);
            });

            subSplitPersonsList.querySelectorAll('.sub-split-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const pName = e.target.getAttribute('data-person');
                    const valInput = subSplitPersonsList.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
                    if (valInput) {
                        valInput.disabled = !e.target.checked;
                        if (!e.target.checked) valInput.value = '';
                    }
                    this.updateSubSplitSummary();
                });
            });

            subSplitPersonsList.querySelectorAll('.sub-split-val').forEach(input => {
                input.addEventListener('input', () => this.updateSubSplitSummary());
            });
        }
    }

    updateSubSplitSummary() {
        const amountStr = document.getElementById('subAmount').value;
        const totalRaw = parseFloat(amountStr) || 0;
        let sum = 0;
        document.querySelectorAll('.sub-split-val:not(:disabled)').forEach(i => {
            sum += (parseFloat(i.value) || 0);
        });
        
        const sumEl = document.getElementById('subSplitSum');
        const remEl = document.getElementById('subSplitRemaining');
        
        if (sumEl) sumEl.textContent = window.Utils.formatCurrency(sum);
        
        if (remEl) {
            const diff = Math.round((totalRaw - sum) * 100) / 100;
            remEl.textContent = window.Utils.formatCurrency(diff);
            if (diff !== 0 && totalRaw > 0) {
                remEl.style.color = 'var(--danger)';
            } else {
                remEl.style.color = 'var(--success)';
            }
        }
    }

    bindEvents() {
        const btnNovo = document.getElementById('btnNovaAssinatura');
        const form = document.getElementById('subscriptionForm');
        const cbEnableSplit = document.getElementById('subEnableSplit');
        const btnSplitEqual = document.getElementById('btnSubSplitEqual');

        if (cbEnableSplit) {
            cbEnableSplit.addEventListener('change', (e) => {
                const grp = document.getElementById('subSplitGroup');
                const pGrp = document.getElementById('subSinglePersonGroup');
                if (grp) grp.style.display = e.target.checked ? 'block' : 'none';
                if (pGrp) pGrp.style.display = e.target.checked ? 'none' : 'block';
                if (!e.target.checked) {
                    document.querySelectorAll('.sub-split-cb').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.sub-split-val').forEach(input => {
                        input.value = '';
                        input.disabled = true;
                    });
                    this.updateSubSplitSummary();
                }
            });
        }

        if (btnSplitEqual) {
            btnSplitEqual.addEventListener('click', () => {
                const totalRaw = parseFloat(document.getElementById('subAmount').value) || 0;
                if (totalRaw <= 0) return;
                
                const checkedCbs = Array.from(document.querySelectorAll('.sub-split-cb:checked'));
                if (checkedCbs.length === 0) return;
                
                const baseVal = Math.floor((totalRaw / checkedCbs.length) * 100) / 100;
                let sum = 0;
                
                checkedCbs.forEach((cb, index) => {
                    const pName = cb.getAttribute('data-person');
                    const input = document.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
                    if (input) {
                        let val = baseVal;
                        if (index === checkedCbs.length - 1) {
                            val = Math.round((totalRaw - sum) * 100) / 100;
                        }
                        input.value = val.toFixed(2);
                        sum += baseVal;
                    }
                });
                this.updateSubSplitSummary();
            });
        }

        const subAmountInput = document.getElementById('subAmount');
        if (subAmountInput) {
            subAmountInput.addEventListener('input', () => this.updateSubSplitSummary());
        }

        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                if (form) form.reset();
                document.getElementById('subEditId').value = '';
                
                if (cbEnableSplit) {
                    cbEnableSplit.checked = false;
                    cbEnableSplit.dispatchEvent(new Event('change'));
                }
                
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

        const refreshSubsHandler = () => {
            this.subscriptions = window.Storage.get('subscriptions') || [];
            this.renderSubscriptions();
        };
        window.addEventListener('dataUpdated', refreshSubsHandler);
        window.addEventListener('fluxo:dataChanged', refreshSubsHandler);
    }

    async saveSubscription() {
        const editId = document.getElementById('subEditId').value;
        const name = document.getElementById('subName').value.trim();
        const category = document.getElementById('subCategory').value;
        const amount = parseFloat(document.getElementById('subAmount').value);
        const paymentMethod = document.getElementById('subPaymentMethod').value;
        let person = document.getElementById('subPerson').value;
        const billingDay = parseInt(document.getElementById('subBillingDay').value);
        const periodicity = document.getElementById('subPeriodicity').value;
        const status = document.getElementById('subStatus').value;

        if (!name || isNaN(amount) || amount <= 0) {
            window.UI.showToast('Preencha os campos obrigatórios corretamente', 'error');
            return;
        }

        const isSplitEnabled = document.getElementById('subEnableSplit')?.checked || false;
        let splitItems = [];
        
        if (isSplitEnabled) {
            let sum = 0;
            const checkedBoxes = document.querySelectorAll('.sub-split-cb:checked');
            if (checkedBoxes.length === 0) {
                window.UI.showToast('Selecione pelo menos uma pessoa para a divisão.', 'error');
                return;
            }
            
            checkedBoxes.forEach(cb => {
                const pName = cb.getAttribute('data-person');
                const input = document.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
                const val = parseFloat(input?.value) || 0;
                splitItems.push({ person: pName, amount: val });
                sum += val;
            });
            
            sum = Math.round(sum * 100) / 100;
            const diff = Math.abs(sum - amount);
            if (diff > 0.05) {
                window.UI.showToast(`A soma da divisão (${window.Utils.formatCurrency(sum)}) deve ser igual ao valor total (${window.Utils.formatCurrency(amount)}).`, 'error');
                return;
            }
            
            person = splitItems.map(s => s.person).join(', ');
        }

        let subToSave;
        if (editId) {
            const index = this.subscriptions.findIndex(s => s.id === editId);
            if (index !== -1) {
                this.subscriptions[index] = {
                    ...this.subscriptions[index],
                    name, category, amount, paymentMethod, person, billingDay, periodicity, status,
                    isSplit: isSplitEnabled,
                    splitDetails: isSplitEnabled ? splitItems : null,
                    updatedAt: new Date().toISOString()
                };
                subToSave = this.subscriptions[index];
            }
        } else {
            subToSave = {
                id: window.Utils.generateId(),
                name, category, amount, paymentMethod, person, billingDay, periodicity, status,
                isSplit: isSplitEnabled,
                splitDetails: isSplitEnabled ? splitItems : null,
                createdAt: new Date().toISOString()
            };
            this.subscriptions.push(subToSave);
        }

        if (subToSave) {
            try {
                await window.Storage.saveRecord('subscriptions', subToSave);
                await this.syncSubscriptionTransactions(subToSave);
                
                window.UI.closeModal('subscriptionModal');
                window.UI.showToast(editId ? 'Assinatura atualizada com sucesso!' : 'Assinatura cadastrada com sucesso! 🔄', 'success');
                this.renderSubscriptions();
            } catch (e) {
                console.error(e);
                window.UI.showToast('Erro ao salvar assinatura', 'error');
            }
        }
    }

    async syncSubscriptionTransactions(sub) {
        let allTxs = window.Storage.get('transactions') || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        const promises = [];

        // Gera apenas 1 lançamento para o mês ATUAL (não gera 15 meses futuros)
        for (let offset = 0; offset <= 0; offset++) {
            const d = new Date(currentYear, currentMonth + offset, sub.billingDay || 10);
            const dateStr = d.toISOString().split('T')[0];

            const existingIndex = allTxs.findIndex(t => t.subscriptionId === sub.id && t.date === dateStr);
            if (existingIndex > -1) {
                if (sub.status === 'cancelada') {
                    const txIdToDelete = allTxs[existingIndex].id;
                    allTxs.splice(existingIndex, 1);
                    promises.push(window.Storage.deleteRecord('transactions', txIdToDelete));
                } else {
                    allTxs[existingIndex] = {
                        ...allTxs[existingIndex],
                        description: sub.name,
                        amount: sub.amount,
                        category: sub.category || 'Assinaturas',
                        paymentMethod: sub.paymentMethod,
                        person: sub.person || 'Eu',
                        recurringStatus: sub.status,
                        isSplit: sub.isSplit || false,
                        splitDetails: sub.splitDetails || null,
                        updatedAt: new Date().toISOString()
                    };
                    promises.push(window.Storage.saveRecord('transactions', allTxs[existingIndex]));
                }
            } else if (sub.status !== 'cancelada') {
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
                    isSplit: sub.isSplit || false,
                    splitDetails: sub.splitDetails || null,
                    createdAt: new Date().toISOString()
                };
                allTxs.push(newTx);
                promises.push(window.Storage.saveRecord('transactions', newTx));
            }
        }

        // Limpar lançamentos de meses futuros que foram gerados anteriormente
        const futureTxs = allTxs.filter(t => t.subscriptionId === sub.id && t.date > new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]);
        futureTxs.forEach(ft => {
            promises.push(window.Storage.deleteRecord('transactions', ft.id));
        });
        
        await Promise.all(promises);
    }

    openEditModal(id) {
        const sub = this.subscriptions.find(s => s.id === id);
        if (!sub) return;

        document.getElementById('subEditId').value = sub.id;
        document.getElementById('subName').value = sub.name;
        document.getElementById('subCategory').value = sub.category || 'Assinaturas';
        document.getElementById('subAmount').value = sub.amount;
        document.getElementById('subPaymentMethod').value = sub.paymentMethod;
        document.getElementById('subBillingDay').value = sub.billingDay || 10;
        document.getElementById('subPeriodicity').value = sub.periodicity || 'mensal';
        document.getElementById('subStatus').value = sub.status || 'ativa';

        const cbEnableSplit = document.getElementById('subEnableSplit');
        if (cbEnableSplit) {
            cbEnableSplit.checked = sub.isSplit || false;
            cbEnableSplit.dispatchEvent(new Event('change'));
            
            if (sub.isSplit && sub.splitDetails) {
                sub.splitDetails.forEach(s => {
                    const cb = document.querySelector(`.sub-split-cb[data-person="${CSS.escape(s.person)}"]`);
                    const input = document.querySelector(`.sub-split-val[data-person="${CSS.escape(s.person)}"]`);
                    if (cb && input) {
                        cb.checked = true;
                        input.disabled = false;
                        input.value = s.amount;
                    }
                });
                this.updateSubSplitSummary();
            } else {
                document.getElementById('subPerson').value = sub.person || 'Eu';
            }
        }

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

        window.UI.confirmDialog(`Deseja realmente excluir a assinatura "${sub.name}"? As cobranças futuras não pagas serão removidas, mas as já pagas serão mantidas.`, 'Excluir Assinatura', async () => {
            try {
                await window.Storage.deleteRecord('subscriptions', id);
                this.subscriptions = this.subscriptions.filter(s => s.id !== id);
                
                // Remove future/unpaid transactions associated with this subscription
                let allTxs = window.Storage.get('transactions') || [];
                const toDelete = allTxs.filter(t => t.subscriptionId === id && t.isRecurring && !t.isPaid);
                
                for (const t of toDelete) {
                    await window.Storage.deleteRecord('transactions', t.id);
                }

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
