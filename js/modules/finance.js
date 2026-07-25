class FinanceController {
    constructor() {
        let allTransactions = window.Storage.get('transactions') || [];
        
        // Filtrar transações por usuário (se não for admin/gerente)
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            // 'config_system' é permitido apenas para Admin e Gerente (gerente não pode, na verdade eu defini config_system como forbidden para gerente no app.js, peraí)
            // Vou usar o cargo direto
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                allTransactions = allTransactions.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
            }
        }
        
        this.transactions = allTransactions;
        this.currentNavDate = new Date();
        this.init();
        this.bindEvents();
    }

    init() {
        const dateInput = document.getElementById('txDate');
        if (dateInput) {
            dateInput.valueAsDate = new Date();
        }
        
        const paymentSelect = document.getElementById('txPaymentMethod');
        const personSelect = document.getElementById('txPerson');
        
        let accounts = window.Storage.get('accounts') || [];
        let cards = window.Storage.get('cards') || [];

        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                accounts = accounts.filter(a => a.owner && window.currentUser.name && a.owner.trim().toLowerCase() === window.currentUser.name.toLowerCase());
                cards = cards.filter(c => c.holder && window.currentUser.name && c.holder.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }

        // Popular Forma de Pgto com Contas e Cartões
        if (paymentSelect) {
            paymentSelect.innerHTML = '<option value="account">Conta Corrente</option>';
            
            accounts.forEach(a => {
                if (a.id !== 'default_account') {
                    const opt = document.createElement('option');
                    opt.value = `acc_${a.id}`;
                    opt.textContent = `Conta: ${a.name}`;
                    paymentSelect.appendChild(opt);
                }
            });

            cards.forEach(c => {
                const opt = document.createElement('option');
                opt.value = `card_${c.id}`;
                opt.textContent = `Cartão: ${c.name}`;
                paymentSelect.appendChild(opt);
            });
        }

        // Popular Quem Gastou (Pessoas)
        const personList = document.getElementById('personList');
        if (personList) {
            personList.innerHTML = '<option value="Eu"></option>';
            const personMap = new Map(); // map lowercase to original case
            
            // From accounts
            accounts.forEach(a => { 
                if (a.owner) {
                    const name = a.owner.trim();
                    if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
                } 
            });
            // From cards
            cards.forEach(c => { 
                if (c.holder) {
                    const name = c.holder.trim();
                    if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
                } 
            });
            // From transactions
            this.transactions.forEach(tx => {
                if (tx.person) {
                    const name = tx.person.trim();
                    if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
                }
            });

            personMap.forEach((originalName, lowerName) => {
                if (lowerName !== 'eu') { // Eu is already hardcoded
                    const opt = document.createElement('option');
                    opt.value = originalName;
                    personList.appendChild(opt);
                }
            });
        }

        if (paymentSelect) {
            paymentSelect.innerHTML = ''; // Clear default options
            
            // 1. Popular Contas Bancárias
            const groupAcc = document.createElement('optgroup');
            groupAcc.label = "Contas";
            
            if (accounts.length === 0) {
                const opt = document.createElement('option');
                opt.value = 'account';
                opt.textContent = 'Conta Corrente Padrão';
                groupAcc.appendChild(opt);
            } else {
                accounts.forEach(acc => {
                    const opt = document.createElement('option');
                    opt.value = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
                    opt.textContent = acc.name;
                    groupAcc.appendChild(opt);
                });
            }
            paymentSelect.appendChild(groupAcc);

            // 2. Popular Cartões de Crédito
            if (cards.length > 0) {
                const groupCard = document.createElement('optgroup');
                groupCard.label = "Cartões de Crédito";
                cards.forEach(card => {
                    const opt = document.createElement('option');
                    opt.value = `card_${card.id}`;
                    opt.textContent = `${card.name} (Final ${card.last4})`;
                    groupCard.appendChild(opt);
                });
                paymentSelect.appendChild(groupCard);
            }
        }
        
        this.updateDashboard();
    }

    bindEvents() {
        // Modal Handlers
        const btnNova = document.getElementById('btnNovaTransacao');
        const btnClose = document.getElementById('closeModalBtn');
        const modal = document.getElementById('transactionModal');
        const form = document.getElementById('transactionForm');

        if (btnNova) btnNova.addEventListener('click', () => {
            if (form) form.reset();
            document.getElementById('editTxId').value = '';
            document.querySelector('#transactionModal .modal-title').textContent = 'Nova Transação';
            document.getElementById('txDate').valueAsDate = new Date();
            window.UI.openModal('transactionModal');
        });
        
        if (btnClose) btnClose.addEventListener('click', () => window.UI.closeModal('transactionModal'));
        
        const installOpt = document.getElementById('txInstallmentOption');
        const installGroup = document.getElementById('installmentsCountGroup');
        
        if (installOpt) {
            installOpt.addEventListener('change', (e) => {
                if (e.target.value === 'yes') {
                    installGroup.style.display = 'block';
                } else {
                    installGroup.style.display = 'none';
                }
            });
        }
        
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTransaction();
                window.UI.closeModal('transactionModal');
                form.reset();
                window.UI.showToast('Transação salva com sucesso!', 'success');
            });
        }
        
        const refreshHandler = () => {
            let allTx = window.Storage.get('transactions') || [];
            if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
                if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                    allTx = allTx.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
                }
            }
            this.transactions = allTx;
            this.updateDashboard();
        };

        window.addEventListener('dataUpdated', refreshHandler);
        window.addEventListener('fluxo:dataChanged', refreshHandler);

        // Month Navigation Handlers
        const btnPrevMonth = document.getElementById('btnPrevMonth');
        const btnNextMonth = document.getElementById('btnNextMonth');
        const btnTodayMonth = document.getElementById('btnTodayMonth');

        if (btnPrevMonth) {
            btnPrevMonth.addEventListener('click', () => {
                this.currentNavDate.setMonth(this.currentNavDate.getMonth() - 1);
                this.updateMonthDisplay();
                this.updateDashboard();
            });
        }

        if (btnNextMonth) {
            btnNextMonth.addEventListener('click', () => {
                this.currentNavDate.setMonth(this.currentNavDate.getMonth() + 1);
                this.updateMonthDisplay();
                this.updateDashboard();
            });
        }

        if (btnTodayMonth) {
            btnTodayMonth.addEventListener('click', () => {
                this.currentNavDate = new Date();
                this.updateMonthDisplay();
                this.updateDashboard();
            });
        }

        this.updateMonthDisplay();
    }

    updateMonthDisplay() {
        const display = document.getElementById('currentMonthDisplay');
        if (!display) return;
        
        const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        const m = monthNames[this.currentNavDate.getMonth()];
        const y = this.currentNavDate.getFullYear();
        display.textContent = `${m} de ${y}`;
    }

    openEditModal(id) {
        const tx = this.transactions.find(t => t.id === id);
        if (!tx) return;

        document.getElementById('editTxId').value = tx.id;
        document.querySelector('#transactionModal .modal-title').textContent = 'Editar Transação';
        
        document.getElementById('txType').value = tx.type;
        document.getElementById('txDesc').value = tx.description.replace(/ \(\d+\/\d+\)$/, ''); // Remove (1/2) suffix if present
        document.getElementById('txAmount').value = tx.amount;
        document.getElementById('txDate').value = tx.date;
        document.getElementById('txCategory').value = tx.category;
        
        if (document.getElementById('txPaymentMethod')) {
            document.getElementById('txPaymentMethod').value = tx.paymentMethod || 'account';
        }
        
        if (document.getElementById('txPerson')) {
            document.getElementById('txPerson').value = tx.person || 'Eu';
        }
        
        const installOpt = document.getElementById('txInstallmentOption');
        const installGroup = document.getElementById('installmentsCountGroup');
        if (installOpt) {
            installOpt.value = 'no';
            installGroup.style.display = 'none';
            // Disable installment modification on edit to keep things safe for now
            installOpt.disabled = true;
        }

        window.UI.openModal('transactionModal');
    }

    saveTransaction() {
        const editId = document.getElementById('editTxId') ? document.getElementById('editTxId').value : '';
        const type = document.getElementById('txType').value;
        const desc = document.getElementById('txDesc').value;
        const totalAmount = parseFloat(document.getElementById('txAmount').value);
        const dateStr = document.getElementById('txDate').value;
        const category = document.getElementById('txCategory').value;
        const paymentMethod = document.getElementById('txPaymentMethod') ? document.getElementById('txPaymentMethod').value : 'account';
        const person = document.getElementById('txPerson') ? document.getElementById('txPerson').value : 'Eu';
        
        const installOpt = document.getElementById('txInstallmentOption');
        const isInstallment = (installOpt && !installOpt.disabled) ? installOpt.value === 'yes' : false;
        const installmentsCount = document.getElementById('txInstallments') ? parseInt(document.getElementById('txInstallments').value) : 1;

        let modifiedTx = [];
        let promises = [];

        if (editId) {
            // EDIT LOGIC
            const txIndex = this.transactions.findIndex(t => t.id === editId);
            if (txIndex > -1) {
                const oldTx = this.transactions[txIndex];
                
                // 1. Estornar limite antigo se era cartÃ£o
                if (oldTx.paymentMethod && oldTx.paymentMethod.startsWith('card_')) {
                    const oldCardId = oldTx.paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const oldCardIndex = cards.findIndex(c => c.id === oldCardId);
                    if (oldCardIndex > -1) {
                        if (oldTx.type === 'expense') {
                            cards[oldCardIndex].usedLimit -= oldTx.amount;
                        } else if (oldTx.type === 'income') {
                            cards[oldCardIndex].usedLimit += oldTx.amount;
                        }
                        if (cards[oldCardIndex].usedLimit < 0) cards[oldCardIndex].usedLimit = 0;
                        promises.push(window.Storage.saveRecord('cards', cards[oldCardIndex]));
                    }
                }
                
                // 2. Atualizar transaÃ§Ã£o
                this.transactions[txIndex] = {
                    ...oldTx,
                    type,
                    description: desc,
                    amount: totalAmount,
                    date: dateStr,
                    category,
                    paymentMethod,
                    person,
                    updatedAt: new Date().toISOString()
                };
                modifiedTx.push(this.transactions[txIndex]);

                // 3. Aplicar novo limite se o novo mÃ©todo for cartÃ£o
                if (paymentMethod.startsWith('card_')) {
                    const newCardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const newCardIndex = cards.findIndex(c => c.id === newCardId);
                    if (newCardIndex > -1) {
                        if (type === 'expense') {
                            cards[newCardIndex].usedLimit += totalAmount;
                        } else if (type === 'income') {
                            cards[newCardIndex].usedLimit -= totalAmount;
                            if (cards[newCardIndex].usedLimit < 0) cards[newCardIndex].usedLimit = 0;
                        }
                        promises.push(window.Storage.saveRecord('cards', cards[newCardIndex]));
                    }
                }
            }
        } else {
            // CREATE LOGIC
            if (isInstallment && installmentsCount > 1) {
                const installmentAmount = totalAmount / installmentsCount;
                const roundedAmount = parseFloat(installmentAmount.toFixed(2));
                
                const [year, month, day] = dateStr.split('-');
                let baseDate = new Date(year, month - 1, day);

                for (let i = 1; i <= installmentsCount; i++) {
                    const txDate = new Date(baseDate);
                    txDate.setMonth(baseDate.getMonth() + (i - 1));
                    
                    const yyyy = txDate.getFullYear();
                    const mm = String(txDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(txDate.getDate()).padStart(2, '0');

                    const newTx = {
                        id: window.Utils.generateId(),
                        type,
                        description: `${desc} (${i}/${installmentsCount})`,
                        amount: roundedAmount,
                        date: `${yyyy}-${mm}-${dd}`,
                        category,
                        paymentMethod,
                        person,
                        createdAt: new Date().toISOString(),
                        isInstallment: true,
                        installmentIndex: i,
                        totalInstallments: installmentsCount
                    };
                    this.transactions.push(newTx);
                    modifiedTx.push(newTx);
                }
            } else {
                const newTx = {
                    id: window.Utils.generateId(),
                    type,
                    description: desc,
                    amount: totalAmount,
                    date: dateStr,
                    category,
                    paymentMethod,
                    person,
                    createdAt: new Date().toISOString(),
                    isInstallment: false
                };
                this.transactions.push(newTx);
                modifiedTx.push(newTx);
            }
            
            // Increment card limit for new transaction
            if (paymentMethod.startsWith('card_')) {
                const cardId = paymentMethod.replace('card_', '');
                const cards = window.Storage.get('cards') || [];
                const cardIndex = cards.findIndex(c => c.id === cardId);
                if (cardIndex > -1) {
                    if (type === 'expense') {
                        cards[cardIndex].usedLimit += totalAmount;
                    } else if (type === 'income') {
                        cards[cardIndex].usedLimit -= totalAmount;
                        if (cards[cardIndex].usedLimit < 0) cards[cardIndex].usedLimit = 0;
                    }
                    promises.push(window.Storage.saveRecord('cards', cards[cardIndex]));
                }
            }
        }
        
        if (installOpt) installOpt.disabled = false;
        
        modifiedTx.forEach(tx => {
            if (!tx.userId && window.currentUser) tx.userId = window.currentUser.id;
            promises.push(window.Storage.saveRecord('transactions', tx));
        });
        
        Promise.all(promises).then(() => {
            window.dispatchEvent(new Event('dataUpdated'));
        });
    }

    renderDashboardCards() {
        const listEl = document.getElementById('dashboardCardsList');
        if (!listEl) return;

        let cards = window.Storage.get('cards') || [];
        
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                cards = cards.filter(c => c.holder && window.currentUser.name && c.holder.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }
        
        listEl.innerHTML = '';
        if (cards.length === 0) {
            listEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem 0;">Nenhum cartão cadastrado.</div>';
            return;
        }

        const targetYear = this.currentNavDate.getFullYear();
        const targetMonth = String(this.currentNavDate.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `${targetYear}-${targetMonth}`;

        const cardTotals = this.transactions.reduce((acc, tx) => {
            if (tx.type === 'expense' && tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                const cardId = tx.paymentMethod.replace('card_', '');
                const card = cards.find(c => c.id === cardId);
                const closeD = card ? (card.closeDay || 1) : 1;
                const dueD = card ? (card.dueDay || 10) : 10;
                
                const invMonth = window.Utils.getCardInvoiceMonth(tx.date, closeD, dueD);
                if (invMonth === currentMonthPrefix) {
                    acc[cardId] = (acc[cardId] || 0) + tx.amount;
                }
            }
            return acc;
        }, {});

        cards.forEach(card => {
            const faturaAtual = cardTotals[card.id] || 0;

            const cardEl = document.createElement('div');
            cardEl.style.cssText = `
                background: var(--bg-secondary);
                border: 1px solid var(--glass-border);
                border-left: 4px solid ${card.color || 'var(--accent-primary)'};
                border-radius: var(--radius-md);
                padding: 0.75rem 1rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
            `;
            cardEl.onclick = () => window.location.href = 'cards.html';

            cardEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: ${card.color || 'var(--accent-primary)'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem;">
                        <i class="fa-solid fa-credit-card"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${window.Utils.escapeHTML(card.name)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Final ${window.Utils.escapeHTML(card.last4)} &bull; Vence dia ${window.Utils.escapeHTML(card.dueDay)}</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Fatura do Mês</div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--danger);">${window.Utils.formatCurrency(faturaAtual)}</div>
                </div>
            `;
            listEl.appendChild(cardEl);
        });
    }

    renderDashboardAccounts() {
        const listEl = document.getElementById('dashboardAccountsList');
        if (!listEl) return;

        let accounts = window.Storage.get('accounts') || [];
        
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                accounts = accounts.filter(a => a.owner && window.currentUser.name && a.owner.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }
        
        listEl.innerHTML = '';
        if (accounts.length === 0) {
            listEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem 0;">Nenhuma conta cadastrada.</div>';
            return;
        }

        const accountTotals = this.transactions.reduce((accMap, tx) => {
            if (tx.paymentMethod) {
                if (!accMap[tx.paymentMethod]) accMap[tx.paymentMethod] = { income: 0, expense: 0 };
                if (tx.type === 'income') accMap[tx.paymentMethod].income += tx.amount;
                else if (tx.type === 'expense') accMap[tx.paymentMethod].expense += tx.amount;
            }
            return accMap;
        }, {});

        accounts.forEach(acc => {
            const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
            const totals = accountTotals[accIdStr] || { income: 0, expense: 0 };
            const initialBalance = parseFloat(acc.balance) || 0;
            const currentBalance = initialBalance + totals.income - totals.expense;

            const iconClass = acc.type === 'wallet' ? 'fa-wallet' : (acc.type === 'savings' ? 'fa-piggy-bank' : 'fa-building-columns');

            const accEl = document.createElement('div');
            accEl.style.cssText = `
                background: var(--bg-secondary);
                border: 1px solid var(--glass-border);
                border-left: 4px solid ${acc.color || 'var(--accent-primary)'};
                border-radius: var(--radius-md);
                padding: 0.75rem 1rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
            `;
            accEl.onclick = () => window.location.href = 'accounts.html';

            accEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(99,102,241,0.1); display: flex; align-items: center; justify-content: center; color: ${acc.color || 'var(--accent-primary)'}; font-size: 1rem;">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${window.Utils.escapeHTML(acc.name)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${acc.owner ? window.Utils.escapeHTML(acc.owner) : 'Titular'}</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Saldo</div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: ${currentBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">${window.Utils.formatCurrency(currentBalance)}</div>
                </div>
            `;
            listEl.appendChild(accEl);
        });
    }

    renderDashboardPersons() {
        const section = document.getElementById('dashboardPersonsSection');
        const listEl = document.getElementById('dashboardPersonsList');
        if (!section || !listEl) return;

        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        
        // Find unique persons (case insensitive)
        const personMap = new Map();
        accounts.forEach(a => { 
            if (a.owner) {
                const name = a.owner.trim();
                if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
            } 
        });
        cards.forEach(c => { 
            if (c.holder) {
                const name = c.holder.trim();
                if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
            } 
        });
        this.transactions.forEach(tx => {
            if (tx.person) {
                const name = tx.person.trim();
                if (!personMap.has(name.toLowerCase())) personMap.set(name.toLowerCase(), name);
            }
        });
        
        if (personMap.size === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        listEl.innerHTML = '';

        const todayStr = new Date().toISOString().split('T')[0];

        personMap.forEach((personOriginalName, personLower) => {
            let income = 0;
            let expense = 0;
            let cardsTotal = 0;
            let futureInstallments = 0;

            let initialBalance = 0;

            // Which accounts and cards belong to this person? (case insensitive match)
            const personAccounts = accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === personLower).map(a => {
                initialBalance += parseFloat(a.balance) || 0;
                return a.id === 'default_account' ? 'account' : `acc_${a.id}`;
            });

            const personCards = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === personLower).map(c => `card_${c.id}`);

            this.transactions.forEach(tx => {
                let belongsToPerson = false;
                
                // If tx.person is defined, trust it (case insensitive). Otherwise fallback to guessing from paymentMethod.
                if (tx.person) {
                    if (tx.person.trim().toLowerCase() === personLower) belongsToPerson = true;
                } else {
                    if (personAccounts.includes(tx.paymentMethod) || personCards.includes(tx.paymentMethod)) {
                        belongsToPerson = true;
                    }
                }

                if (belongsToPerson) {
                    if (tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                        if (tx.type === 'expense') {
                            if (tx.date <= todayStr) cardsTotal += tx.amount;
                            else futureInstallments += tx.amount;
                        }
                    } else {
                        // Account
                        if (tx.type === 'income') income += tx.amount;
                        else expense += tx.amount;
                    }
                }
            });

            const balance = initialBalance + income - expense - cardsTotal;
            
            // Skip rendering if the person has zero activity and zero balance
            if (income === 0 && expense === 0 && cardsTotal === 0 && futureInstallments === 0 && initialBalance === 0) {
                return;
            }

            const personCard = document.createElement('div');
            personCard.style.cssText = `
                background: var(--bg-secondary);
                border: 1px solid var(--glass-border);
                border-radius: var(--radius-lg);
                padding: 1.5rem;
                box-shadow: var(--shadow-sm);
                min-width: 300px;
                flex: 0 0 auto;
                scroll-snap-align: start;
            `;

            personCard.innerHTML = `
                <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-primary); border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem;">
                    <i class="fa-solid fa-user" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> ${window.Utils.escapeHTML(personOriginalName)}
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Receitas:</span>
                    <span style="font-weight: 600; color: var(--success);">${window.Utils.formatCurrency(income)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Despesas:</span>
                    <span style="font-weight: 600; color: var(--danger);">${window.Utils.formatCurrency(expense)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Cartões (Atuais):</span>
                    <span style="font-weight: 600; color: var(--warning);">${window.Utils.formatCurrency(cardsTotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <span style="color: var(--text-secondary);">Parcelas Futuras:</span>
                    <span style="font-weight: 600; color: var(--text-primary); opacity: 0.8;">${window.Utils.formatCurrency(futureInstallments)}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-top: 1rem; padding-top: 1rem; border-top: 1px dotted var(--glass-border);">
                    <span style="font-weight: 600;">Saldo Atual:</span>
                    <span style="font-weight: 700; font-size: 1.1rem; color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'};">${window.Utils.formatCurrency(balance)}</span>
                </div>
            `;
            listEl.appendChild(personCard);
        });

        if (listEl.children.length === 0) {
            section.style.display = 'none';
        }
    }

    updateDashboard() {
        let allTx = window.Storage.get('transactions') || [];
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                allTx = allTx.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
            }
        }
        this.transactions = allTx;

        // --- 1. Global Date Filter (Month Navigation) ---
        const isDashboard = window.location.pathname.includes('dashboard.html');
        
        let startDate = new Date(0);
        let endDate = new Date(3000, 0, 1);
        let previousStartDate = new Date(0);
        let previousEndDate = new Date(0);

        if (isDashboard) {
            const targetYear = this.currentNavDate.getFullYear();
            const targetMonth = this.currentNavDate.getMonth();
            
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
            
            previousStartDate = new Date(targetYear, targetMonth - 1, 1);
            previousEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
        }

        const currentPeriodTxs = this.transactions.filter(tx => {
            const d = window.Utils.parseTxDate ? window.Utils.parseTxDate(tx.date) : new Date(tx.date);
            return d && d >= startDate && d <= endDate;
        });

        const prevPeriodTxs = this.transactions.filter(tx => {
            const d = window.Utils.parseTxDate ? window.Utils.parseTxDate(tx.date) : new Date(tx.date);
            return d && d >= previousStartDate && d <= previousEndDate;
        });

        // --- 2. Render Recent Transactions Table ---
        const recentTbody = document.getElementById('recentTransactionsTableBody');
        const legacyListEl = document.getElementById('transactionList');

        if (recentTbody) {
            recentTbody.innerHTML = '';
            const recentTx = currentPeriodTxs.slice(0, 10);
            if (recentTx.length === 0) {
                recentTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum lançamento no período.</td></tr>`;
            } else {
                recentTx.forEach(tx => {
                    const isIncome = tx.type === 'income';
                    const sign = isIncome ? '+' : '-';
                    const amountColor = isIncome ? 'var(--success)' : 'var(--danger)';
                    const methodName = window.Utils.getPaymentMethodName ? window.Utils.getPaymentMethodName(tx.paymentMethod) : (tx.paymentMethod || 'Conta');
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${window.Utils.formatDate(tx.date)}</td>
                        <td style="font-weight: 500;">${window.Utils.escapeHTML(tx.description)}</td>
                        <td>${window.Utils.escapeHTML(tx.category)}</td>
                        <td>${window.Utils.escapeHTML(methodName)}</td>
                        <td>${window.Utils.escapeHTML(tx.person || 'Eu')}</td>
                        <td style="color: ${amountColor}; font-weight: 600;">${sign} ${window.Utils.formatCurrency(tx.amount)}</td>
                    `;
                    recentTbody.appendChild(tr);
                });
            }
        } else if (legacyListEl) {
            legacyListEl.innerHTML = '';
            const recentTx = currentPeriodTxs.slice(0, 10);
            if (recentTx.length === 0) {
                legacyListEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma transação encontrada no período.</div>`;
            } else {
                recentTx.forEach(tx => {
                    const iconClass = tx.type === 'income' ? 'fa-arrow-up' : 'fa-arrow-down';
                    const iconBg = tx.type === 'income' ? 'income' : 'expense';
                    const sign = tx.type === 'income' ? '+' : '-';

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
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div class="tx-amount ${iconBg}">${sign} ${window.Utils.formatCurrency(tx.amount)}</div>
                            <button class="btn btn-ghost primary btn-sm" onclick="window.financeController.openEditModal('${window.Utils.escapeHTML(tx.id)}')" title="Editar">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </div>
                    `;
                    legacyListEl.appendChild(item);
                });
            }
        }

        // --- 3. Calculate KPI Totals ---
        let totalIncome = 0;
        let totalAccountExpense = 0;
        let totalCreditCard = 0;

        const targetYear = this.currentNavDate.getFullYear();
        const targetMonth = String(this.currentNavDate.getMonth() + 1).padStart(2, '0');
        const targetMonthStr = `${targetYear}-${targetMonth}`;

        let cardsList = window.Storage.get('cards') || [];
        
        currentPeriodTxs.forEach(tx => {
             if (tx.type === 'income') {
                 totalIncome += tx.amount;
             } else {
                 if (!tx.paymentMethod || !tx.paymentMethod.startsWith('card_')) {
                     totalAccountExpense += tx.amount;
                 }
             }
        });

        // Credit Card totals: Sum all credit card expenses whose invoice is DUE in targetMonthStr
        this.transactions.forEach(tx => {
            if (tx.type === 'expense' && tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                const cardId = tx.paymentMethod.replace('card_', '');
                const card = cardsList.find(c => c.id === cardId);
                const closeD = card ? (card.closeDay || 1) : 1;
                const dueD = card ? (card.dueDay || 10) : 10;
                
                const invMonth = window.Utils.getCardInvoiceMonth(tx.date, closeD, dueD);
                if (invMonth === targetMonthStr) {
                    totalCreditCard += tx.amount;
                }
            }
        });
        
        // Total Despesas do mês = Despesas de Conta (do mês) + Faturas de Cartão (vencendo no mês)
        const totalExpense = totalAccountExpense + totalCreditCard;
        
        // Saldo das Contas Bancárias (Saldo Atual)
        let accounts = window.Storage.get('accounts') || [];
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                accounts = accounts.filter(a => a.owner && window.currentUser.name && a.owner.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }
        
        let currentBalance = 0;
        if (accounts.length > 0) {
            accounts.forEach(acc => {
                const accIdStr = acc.id === 'default_account' ? 'account' : `acc_${acc.id}`;
                let accIncome = 0;
                let accExpense = 0;
                this.transactions.forEach(tx => {
                    if (tx.paymentMethod === accIdStr) {
                        if (tx.type === 'income') accIncome += tx.amount;
                        else if (tx.type === 'expense') accExpense += tx.amount;
                    }
                });
                const initial = parseFloat(acc.balance) || 0;
                currentBalance += (initial + accIncome - accExpense);
            });
        } else {
            currentBalance = totalIncome - totalAccountExpense;
        }

        let prevIncome = 0;
        let prevExpense = 0;
        prevPeriodTxs.forEach(tx => {
            if (tx.type === 'income') prevIncome += tx.amount;
            else if (tx.type === 'expense') prevExpense += tx.amount;
        });
        const prevBalance = prevIncome - prevExpense;

        const currBalEl = document.getElementById('currentBalance');
        if (currBalEl) currBalEl.textContent = window.Utils.formatCurrency(currentBalance);
        
        const mIncEl = document.getElementById('monthlyIncome');
        if (mIncEl) mIncEl.textContent = window.Utils.formatCurrency(totalIncome);
        
        const mExpEl = document.getElementById('monthlyExpense');
        if (mExpEl) mExpEl.textContent = window.Utils.formatCurrency(totalExpense);
        
        const ccTotalEl = document.getElementById('creditCardTotal');
        if (ccTotalEl) ccTotalEl.textContent = window.Utils.formatCurrency(totalCreditCard);

        // --- 4. Update Trends ---
        this.updateTrendIndicator('balanceTrend', currentBalance, prevBalance, true);
        this.updateTrendIndicator('incomeTrend', totalIncome, prevIncome, true);
        this.updateTrendIndicator('expenseTrend', totalExpense, prevExpense, false);

        // --- 5. Render Widgets & Charts ---
        this.renderDashboardCards();
        this.renderDashboardAccounts();
        this.renderDashboardPersons();
        
        if (window.Chart) {
            this.renderExecutiveCharts(currentPeriodTxs);
        }
    }

    updateTrendIndicator(elementId, current, previous, isPositiveGood) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        if (previous === 0) {
            el.innerHTML = `<span>--</span> vs período anterior`;
            return;
        }

        const pct = ((current - previous) / previous) * 100;
        const absPct = Math.abs(pct).toFixed(1);
        
        let color = 'var(--text-secondary)';
        let icon = '';
        
        if (pct > 0) {
            color = isPositiveGood ? 'var(--success-color)' : 'var(--danger-color)';
            icon = '<i class="fa-solid fa-arrow-trend-up"></i>';
        } else if (pct < 0) {
            color = isPositiveGood ? 'var(--danger-color)' : 'var(--success-color)';
            icon = '<i class="fa-solid fa-arrow-trend-down"></i>';
        }
        
        el.innerHTML = `<span style="color: ${color}; font-weight: bold;">${icon} ${absPct}%</span> vs período anterior`;
    }

    renderExecutiveCharts(txs) {
        // Destroy old charts if exist
        if (this.mainChartInstance) this.mainChartInstance.destroy();
        if (this.pieChartInstance) this.pieChartInstance.destroy();

        // Prepare Data for Flow Chart (Group by Date)
        const dateMap = {};
        txs.forEach(tx => {
            if (!dateMap[tx.date]) dateMap[tx.date] = { in: 0, out: 0 };
            if (tx.type === 'income') dateMap[tx.date].in += tx.amount;
            else dateMap[tx.date].out += tx.amount;
        });

        const sortedDates = Object.keys(dateMap).sort();
        const labels = sortedDates.map(d => window.Utils.formatDate(d).substring(0, 5));
        const dataIn = sortedDates.map(d => dateMap[d].in);
        const dataOut = sortedDates.map(d => dateMap[d].out);

        const ctxMain = document.getElementById('cashFlowChart') || document.getElementById('mainFlowChart');
        if (ctxMain) {
            this.mainChartInstance = new Chart(ctxMain, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Receitas',
                            data: dataIn,
                            backgroundColor: '#10b981',
                            borderRadius: 4
                        },
                        {
                            label: 'Despesas',
                            data: dataOut,
                            backgroundColor: '#ef4444',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Prepare Data for Pie Chart (Group by Category)
        const catMap = {};
        txs.forEach(tx => {
            if (tx.type === 'expense') {
                catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
            }
        });
        
        const catLabels = Object.keys(catMap);
        const catData = Object.values(catMap);
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

        const ctxPie = document.getElementById('categoryChart') || document.getElementById('categoryPieChart');
        if (ctxPie) {
            this.pieChartInstance = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: catLabels,
                    datasets: [{
                        data: catData,
                        backgroundColor: colors.slice(0, catLabels.length),
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#a0a0a0' } }
                    }
                }
            });
        }
    }
}

const initFinance = () => {
    if (!window.financeController && (document.getElementById('transactionForm') || document.getElementById('recentTransactionsTableBody') || document.getElementById('currentBalance'))) {
        window.financeController = new FinanceController();
        
        const filter = document.getElementById('globalDateFilter');
        if (filter) {
            filter.addEventListener('change', () => {
                window.financeController.updateDashboard();
            });
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFinance);
} else {
    initFinance();
}
