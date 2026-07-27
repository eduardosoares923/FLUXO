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
        if (txAmountInput) txAmountInput.addEventListener('input', () => this.updateInstallmentPreview());

        // Event Delegation for Table Actions
        const tbody = document.getElementById('transactionsTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
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

        // Reset mode groups
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

            if (paymentMode === 'recurring') {
                // Fixa / Recorrente (Spotify, YouTube Premium, Faculdade, Claro Flex...)
                const recurringMonths = parseInt(document.getElementById('txRecurringMonths')?.value) || 12;

                const baseDateParts = dateStr.split('-');
                const baseYear = parseInt(baseDateParts[0]);
                const baseMonth = parseInt(baseDateParts[1]) - 1;
                const baseDay = parseInt(baseDateParts[2]);

                const savePromises = [];
                for (let i = 0; i < recurringMonths; i++) {
                    const lastDayOfTargetMonth = new Date(baseYear, baseMonth + i + 1, 0).getDate();
                    const validDay = Math.min(baseDay, lastDayOfTargetMonth);
                    const finalInstDate = new Date(baseYear, baseMonth + i, validDay);
                    const instYear = finalInstDate.getFullYear();
                    const instMonth = String(finalInstDate.getMonth() + 1).padStart(2, '0');
                    const instDay = String(finalInstDate.getDate()).padStart(2, '0');
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
                        userId,
                        createdAt: new Date().toISOString()
                    };
                    savePromises.push(window.Storage.saveRecord('transactions', recTx));
                }
                await Promise.all(savePromises);

                if (paymentMethod.startsWith('card_') && type === 'expense') {
                    const cardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const card = cards.find(c => c.id === cardId);
                    if (card) {
                        card.usedLimit = (card.usedLimit || 0) + (rawAmount * recurringMonths);
                        await window.Storage.saveRecord('cards', card);
                    }
                }

                if (window.Audit) {
                    window.Audit.log('TRANSACTION_CREATE_RECURRING', { description, amount: rawAmount, type, months: recurringMonths });
                }

                window.UI.closeModal('txModal');
                window.UI.showToast(`Lançamento fixo mensal "${description}" (${window.Utils.formatCurrency(rawAmount)}/mês) agendado para os próximos ${recurringMonths} meses! 🔄`, 'success');

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
                        category,
                        paymentMethod,
                        person,
                        date: instDateStr,
                        installmentIndex: i + 1,
                        totalInstallments: installmentsCount,
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
                // À Vista (1x)
                const newTx = {
                    id: window.Utils.generateId(),
                    type,
                    description,
                    amount: rawAmount,
                    category,
                    paymentMethod,
                    person,
                    date: dateStr,
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

            htmlBuffer += `
                <tr>
                    <td>${window.Utils.formatDate(tx.date)}</td>
                    <td style="font-weight: 500;">${window.Utils.escapeHTML(tx.description)}${modeBadge}</td>
                    <td>${window.Utils.escapeHTML(tx.category)}</td>
                    <td>${window.Utils.escapeHTML(this.getPaymentMethodName(tx.paymentMethod))}</td>
                    <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
                    <td style="color: ${amountColor}; font-weight: 600;">${sign} ${window.Utils.formatCurrency(tx.amount)}</td>
                    <td class="tx-actions" style="display: flex; gap: 0.35rem; justify-content: flex-end;">
                        <button class="btn btn-ghost primary btn-sm" title="Editar" data-action="edit" data-id="${tx.id}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
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
