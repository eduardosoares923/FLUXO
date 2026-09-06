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
        const allTxs = window.Storage.get('transactions') || [];
        const now = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const currentMonthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
        
        // 1. Limpar em lote qualquer transação de assinatura do FUTURO (> mês atual) gerada anteriormente pelo bug antigo
        const futureSubTxs = allTxs.filter(tx => (tx.isSubscription || tx.subscriptionId) && tx.date >= currentMonthEnd);
        if (futureSubTxs.length > 0) {
            await window.Storage.deleteRecords('transactions', futureSubTxs.map(tx => tx.id));
        }

        // 2. Gerar lançamento do mês atual APENAS se ainda não foi sincronizado para este mês
        const subs = window.Storage.get('subscriptions') || [];
        const activeSubs = subs.filter(s => s.status === 'ativa');
        for (const sub of activeSubs) {
            if (sub.lastSyncedMonth === currentMonthPrefix) continue;
            await this.syncSubscriptionTransactions(sub, currentMonthPrefix);
        }
    }

    populateDropdowns() {
        const paymentSelect = document.getElementById('subPaymentMethod');
        const cardFilter = document.getElementById('subCardFilter');
        const personSelect = document.getElementById('subPerson');
        const personFilter = document.getElementById('subPersonFilter');

        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        const persons = window.Storage.get('persons') || [];

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
                    opt.textContent = `Cartão: ${card.name}`;
                    groupCard.appendChild(opt);
                });
                paymentSelect.appendChild(groupCard);
            }
        }

        if (cardFilter) {
            cardFilter.innerHTML = '<option value="all">Todos os Métodos</option>';
            
            const groupAcc = document.createElement('optgroup');
            groupAcc.label = "Contas";
            accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
                opt.textContent = `Conta: ${acc.name}`;
                groupAcc.appendChild(opt);
            });
            cardFilter.appendChild(groupAcc);

            if (cards.length > 0) {
                const groupCard = document.createElement('optgroup');
                groupCard.label = "Cartões de Crédito";
                cards.forEach(card => {
                    const opt = document.createElement('option');
                    opt.value = `card_${card.id}`;
                    opt.textContent = `Cartão: ${card.name}`;
                    groupCard.appendChild(opt);
                });
                cardFilter.appendChild(groupCard);
            }
        }

        if (personSelect) {
            personSelect.innerHTML = '';
            let personNames = persons.map(p => p.name.trim());
            if (personNames.length === 0) personNames = ['Eduardo', 'Mãe', 'Rodrigo'];
            
            personNames.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                personSelect.appendChild(opt);
            });
        }

        if (personFilter) {
            personFilter.innerHTML = '<option value="all">Todas as Pessoas</option>';
            let personNames = persons.map(p => p.name.trim());
            if (personNames.length === 0) personNames = ['Eduardo', 'Mãe', 'Rodrigo'];

            personNames.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                personFilter.appendChild(opt);
            });
        }

        this.populateSplitPersonsList();
    }

    populateSplitPersonsList() {
        const list = document.getElementById('subSplitPersonsList');
        if (!list) return;
        list.innerHTML = '';

        const persons = window.Storage.get('persons') || [];
        let personNames = persons.map(p => p.name.trim());
        if (personNames.length === 0) personNames = ['Eduardo', 'Mãe', 'Rodrigo'];

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
            list.appendChild(row);
        });

        list.querySelectorAll('.sub-split-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const pName = e.target.getAttribute('data-person');
                const valInput = list.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
                if (valInput) {
                    valInput.disabled = !e.target.checked;
                    if (!e.target.checked) valInput.value = '';
                }
                this.updateSplitSummary();
            });
        });

        list.querySelectorAll('.sub-split-val').forEach(input => {
            input.addEventListener('input', () => this.updateSplitSummary());
        });
    }

    updateSplitSummary() {
        const amountInput = document.getElementById('subAmount');
        const list = document.getElementById('subSplitPersonsList');
        const sumEl = document.getElementById('subSplitSum');
        const remEl = document.getElementById('subSplitRemaining');

        if (!amountInput || !list || !sumEl || !remEl) return;

        const totalAmount = parseFloat(amountInput.value) || 0;
        const checkedInputs = Array.from(list.querySelectorAll('.sub-split-cb:checked'));

        let sum = 0;
        checkedInputs.forEach(cb => {
            const pName = cb.getAttribute('data-person');
            const valInput = list.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
            sum += parseFloat(valInput?.value || 0);
        });

        sum = Math.round(sum * 100) / 100;
        const remaining = Math.round((totalAmount - sum) * 100) / 100;

        sumEl.textContent = window.Utils.formatCurrency(sum);
        remEl.textContent = window.Utils.formatCurrency(remaining);
        remEl.style.color = Math.abs(remaining) < 0.01 ? 'var(--success)' : 'var(--warning)';
    }

    splitEqually() {
        const amountInput = document.getElementById('subAmount');
        const list = document.getElementById('subSplitPersonsList');
        if (!amountInput || !list) return;

        const totalAmount = parseFloat(amountInput.value) || 0;
        const checkedCbs = Array.from(list.querySelectorAll('.sub-split-cb:checked'));

        if (checkedCbs.length === 0) {
            window.UI.showToast('Selecione pelo menos uma pessoa para dividir igualmente.', 'warning');
            return;
        }

        const perPerson = Math.floor((totalAmount / checkedCbs.length) * 100) / 100;
        let remainder = Math.round((totalAmount - (perPerson * checkedCbs.length)) * 100) / 100;

        checkedCbs.forEach((cb, index) => {
            const pName = cb.getAttribute('data-person');
            const valInput = list.querySelector(`.sub-split-val[data-person="${CSS.escape(pName)}"]`);
            if (valInput) {
                const val = (index === 0) ? perPerson + remainder : perPerson;
                valInput.value = val.toFixed(2);
            }
        });

        this.updateSplitSummary();
    }

    bindEvents() {
        const btnNova = document.getElementById('btnNovaAssinatura');
        const btnCloseModal = document.getElementById('closeSubModalBtn');
        const btnCancelModal = document.getElementById('cancelSubBtn');
        const subForm = document.getElementById('subForm');
        const searchInput = document.getElementById('subSearchFilter');
        const cardFilter = document.getElementById('subCardFilter');
        const personFilter = document.getElementById('subPersonFilter');
        const amountInput = document.getElementById('subAmount');
        const grid = document.getElementById('subscriptionsGrid');

        if (grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (!id) return;

                if (action === 'edit') this.editSubscription(id);
                if (action === 'togglePause') this.togglePause(id);
                if (action === 'delete') this.deleteSubscription(id);
            });
        }

        if (amountInput) {
            amountInput.addEventListener('input', () => this.updateSplitSummary());
        }

        const subEnableSplit = document.getElementById('subEnableSplit');
        const subSplitGroup = document.getElementById('subSplitGroup');
        const subSinglePersonGroup = document.getElementById('subSinglePersonGroup');
        const subPerson = document.getElementById('subPerson');

        if (subEnableSplit) {
            subEnableSplit.addEventListener('change', () => {
                const isSplit = subEnableSplit.checked;
                if (subSplitGroup) subSplitGroup.style.display = isSplit ? 'block' : 'none';
                if (subSinglePersonGroup) subSinglePersonGroup.style.display = isSplit ? 'none' : 'block';
                if (subPerson) {
                    if (isSplit) subPerson.removeAttribute('required');
                    else subPerson.setAttribute('required', 'required');
                }
                this.updateSplitSummary();
            });
        }

        const btnSplitEqual = document.getElementById('btnSplitEqualSub');
        if (btnSplitEqual) {
            btnSplitEqual.addEventListener('click', () => this.splitEqually());
        }

        if (btnNova) {
            btnNova.addEventListener('click', () => {
                subForm.reset();
                document.getElementById('subEditId').value = '';
                document.querySelector('#subscriptionModal .modal-title').textContent = 'Nova Assinatura';
                this.populateDropdowns();
                if (subEnableSplit) subEnableSplit.checked = false;
                if (subSplitGroup) subSplitGroup.style.display = 'none';
                if (subSinglePersonGroup) subSinglePersonGroup.style.display = 'block';
                if (subPerson) subPerson.setAttribute('required', 'required');
                window.UI.openModal('subscriptionModal');
            });
        }

        if (btnCloseModal) btnCloseModal.addEventListener('click', () => window.UI.closeModal('subscriptionModal'));
        if (btnCancelModal) btnCancelModal.addEventListener('click', () => window.UI.closeModal('subscriptionModal'));

        if (subForm) {
            subForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSubscription();
            });
        }

        const applyFilters = () => {
            const search = searchInput ? searchInput.value.toLowerCase() : '';
            const cardVal = cardFilter ? cardFilter.value : 'all';
            const personVal = personFilter ? personFilter.value : 'all';

            const norm = (s) => (s || '').trim().toLowerCase();

            const filtered = this.subscriptions.filter(sub => {
                const matchSearch = !search || sub.name.toLowerCase().includes(search) || (sub.category && sub.category.toLowerCase().includes(search));
                const matchCard = cardVal === 'all' || sub.paymentMethod === cardVal;
                
                let matchPerson = false;
                if (personVal === 'all') {
                    matchPerson = true;
                } else {
                    const targetNorm = norm(personVal);
                    if (sub.isSplit && sub.splitDetails && Array.isArray(sub.splitDetails)) {
                        matchPerson = sub.splitDetails.some(d => norm(d.person) === targetNorm);
                    } else {
                        const subPersons = (sub.person || 'Eu').split(',').map(p => norm(p));
                        matchPerson = subPersons.includes(targetNorm);
                    }
                }

                return matchSearch && matchCard && matchPerson;
            });

            this.renderSubscriptionsList(filtered);
        };

        if (searchInput) searchInput.addEventListener('input', applyFilters);
        if (cardFilter) cardFilter.addEventListener('change', applyFilters);
        if (personFilter) personFilter.addEventListener('change', applyFilters);

        const refreshSubHandler = () => {
            this.subscriptions = window.Storage.get('subscriptions') || [];
            this.populateDropdowns();
            this.renderSubscriptions();
        };

        window.addEventListener('dataUpdated', refreshSubHandler);
        window.addEventListener('fluxo:dataChanged', refreshSubHandler);
    }

    async saveSubscription() {
        const editId = document.getElementById('subEditId').value;
        const name = document.getElementById('subName').value.trim();
        const category = document.getElementById('subCategory').value;
        const amountStr = document.getElementById('subAmount').value;
        const paymentMethod = document.getElementById('subPaymentMethod').value;
        const billingDay = parseInt(document.getElementById('subBillingDay').value) || 10;
        const person = document.getElementById('subPerson')?.value || 'Eu';

        if (!name || !amountStr) {
            window.UI.showToast('Preencha o nome e o valor da assinatura', 'error');
            return;
        }

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            window.UI.showToast('Informe um valor válido maior que zero.', 'error');
            return;
        }

        const isSplitEnabled = document.getElementById('subEnableSplit')?.checked;
        let splitItems = [];

        if (isSplitEnabled) {
            const list = document.getElementById('subSplitPersonsList');
            const checkedCbs = Array.from(list.querySelectorAll('.sub-split-cb:checked'));

            if (checkedCbs.length === 0) {
                window.UI.showToast('Selecione pelo menos uma pessoa para a divisão.', 'error');
                return;
            }

            let sum = 0;
            for (const cb of checkedCbs) {
                const personName = cb.getAttribute('data-person');
                const valInput = list.querySelector(`.sub-split-val[data-person="${CSS.escape(personName)}"]`);
                const val = parseFloat(valInput?.value || 0);
                if (isNaN(val) || val <= 0) {
                    window.UI.showToast(`Informe o valor da parte para ${personName}.`, 'error');
                    return;
                }
                splitItems.push({ person: personName, amount: val });
                sum += val;
            }

            sum = Math.round(sum * 100) / 100;
            const diff = Math.abs(sum - amount);
            if (diff > 0.05) {
                window.UI.showToast(`A soma das partes (${window.Utils.formatCurrency(sum)}) deve ser igual ao valor da assinatura (${window.Utils.formatCurrency(amount)}).`, 'error');
                return;
            }
        }

        let subToSave;

        if (editId) {
            const index = this.subscriptions.findIndex(s => s.id === editId);
            if (index !== -1) {
                subToSave = {
                    ...this.subscriptions[index],
                    name,
                    category,
                    amount,
                    paymentMethod,
                    billingDay,
                    person: isSplitEnabled ? splitItems.map(s => s.person).join(', ') : person,
                    isSplit: isSplitEnabled,
                    splitDetails: isSplitEnabled ? splitItems : null,
                    updatedAt: new Date().toISOString()
                };
                this.subscriptions[index] = subToSave;
            }
        } else {
            subToSave = {
                id: window.Utils.generateId(),
                name,
                category,
                amount,
                paymentMethod,
                billingDay,
                person: isSplitEnabled ? splitItems.map(s => s.person).join(', ') : person,
                status: 'ativa',
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

    async syncSubscriptionTransactions(sub, forceMonthPrefix) {
        let allTxs = window.Storage.get('transactions') || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentMonthPrefix = forceMonthPrefix || `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        
        const promises = [];
        const monthStr = String(currentMonth + 1).padStart(2, '0');
        const dayStr = String(sub.billingDay || 10).padStart(2, '0');
        const dateStr = `${currentYear}-${monthStr}-${dayStr}`;

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
            // Se já sincronizou neste mês, mas não achou, significa que o usuário EXCLUIU de propósito. Não recriar.
            if (sub.lastSyncedMonth !== currentMonthPrefix) {
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
        
        sub.lastSyncedMonth = currentMonthPrefix;
        promises.push(window.Storage.saveRecord('subscriptions', sub));

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
