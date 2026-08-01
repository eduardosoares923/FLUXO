class TransactionsController {
    constructor() {
        let globalTx = window.Storage.get('transactions') || [];
        
        if (window.currentUser && window.Auth && window.currentUser.role !== 'admin') {
            globalTx = globalTx.filter(tx => window.Auth.canAccessPerson(tx.person, tx));
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
        
        const refreshTxHandler = () => {
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
            this.applyFilters();
        };

        window.addEventListener('dataUpdated', refreshTxHandler);
        window.addEventListener('fluxo:dataChanged', refreshTxHandler);

        this.applyFilters = () => {
            const search = searchInput ? searchInput.value.toLowerCase() : '';
            const type = typeSelect ? typeSelect.value : 'all';
            const cat = catSelect ? catSelect.value : 'all';

            this.filteredTransactions = this.allTransactions.filter(tx => {
                const matchSearch = !search || (tx.description && tx.description.toLowerCase().includes(search));
                const matchType = type === 'all' || tx.type === type;
                const matchCat = cat === 'all' || tx.category === cat;
                return matchSearch && matchType && matchCat;
            });

            // Sort newest first
            this.filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        };

        if (btnFilter) btnFilter.addEventListener('click', () => this.applyFilters());
        if (searchInput) searchInput.addEventListener('keyup', (e) => { if(e.key === 'Enter') this.applyFilters(); });
        
        // Modal Handlers para Nova Transação
        const btnNova = document.getElementById('btnNovaTransacao');
        const btnCloseModal = document.getElementById('closeTxModalBtn');
        const btnCancelModal = document.getElementById('cancelTxBtn');
        const txForm = document.getElementById('txForm');

        if (btnNova) {
            btnNova.addEventListener('click', () => this.openNovaTransacaoModal());
        }

        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => window.UI.closeModal('txModal'));
        }

        if (btnCancelModal) {
            btnCancelModal.addEventListener('click', () => window.UI.closeModal('txModal'));
        }

        if (txForm) {
            txForm.addEventListener('submit', (e) => this.saveTransaction(e));
        }

        // Payment mode toggle (Single / Installments / Recurring)
        const paymentModeSelect = document.getElementById('txPaymentMode');
        const installmentsGroup = document.getElementById('txInstallmentsGroup');
        const recurringGroup = document.getElementById('txRecurringGroup');
        if (paymentModeSelect) {
            paymentModeSelect.addEventListener('change', () => {
                const val = paymentModeSelect.value;
                if (installmentsGroup) installmentsGroup.style.display = val === 'installments' ? 'block' : 'none';
                if (recurringGroup) recurringGroup.style.display = val === 'recurring' ? 'block' : 'none';
                this.updateInstallmentPreview();
            });
        }
        const txInstCount = document.getElementById('txInstallmentsCount');
        const txInstValType = document.getElementById('txInstallmentValueType');
        const txAmountInput = document.getElementById('txAmount');
        if (txInstCount) txInstCount.addEventListener('change', () => this.updateInstallmentPreview());
        if (txInstValType) txInstValType.addEventListener('change', () => this.updateInstallmentPreview());
        if (txAmountInput) txAmountInput.addEventListener('input', () => {
            this.updateInstallmentPreview();
            this.updateSplitSummary();
        });

        // Split Purchase Toggle & Handlers
        const txEnableSplit = document.getElementById('txEnableSplit');
        const txSplitGroup = document.getElementById('txSplitGroup');
        const txSinglePersonGroup = document.getElementById('txSinglePersonGroup');
        const txPerson = document.getElementById('txPerson');

        if (txEnableSplit) {
            txEnableSplit.addEventListener('change', () => {
                const isSplit = txEnableSplit.checked;
                if (txSplitGroup) txSplitGroup.style.display = isSplit ? 'block' : 'none';
                if (txSinglePersonGroup) txSinglePersonGroup.style.display = isSplit ? 'none' : 'block';
                if (txPerson) {
                    if (isSplit) txPerson.removeAttribute('required');
                    else txPerson.setAttribute('required', 'required');
                }
                this.updateSplitSummary();
            });
        }

        const btnSplitEqual = document.getElementById('btnSplitEqual');
        if (btnSplitEqual) {
            btnSplitEqual.addEventListener('click', () => this.splitEqually());
        }

        // Event Delegation for Table Actions
        const tbody = document.getElementById('transactionsTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btnDetails = e.target.closest('[data-action="details"]');
                if (btnDetails) {
                    this.openDetailsModal(btnDetails.dataset.id);
                    return;
                }
                const btnDelete = e.target.closest('[data-action="delete"]');
                if (btnDelete) {
                    this.deleteTransaction(btnDelete.dataset.id);
                    return;
                }
                const btnEdit = e.target.closest('[data-action="edit"]');
                if (btnEdit) {
                    this.editTransaction(btnEdit.dataset.id);
                    return;
                }
            });
        }
        
        const btnDeleteAll = document.getElementById('btnDeleteAllTransactions');
        if (btnDeleteAll) {
            btnDeleteAll.addEventListener('click', () => {
                window.UI.confirmDialog('Tem certeza que deseja EXCLUIR TODOS os lançamentos na visão atual?', 'Atenção Crítica', () => {
                    const promises = this.allTransactions.map(tx => window.Storage.deleteRecord('transactions', tx.id));
                    Promise.all(promises).then(() => {
                        this.allTransactions = [];
                        window.UI.showToast('Todos os lançamentos foram excluídos!', 'success');
                        this.renderTable();
                    });
                });
            });
        }
    }

    populateTxModalOptions() {
        const paymentSelect = document.getElementById('txPaymentMethod');
        const personSelect = document.getElementById('txPerson');

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

        // Populate Split Persons List with custom amount inputs
        const txSplitPersonsList = document.getElementById('txSplitPersonsList');
        if (txSplitPersonsList) {
            txSplitPersonsList.innerHTML = '';
            let personNames = persons.map(p => p.name.trim());
            if (personNames.length === 0) personNames = ['Eduardo', 'Mãe', 'Rodrigo'];

            personNames.forEach(pName => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255,255,255,0.03); padding: 0.4rem 0.75rem; border-radius: 6px; border: 1px solid var(--glass-border);';
                row.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; margin: 0; flex: 1;">
                        <input type="checkbox" class="tx-split-cb" data-person="${window.Utils.escapeHTML(pName)}" style="width: 16px; height: 16px; accent-color: var(--accent-primary);">
                        <span>${window.Utils.escapeHTML(pName)}</span>
                    </label>
                    <div style="display: flex; align-items: center; gap: 0.25rem;">
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">R$</span>
                        <input type="number" step="0.01" min="0" class="form-control tx-split-val" data-person="${window.Utils.escapeHTML(pName)}" placeholder="0,00" style="width: 105px; padding: 0.25rem 0.5rem; font-size: 0.85rem;" disabled>
                    </div>
                `;
                txSplitPersonsList.appendChild(row);
            });

            txSplitPersonsList.querySelectorAll('.tx-split-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const pName = e.target.getAttribute('data-person');
                    const valInput = txSplitPersonsList.querySelector(`.tx-split-val[data-person="${CSS.escape(pName)}"]`);
                    if (valInput) {
                        valInput.disabled = !e.target.checked;
                        if (!e.target.checked) valInput.value = '';
                    }
                    this.updateSplitSummary();
                });
            });

            txSplitPersonsList.querySelectorAll('.tx-split-val').forEach(valInput => {
                valInput.addEventListener('input', () => this.updateSplitSummary());
            });
        }

        const dateInput = document.getElementById('txDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    }

    updateInstallmentPreview() {
        const preview = document.getElementById('txInstallmentPreview');
        const paymentMode = document.getElementById('txPaymentMode');
        if (!preview || !paymentMode || paymentMode.value !== 'installments') {
            if (preview) preview.textContent = '';
            return;
        }
        const amountVal = parseFloat(document.getElementById('txAmount')?.value) || 0;
        const count = parseInt(document.getElementById('txInstallmentsCount')?.value) || 2;
        const valType = document.getElementById('txInstallmentValueType')?.value || 'total';
        if (amountVal <= 0) { preview.textContent = ''; return; }
        let perMonth, total;
        if (valType === 'total') {
            total = amountVal;
            perMonth = Math.round((amountVal / count) * 100) / 100;
        } else {
            perMonth = amountVal;
            total = Math.round((amountVal * count) * 100) / 100;
        }
        preview.textContent = `Resumo: ${count}x de ${window.Utils.formatCurrency(perMonth)} / mês (Total: ${window.Utils.formatCurrency(total)})`;
    }

    updateSplitSummary() {
        const isSplit = document.getElementById('txEnableSplit')?.checked;
        if (!isSplit) return;

        const totalAmount = parseFloat(document.getElementById('txAmount')?.value) || 0;
        let sum = 0;

        document.querySelectorAll('.tx-split-cb:checked').forEach(cb => {
            const pName = cb.getAttribute('data-person');
            const valInput = document.querySelector(`.tx-split-val[data-person="${CSS.escape(pName)}"]`);
            if (valInput && valInput.value) {
                const val = parseFloat(valInput.value);
                if (!isNaN(val) && val > 0) sum += val;
            }
        });

        sum = Math.round(sum * 100) / 100;
        const remaining = Math.max(0, Math.round((totalAmount - sum) * 100) / 100);

        const sumEl = document.getElementById('txSplitSum');
        const remainingEl = document.getElementById('txSplitRemaining');

        if (sumEl) sumEl.textContent = window.Utils.formatCurrency(sum);
        if (remainingEl) {
            remainingEl.textContent = window.Utils.formatCurrency(remaining);
            remainingEl.style.color = remaining === 0 ? 'var(--success)' : 'var(--warning)';
        }
    }

    splitEqually() {
        const totalAmount = parseFloat(document.getElementById('txAmount')?.value) || 0;
        const checkedCbs = Array.from(document.querySelectorAll('.tx-split-cb:checked'));

        if (totalAmount <= 0) {
            window.UI.showToast('Informe o valor total da compra primeiro.', 'error');
            return;
        }

        if (checkedCbs.length === 0) {
            window.UI.showToast('Marque as pessoas que vão dividir a compra.', 'error');
            return;
        }

        const equalShare = Math.floor((totalAmount / checkedCbs.length) * 100) / 100;
        let runningSum = 0;

        checkedCbs.forEach((cb, idx) => {
            const pName = cb.getAttribute('data-person');
            const valInput = document.querySelector(`.tx-split-val[data-person="${CSS.escape(pName)}"]`);
            if (valInput) {
                let share = equalShare;
                if (idx === checkedCbs.length - 1) {
                    share = Math.round((totalAmount - runningSum) * 100) / 100;
                }
                valInput.value = share.toFixed(2);
                runningSum += share;
            }
        });

        this.updateSplitSummary();
    }

    openDetailsModal(id) {
        const tx = this.allTransactions.find(t => t.id === id);
        if (!tx) return;

        const setTxt = (elId, text) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = text;
        };

        setTxt('dtDescription', tx.description);
        
        const dtBadge = document.getElementById('dtBadge');
        if (dtBadge) {
            const isIncome = tx.type === 'income';
            dtBadge.className = isIncome ? 'tx-badge income' : 'tx-badge expense';
            dtBadge.textContent = isIncome ? 'Receita' : 'Despesa';
        }

        setTxt('dtCategory', tx.category || 'Outros');
        setTxt('dtDate', window.Utils.formatDate(tx.date));
        setTxt('dtTotalAmount', window.Utils.formatCurrency(tx.amount));
        setTxt('dtPaymentMethod', this.getPaymentMethodName(tx.paymentMethod));

        let instText = 'À Vista (1/1)';
        if (tx.isRecurring) {
            instText = `Fixa / Recorrente (${tx.recurringFrequency || 'mensal'})`;
        } else if (tx.totalInstallments && tx.totalInstallments > 1) {
            instText = `Parcela ${tx.installmentIndex || 1}/${tx.totalInstallments} de ${window.Utils.formatCurrency(tx.installmentAmount || tx.amount)}`;
        }
        setTxt('dtInstallmentInfo', instText);

        const dtSplitSection = document.getElementById('dtSplitSection');
        const dtSplitPersonsList = document.getElementById('dtSplitPersonsList');

        if (dtSplitPersonsList) {
            dtSplitPersonsList.innerHTML = '';
            if (tx.isSplit && tx.splitDetails && Array.isArray(tx.splitDetails) && tx.splitDetails.length > 0) {
                let listHtml = '';
                tx.splitDetails.forEach(item => {
                    listHtml += `
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.6rem 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fa-solid fa-user-tag" style="color: var(--accent-primary); font-size: 0.85rem;"></i>
                                <span style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${window.Utils.escapeHTML(item.person)}</span>
                            </div>
                            <div style="font-weight: 700; color: var(--accent-primary); font-size: 0.95rem;">${window.Utils.formatCurrency(item.amount)}</div>
                        </div>
                    `;
                });
                dtSplitPersonsList.innerHTML = listHtml;
                if (dtSplitSection) dtSplitSection.style.display = 'block';
            } else {
                dtSplitPersonsList.innerHTML = `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.6rem 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid fa-user" style="color: var(--accent-primary); font-size: 0.85rem;"></i>
                            <span style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${window.Utils.escapeHTML(tx.person || 'Eu')}</span>
                        </div>
                        <div style="font-weight: 700; color: var(--accent-primary); font-size: 0.95rem;">${window.Utils.formatCurrency(tx.amount)}</div>
                    </div>
                `;
                if (dtSplitSection) dtSplitSection.style.display = 'block';
            }
        }

        window.UI.openModal('txDetailsModal');
    }

    openNovaTransacaoModal() {
        const form = document.getElementById('txForm');
        if (form) form.reset();

        const editIdInput = document.getElementById('txEditId');
        if (editIdInput) editIdInput.value = '';

        const modalTitle = document.getElementById('txModalTitle');
        if (modalTitle) modalTitle.textContent = 'Novo Lançamento';

        this.populateTxModalOptions();

        const dateInput = document.getElementById('txDate');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // Reset split & mode groups
        const txEnableSplit = document.getElementById('txEnableSplit');
        if (txEnableSplit) txEnableSplit.checked = false;
        const txSplitGroup = document.getElementById('txSplitGroup');
        if (txSplitGroup) txSplitGroup.style.display = 'none';
        const txSinglePersonGroup = document.getElementById('txSinglePersonGroup');
        if (txSinglePersonGroup) txSinglePersonGroup.style.display = 'block';
        const txPerson = document.getElementById('txPerson');
        if (txPerson) txPerson.setAttribute('required', 'required');

        const installmentsGroup = document.getElementById('txInstallmentsGroup');
        if (installmentsGroup) installmentsGroup.style.display = 'none';
        const recurringGroup = document.getElementById('txRecurringGroup');
        if (recurringGroup) recurringGroup.style.display = 'none';
        const preview = document.getElementById('txInstallmentPreview');
        if (preview) preview.textContent = '';

        window.UI.openModal('txModal');
    }

    editTransaction(id) {
        const tx = this.allTransactions.find(t => t.id === id);
        if (!tx) return;

        const form = document.getElementById('txForm');
        if (form) form.reset();

        this.populateTxModalOptions();

        const editIdInput = document.getElementById('txEditId');
        if (editIdInput) editIdInput.value = tx.id;

        const modalTitle = document.getElementById('txModalTitle');
        if (modalTitle) modalTitle.textContent = 'Editar Lançamento';

        const typeSelect = document.getElementById('txType');
        if (typeSelect) typeSelect.value = tx.type || 'expense';

        const descInput = document.getElementById('txDescription');
        if (descInput) descInput.value = tx.description || '';

        const amountInput = document.getElementById('txAmount');
        if (amountInput) amountInput.value = tx.amount || 0;

        const catSelect = document.getElementById('txCategory');
        if (catSelect) catSelect.value = tx.category || 'Outros';

        const methodSelect = document.getElementById('txPaymentMethod');
        if (methodSelect) methodSelect.value = tx.paymentMethod || 'account';

        const personSelect = document.getElementById('txPerson');
        if (personSelect) personSelect.value = tx.person || 'Eduardo';

        const dateInput = document.getElementById('txDate');
        if (dateInput) dateInput.value = tx.date || new Date().toISOString().split('T')[0];

        const modeSelect = document.getElementById('txPaymentMode');
        if (modeSelect) modeSelect.value = 'single';

        const installmentsGroup = document.getElementById('txInstallmentsGroup');
        if (installmentsGroup) installmentsGroup.style.display = 'none';
        const recurringGroup = document.getElementById('txRecurringGroup');
        if (recurringGroup) recurringGroup.style.display = 'none';

        const preview = document.getElementById('txInstallmentPreview');
        if (preview) preview.textContent = '';

        window.UI.openModal('txModal');
    }

    async saveTransaction(e) {
        e.preventDefault();

        const editId = document.getElementById('txEditId')?.value;
        const type = document.getElementById('txType')?.value || 'expense';
        const description = document.getElementById('txDescription')?.value.trim();
        const amountStr = document.getElementById('txAmount')?.value;
        const category = document.getElementById('txCategory')?.value;
        const paymentMethod = document.getElementById('txPaymentMethod')?.value || 'account';
        const person = document.getElementById('txPerson')?.value || 'Eduardo';
        const dateStr = document.getElementById('txDate')?.value || new Date().toISOString().split('T')[0];
        const paymentMode = document.getElementById('txPaymentMode')?.value || 'single';
        const installmentsCount = parseInt(document.getElementById('txInstallmentsCount')?.value) || 2;
        const installmentValueType = document.getElementById('txInstallmentValueType')?.value || 'total';

        if (!description || !amountStr) {
            window.UI.showToast('Preencha a descrição e o valor.', 'error');
            return;
        }

        const rawAmount = parseFloat(amountStr);
        if (isNaN(rawAmount) || rawAmount <= 0) {
            window.UI.showToast('Informe um valor válido maior que zero.', 'error');
            return;
        }

        const currentUser = window.currentUser || window.Storage.get('session');
        const userId = currentUser ? currentUser.id : '1';

        try {
            if (editId) {
                // Modo Edição
                const existingTx = this.allTransactions.find(t => t.id === editId);
                if (existingTx) {
                    // Estornar limite do cartão anterior se era despesa de cartão
                    if (existingTx.paymentMethod && existingTx.paymentMethod.startsWith('card_') && existingTx.type === 'expense') {
                        const oldCardId = existingTx.paymentMethod.replace('card_', '');
                        const cards = window.Storage.get('cards') || [];
                        const oldCard = cards.find(c => c.id === oldCardId);
                        if (oldCard) {
                            oldCard.usedLimit = Math.max(0, (oldCard.usedLimit || 0) - existingTx.amount);
                            await window.Storage.saveRecord('cards', oldCard);
                        }
                    }

                    const updatedTx = {
                        ...existingTx,
                        type,
                        description,
                        amount: rawAmount,
                        category,
                        paymentMethod,
                        person,
                        date: dateStr,
                        updatedAt: new Date().toISOString()
                    };

                    await window.Storage.saveRecord('transactions', updatedTx);

                    // Debitar limite do novo cartão se for despesa de cartão
                    if (paymentMethod.startsWith('card_') && type === 'expense') {
                        const newCardId = paymentMethod.replace('card_', '');
                        const cards = window.Storage.get('cards') || [];
                        const newCard = cards.find(c => c.id === newCardId);
                        if (newCard) {
                            newCard.usedLimit = (newCard.usedLimit || 0) + rawAmount;
                            await window.Storage.saveRecord('cards', newCard);
                        }
                    }

                    if (window.Audit) {
                        window.Audit.log('TRANSACTION_EDIT', { id: editId, description, amount: rawAmount });
                    }

                    window.UI.closeModal('txModal');
                    window.UI.showToast('Lançamento atualizado com sucesso! ✏️', 'success');

                    let globalTx = window.Storage.get('transactions') || [];
                    if (window.currentUser && window.Auth && window.currentUser.role !== 'admin') {
                        globalTx = globalTx.filter(tx => window.Auth.canAccessPerson(tx.person, tx));
                    }
                    this.allTransactions = globalTx;
                    this.applyFilters();
                    return;
                }
            }

            // Split Purchase Processing (Single master transaction)
            const isSplitEnabled = document.getElementById('txEnableSplit')?.checked;
            let splitItems = [];

            if (isSplitEnabled && !editId) {
                const checkedCbs = Array.from(document.querySelectorAll('.tx-split-cb:checked'));
                if (checkedCbs.length === 0) {
                    window.UI.showToast('Selecione pelo menos uma pessoa para a divisão.', 'error');
                    return;
                }

                let sum = 0;
                for (const cb of checkedCbs) {
                    const personName = cb.getAttribute('data-person');
                    const valInput = document.querySelector(`.tx-split-val[data-person="${CSS.escape(personName)}"]`);
                    const val = parseFloat(valInput?.value || 0);
                    if (isNaN(val) || val <= 0) {
                        window.UI.showToast(`Informe o valor da parte para ${personName}.`, 'error');
                        return;
                    }
                    splitItems.push({ person: personName, amount: val });
                    sum += val;
                }

                sum = Math.round(sum * 100) / 100;
                const diff = Math.abs(sum - rawAmount);
                if (diff > 0.05) {
                    window.UI.showToast(`A soma das partes (${window.Utils.formatCurrency(sum)}) deve ser igual ao valor total da compra (${window.Utils.formatCurrency(rawAmount)}).`, 'error');
                    return;
                }
            }

            if (paymentMode === 'recurring') {
                // Fixa / Recorrente (Spotify, YouTube Premium, Faculdade, Claro Flex...)
                const frequency = document.getElementById('txRecurringFrequency')?.value || 'mensal';
                const monthsRaw = document.getElementById('txRecurringMonths')?.value || '12';
                const status = document.getElementById('txRecurringStatus')?.value || 'ativo';

                const isContinuous = monthsRaw === 'continuous';
                const count = isContinuous ? 12 : (parseInt(monthsRaw) || 12);
                const isPaused = status === 'pausado';

                const baseDateParts = dateStr.split('-');
                const baseYear = parseInt(baseDateParts[0]);
                const baseMonth = parseInt(baseDateParts[1]) - 1;
                const baseDay = parseInt(baseDateParts[2]);

                const savePromises = [];
                for (let i = 0; i < count; i++) {
                    let targetDate;
                    if (frequency === 'semanal') {
                        targetDate = new Date(baseYear, baseMonth, baseDay + (i * 7));
                    } else if (frequency === 'anual') {
                        targetDate = new Date(baseYear + i, baseMonth, baseDay);
                    } else {
                        // Mensal (Default)
                        const lastDayOfTargetMonth = new Date(baseYear, baseMonth + i + 1, 0).getDate();
                        const validDay = Math.min(baseDay, lastDayOfTargetMonth);
                        targetDate = new Date(baseYear, baseMonth + i, validDay);
                    }

                    const instYear = targetDate.getFullYear();
                    const instMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const instDay = String(targetDate.getDate()).padStart(2, '0');
                    const instDateStr = `${instYear}-${instMonth}-${instDay}`;

                    const recTx = {
                        id: window.Utils.generateId(),
                        type,
                        description: description,
                        amount: rawAmount,
                        category,
                        paymentMethod,
                        person,
                        date: instDateStr,
                        isRecurring: true,
                        recurringFrequency: frequency,
                        isContinuous,
                        recurringStatus: status,
                        isPaused,
                        userId,
                        createdAt: new Date().toISOString()
                    };
                    savePromises.push(window.Storage.saveRecord('transactions', recTx));
                }
                await Promise.all(savePromises);

                if (paymentMethod.startsWith('card_') && type === 'expense' && !isPaused) {
                    const cardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const card = cards.find(c => c.id === cardId);
                    if (card) {
                        card.usedLimit = (card.usedLimit || 0) + (rawAmount * count);
                        await window.Storage.saveRecord('cards', card);
                    }
                }

                if (window.Audit) {
                    window.Audit.log('TRANSACTION_CREATE_RECURRING', { description, amount: rawAmount, type, frequency, count, status });
                }

                window.UI.closeModal('txModal');
                const statusLabel = isPaused ? ' (Pausado ⏸️)' : ' 🎉';
                window.UI.showToast(`Lançamento recorrente "${description}" (${frequency}) de ${window.Utils.formatCurrency(rawAmount)} agendado!${statusLabel}`, 'success');

            } else if (paymentMode === 'installments' && installmentsCount >= 2) {
                // Parcelado
                let installmentAmount, totalAmount;
                if (installmentValueType === 'total') {
                    totalAmount = rawAmount;
                    installmentAmount = Math.round((rawAmount / installmentsCount) * 100) / 100;
                } else {
                    installmentAmount = rawAmount;
                    totalAmount = Math.round((rawAmount * installmentsCount) * 100) / 100;
                }

                const baseDateParts = dateStr.split('-');
                const baseYear = parseInt(baseDateParts[0]);
                const baseMonth = parseInt(baseDateParts[1]) - 1;
                const baseDay = parseInt(baseDateParts[2]);

                const savePromises = [];
                for (let i = 0; i < installmentsCount; i++) {
                    const lastDayOfTargetMonth = new Date(baseYear, baseMonth + i + 1, 0).getDate();
                    const validDay = Math.min(baseDay, lastDayOfTargetMonth);
                    const finalInstDate = new Date(baseYear, baseMonth + i, validDay);
                    const instYear = finalInstDate.getFullYear();
                    const instMonth = String(finalInstDate.getMonth() + 1).padStart(2, '0');
                    const instDay = String(finalInstDate.getDate()).padStart(2, '0');
                    const instDateStr = `${instYear}-${instMonth}-${instDay}`;

                    const instTx = {
                        id: window.Utils.generateId(),
                        type,
                        description: `${description} (${i + 1}/${installmentsCount})`,
                        amount: installmentAmount,
                        installmentAmount: installmentAmount,
                        category,
                        paymentMethod,
                        person: isSplitEnabled ? splitItems.map(s => s.person).join(', ') : person,
                        date: instDateStr,
                        installmentIndex: i + 1,
                        totalInstallments: installmentsCount,
                        isSplit: isSplitEnabled,
                        splitDetails: isSplitEnabled ? splitItems.map(s => ({ person: s.person, amount: Math.round((s.amount / installmentsCount) * 100) / 100 })) : null,
                        userId,
                        createdAt: new Date().toISOString()
                    };
                    savePromises.push(window.Storage.saveRecord('transactions', instTx));
                }
                await Promise.all(savePromises);

                if (paymentMethod.startsWith('card_') && type === 'expense') {
                    const cardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const card = cards.find(c => c.id === cardId);
                    if (card) {
                        card.usedLimit = (card.usedLimit || 0) + totalAmount;
                        await window.Storage.saveRecord('cards', card);
                    }
                }

                if (window.Audit) {
                    window.Audit.log('TRANSACTION_CREATE', { description, amount: totalAmount, type, installments: installmentsCount });
                }

                window.UI.closeModal('txModal');
                window.UI.showToast(`Lançamento parcelado em ${installmentsCount}x de ${window.Utils.formatCurrency(installmentAmount)} realizado com sucesso! 🎉`, 'success');

            } else {
                // Single Master Transaction (À Vista)
                const newTx = {
                    id: window.Utils.generateId(),
                    type,
                    description,
                    amount: rawAmount,
                    category,
                    paymentMethod,
                    person: isSplitEnabled ? splitItems.map(s => s.person).join(', ') : person,
                    date: dateStr,
                    isSplit: isSplitEnabled,
                    splitDetails: isSplitEnabled ? splitItems : null,
                    userId,
                    createdAt: new Date().toISOString()
                };

                await window.Storage.saveRecord('transactions', newTx);

                if (paymentMethod.startsWith('card_') && type === 'expense') {
                    const cardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const card = cards.find(c => c.id === cardId);
                    if (card) {
                        card.usedLimit = (card.usedLimit || 0) + rawAmount;
                        await window.Storage.saveRecord('cards', card);
                    }
                }

                if (window.Audit) {
                    window.Audit.log('TRANSACTION_CREATE', { description, amount: rawAmount, type });
                }

                window.UI.closeModal('txModal');
                window.UI.showToast('Lançamento realizado com sucesso!', 'success');
            }

            let globalTx = window.Storage.get('transactions') || [];
            if (window.currentUser && window.Auth && window.currentUser.role !== 'admin') {
                globalTx = globalTx.filter(tx => window.Auth.canAccessPerson(tx.person, tx));
            }
            this.allTransactions = globalTx;
            this.applyFilters();
        } catch (err) {
            console.error('Erro ao salvar lançamento:', err);
            window.UI.showToast('Erro ao salvar lançamento: ' + (err.message || 'Tente novamente'), 'error');
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
                
                let promise = Promise.resolve();

                // Refund credit card limits if it was a card expense
                if (tx.paymentMethod && tx.paymentMethod.startsWith('card_') && tx.type === 'expense') {
                    const cardId = tx.paymentMethod.replace('card_', '');
                    const cardIndex = this.cards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        this.cards[cardIndex].usedLimit -= tx.amount;
                        if (this.cards[cardIndex].usedLimit < 0) this.cards[cardIndex].usedLimit = 0;
                        promise = window.Storage.saveRecord('cards', this.cards[cardIndex]);
                    }
                }
                
                promise.then(() => window.Storage.deleteRecord('transactions', id)).then(() => {
                    window.UI.showToast('Lançamento excluído com sucesso!', 'success');
                });
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
            let modeBadge = '';
            if (tx.isRecurring || (tx.description && tx.description.toLowerCase().includes('(fixa)'))) {
                modeBadge = `<span style="font-size: 0.7rem; background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; margin-left: 0.35rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i class="fa-solid fa-rotate"></i> Fixa</span>`;
            } else if (tx.totalInstallments && tx.totalInstallments > 1) {
                modeBadge = `<span style="font-size: 0.7rem; background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; margin-left: 0.35rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i class="fa-solid fa-layer-group"></i> ${tx.installmentIndex || 1}/${tx.totalInstallments}</span>`;
            } else {
                modeBadge = `<span style="font-size: 0.7rem; background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.2); padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 600; margin-left: 0.35rem;">À Vista</span>`;
            }

            let personCell = '';
            if (tx.isSplit) {
                const count = (tx.splitDetails && Array.isArray(tx.splitDetails)) ? tx.splitDetails.length : 2;
                personCell = `<td><span style="font-size: 0.78rem; font-weight: 600; color: #818cf8; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); padding: 0.15rem 0.5rem; border-radius: 4px; cursor: pointer;" onclick="window.transactionsController.openDetailsModal('${tx.id}')" title="Clique para ver detalhes da divisão"><i class="fa-solid fa-people-arrows"></i> Dividido (${count})</span></td>`;
            } else {
                personCell = `<td><span style="font-size: 0.78rem; font-weight: 600; color: var(--accent-primary); background: rgba(99,102,241,0.08); padding: 0.15rem 0.5rem; border-radius: 4px;"><i class="fa-solid fa-user-tag" style="font-size: 0.7rem;"></i> ${window.Utils.escapeHTML(tx.person || 'Eu')}</span></td>`;
            }

            htmlBuffer += `
                <tr style="cursor: pointer;" onclick="if (!event.target.closest('.btn')) window.transactionsController.openDetailsModal('${tx.id}')">
                    <td>${window.Utils.formatDate(tx.date)}</td>
                    <td style="font-weight: 500;">${window.Utils.escapeHTML(tx.description)}${modeBadge}</td>
                    <td>${window.Utils.escapeHTML(tx.category)}</td>
                    <td>${window.Utils.escapeHTML(this.getPaymentMethodName(tx.paymentMethod))}</td>
                    ${personCell}
                    <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
                    <td style="color: ${amountColor}; font-weight: 600;">${sign} ${window.Utils.formatCurrency(tx.amount)}</td>
                    <td class="tx-actions" style="display: flex; gap: 0.35rem; justify-content: flex-end;">
                        <button type="button" class="btn btn-ghost info btn-sm" title="Ver Detalhes" onclick="event.stopPropagation(); window.transactionsController.openDetailsModal('${tx.id}')">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="btn btn-ghost primary btn-sm" title="Editar" onclick="event.stopPropagation(); window.transactionsController.editTransaction('${tx.id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn btn-ghost danger btn-sm" title="Excluir" onclick="event.stopPropagation(); window.transactionsController.deleteTransaction('${tx.id}')">
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

const initTransactions = () => {
    if (!window.transactionsController && document.getElementById('transactionsTableBody')) {
        window.transactionsController = new TransactionsController();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransactions);
} else {
    initTransactions();
}
