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
        
        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];

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
        
        window.addEventListener('dataUpdated', () => {
            this.transactions = window.Storage.get('transactions') || [];
            this.updateDashboard();
        });
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

        if (editId) {
            // EDIT LOGIC
            const txIndex = this.transactions.findIndex(t => t.id === editId);
            if (txIndex > -1) {
                const oldTx = this.transactions[txIndex];
                
                // 1. Estornar limite antigo se era cartão
                if (oldTx.paymentMethod && oldTx.paymentMethod.startsWith('card_')) {
                    const oldCardId = oldTx.paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const oldCardIndex = cards.findIndex(c => c.id === oldCardId);
                    if (oldCardIndex > -1) {
                        cards[oldCardIndex].usedLimit -= oldTx.amount;
                        if (cards[oldCardIndex].usedLimit < 0) cards[oldCardIndex].usedLimit = 0;
                        window.Storage.set('cards', cards);
                    }
                }
                
                // 2. Atualizar transação
                this.transactions[txIndex] = {
                    ...oldTx,
                    type,
                    description: desc, // Note: se for parcela, perderia o (1/2), mas aceitamos isso na edição simples
                    amount: totalAmount,
                    date: dateStr,
                    category,
                    paymentMethod,
                    person,
                    updatedAt: new Date().toISOString()
                };

                // 3. Aplicar novo limite se o novo método for cartão
                if (paymentMethod.startsWith('card_')) {
                    const newCardId = paymentMethod.replace('card_', '');
                    const cards = window.Storage.get('cards') || [];
                    const newCardIndex = cards.findIndex(c => c.id === newCardId);
                    if (newCardIndex > -1) {
                        cards[newCardIndex].usedLimit += totalAmount;
                        window.Storage.set('cards', cards);
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

                    this.transactions.push({
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
                    });
                }
            } else {
                this.transactions.push({
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
                });
            }
            
            // Increment card limit for new transaction
            if (paymentMethod.startsWith('card_')) {
                const cardId = paymentMethod.replace('card_', '');
                const cards = window.Storage.get('cards') || [];
                const cardIndex = cards.findIndex(c => c.id === cardId);
                if (cardIndex > -1) {
                    cards[cardIndex].usedLimit += totalAmount;
                    window.Storage.set('cards', cards);
                }
            }
        }
        
        // Restore installment option state just in case
        if (installOpt) installOpt.disabled = false;
        
        // Merge into global transactions to prevent data loss
        let globalTransactions = window.Storage.get('transactions') || [];
        
        // We added or edited in this.transactions. 
        // We can just iterate through this.transactions and update/push to globalTransactions
        this.transactions.forEach(tx => {
            const index = globalTransactions.findIndex(t => t.id === tx.id);
            if (index > -1) {
                globalTransactions[index] = tx;
            } else {
                if (!tx.userId && window.currentUser) {
                    tx.userId = window.currentUser.id;
                }
                globalTransactions.push(tx);
            }
        });

        // Ordenar por data (mais recentes primeiro)
        globalTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        window.Storage.set('transactions', globalTransactions);
        
        // Refilter for current view
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                this.transactions = globalTransactions.filter(tx => tx.userId === window.currentUser.id || tx.person === window.currentUser.name);
            } else {
                this.transactions = globalTransactions;
            }
        } else {
            this.transactions = globalTransactions;
        }

        this.updateDashboard();
        window.dispatchEvent(new Event('dataUpdated'));
    }

    renderDashboardCards() {
        const section = document.getElementById('dashboardCardsSection');
        const listEl = document.getElementById('dashboardCardsList');
        if (!section || !listEl) return;

        let cards = window.Storage.get('cards') || [];
        
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                cards = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }
        
        if (cards.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        listEl.innerHTML = '';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `${currentYear}-${currentMonth}`;

        const cardTotals = this.transactions.reduce((acc, tx) => {
            if (tx.type === 'expense' && tx.paymentMethod && tx.paymentMethod.startsWith('card_') && tx.date.startsWith(currentMonthPrefix)) {
                const cardId = tx.paymentMethod.replace('card_', '');
                acc[cardId] = (acc[cardId] || 0) + tx.amount;
            }
            return acc;
        }, {});

        cards.forEach(card => {
            const pct = card.limit > 0 ? (card.usedLimit / card.limit) * 100 : 0;
            const pctDisplay = pct > 100 ? 100 : pct;
            const isDanger = pct > 85;

            let faturaAtual = cardTotals[card.id] || 0;

            const cardEl = document.createElement('div');
            cardEl.style.cssText = `
                background: linear-gradient(135deg, ${card.color} 0%, rgba(0,0,0,0.8) 150%);
                border-radius: var(--radius-lg);
                padding: 1.5rem;
                color: white;
                box-shadow: var(--shadow-md);
                display: flex;
                flex-direction: column;
                gap: 1rem;
                cursor: pointer;
                transition: transform 0.2s;
                min-width: 280px;
                flex: 0 0 auto;
                scroll-snap-align: start;
            `;
            // Redirect to cards.html on click to see details
            cardEl.onclick = () => window.location.href = 'cards.html';
            cardEl.onmouseover = () => cardEl.style.transform = 'translateY(-2px)';
            cardEl.onmouseout = () => cardEl.style.transform = 'translateY(0)';

            cardEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; font-size: 1.1rem;">${window.Utils.escapeHTML(card.name)}</div>
                    <div style="opacity: 0.8; font-size: 0.8rem;"><i class="fa-brands fa-cc-${window.Utils.escapeHTML(card.brand)}"></i> Final ${window.Utils.escapeHTML(card.last4)}</div>
                </div>
                <div>
                    <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 0.2rem;">Fatura Atual</div>
                    <div style="font-size: 1.5rem; font-weight: 700;">${window.Utils.formatCurrency(faturaAtual)}</div>
                </div>
                <div style="margin-top: auto;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.4rem; opacity: 0.9;">
                        <span>Limite Dispo: ${window.Utils.formatCurrency(card.limit - card.usedLimit)}</span>
                        <span>${pct.toFixed(0)}%</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: ${pctDisplay}%; background: ${isDanger ? 'var(--danger)' : 'white'}; border-radius: 3px;"></div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">
                    <span>Fecha: dia ${window.Utils.escapeHTML(card.closeDay)}</span>
                    <span>Vence: dia ${window.Utils.escapeHTML(card.dueDay)}</span>
                </div>
            `;
            listEl.appendChild(cardEl);
        });
    }

    renderDashboardAccounts() {
        const section = document.getElementById('dashboardAccountsSection');
        const listEl = document.getElementById('dashboardAccountsList');
        if (!section || !listEl) return;

        let accounts = window.Storage.get('accounts') || [];
        
        if (window.currentUser && window.Auth && !window.Auth.hasPermission('config_system')) {
            if (window.currentUser.role === 'usuario' || window.currentUser.role === 'visitante') {
                accounts = accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === window.currentUser.name.toLowerCase());
            }
        }
        
        if (accounts.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        listEl.innerHTML = '';

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
            const income = totals.income;
            const expense = totals.expense;

            // Calculate final balance: initial balance + income - expense
            const initialBalance = parseFloat(acc.balance) || 0;
            const currentBalance = initialBalance + income - expense;

            const iconClass = acc.type === 'wallet' ? 'fa-wallet' : (acc.type === 'savings' ? 'fa-piggy-bank' : 'fa-building-columns');

            const accEl = document.createElement('div');
            accEl.style.cssText = `
                background: var(--bg-secondary);
                border: 1px solid var(--glass-border);
                border-left: 4px solid ${acc.color || 'var(--accent-primary)'};
                border-radius: var(--radius-lg);
                padding: 1.5rem;
                box-shadow: var(--shadow-sm);
                min-width: 280px;
                flex: 0 0 auto;
                scroll-snap-align: start;
            `;

            accEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem;">
                    <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary);">
                        <i class="fa-solid ${iconClass}" style="color: ${window.Utils.escapeHTML(acc.color) || 'var(--accent-primary)'}; margin-right: 0.5rem;"></i> ${window.Utils.escapeHTML(acc.name)}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${acc.owner ? window.Utils.escapeHTML(acc.owner) : ''}</div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Entradas:</span>
                    <span style="font-weight: 600; color: var(--success);">${window.Utils.formatCurrency(income)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <span style="color: var(--text-secondary);">Saídas:</span>
                    <span style="font-weight: 600; color: var(--danger);">${window.Utils.formatCurrency(expense)}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-top: auto; padding-top: 1rem; border-top: 1px dotted var(--glass-border);">
                    <span style="font-weight: 600;">Saldo da Conta:</span>
                    <span style="font-weight: 700; font-size: 1.1rem; color: ${currentBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">${window.Utils.formatCurrency(currentBalance)}</span>
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
        const listEl = document.getElementById('transactionList');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        
        // --- 1. Global Date Filter ---
        const filterEl = document.getElementById('globalDateFilter');
        const filterVal = filterEl ? filterEl.value : 'this_month';
        
        const now = new Date();
        let startDate = new Date(0);
        let endDate = new Date(3000, 0, 1);
        
        let previousStartDate = new Date(0);
        let previousEndDate = new Date(0);

        if (filterVal === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (filterVal === 'last_month') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            
            previousStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            previousEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        } else if (filterVal === 'this_quarter') {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            
            previousStartDate = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
            previousEndDate = new Date(now.getFullYear(), (quarter - 1) * 3 + 3, 0);
        } else if (filterVal === 'this_year') {
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            
            previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
            previousEndDate = new Date(now.getFullYear() - 1, 11, 31);
        }

        const currentPeriodTxs = this.transactions.filter(tx => {
            const d = new Date(tx.date + 'T12:00:00');
            return d >= startDate && d <= endDate;
        });

        const prevPeriodTxs = this.transactions.filter(tx => {
            const d = new Date(tx.date + 'T12:00:00');
            return d >= previousStartDate && d <= previousEndDate;
        });

        if (currentPeriodTxs.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma transação encontrada no período.</div>`;
        }

        const recentTx = currentPeriodTxs.slice(0, 10);
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
            listEl.appendChild(item);
        });

        // --- 2. Calculate KPI Totals ---
        let totalIncome = 0;
        let totalExpense = 0;
        let totalCreditCard = 0;
        
        currentPeriodTxs.forEach(tx => {
             if (tx.type === 'income') {
                 totalIncome += tx.amount;
             } else {
                 if (tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                     totalCreditCard += tx.amount;
                 } else {
                     totalExpense += tx.amount;
                 }
             }
        });
        const balance = totalIncome - totalExpense;

        let prevIncome = 0;
        let prevExpense = 0;
        prevPeriodTxs.forEach(tx => {
            if (tx.type === 'income') prevIncome += tx.amount;
            else if (!tx.paymentMethod || !tx.paymentMethod.startsWith('card_')) prevExpense += tx.amount;
        });
        const prevBalance = prevIncome - prevExpense;

        document.getElementById('currentBalance').textContent = window.Utils.formatCurrency(balance);
        document.getElementById('monthlyIncome').textContent = window.Utils.formatCurrency(totalIncome);
        document.getElementById('monthlyExpense').textContent = window.Utils.formatCurrency(totalExpense);
        
        const ccTotalEl = document.getElementById('creditCardTotal');
        if (ccTotalEl) ccTotalEl.textContent = window.Utils.formatCurrency(totalCreditCard);

        // --- 3. Update Trends ---
        this.updateTrendIndicator('balanceTrend', balance, prevBalance, true);
        this.updateTrendIndicator('incomeTrend', totalIncome, prevIncome, true);
        this.updateTrendIndicator('expenseTrend', totalExpense, prevExpense, false);

        // --- 4. Render Budget Progress ---
        // Assume default budget of 5000 for demo purposes, this should come from settings
        const budgetLimit = window.Storage.get('budgetLimit') || 5000;
        const totalOut = totalExpense + totalCreditCard;
        const budgetPct = budgetLimit > 0 ? (totalOut / budgetLimit) * 100 : 0;
        const displayPct = Math.min(budgetPct, 100).toFixed(1);
        
        const budgetBar = document.getElementById('budgetProgressBar');
        const budgetStatus = document.getElementById('budgetStatusText');
        const budgetPctText = document.getElementById('budgetPercentText');
        
        if (budgetBar) {
            budgetBar.style.width = displayPct + '%';
            if (budgetPct > 90) {
                budgetBar.style.background = 'var(--danger-color)';
            } else if (budgetPct > 75) {
                budgetBar.style.background = 'var(--warning-color)';
            } else {
                budgetBar.style.background = 'var(--success-color)';
            }
            budgetStatus.textContent = `${window.Utils.formatCurrency(totalOut)} / ${window.Utils.formatCurrency(budgetLimit)}`;
            budgetPctText.textContent = `${displayPct}% Comprometido`;
        }

        this.renderDashboardCards();
        this.renderDashboardAccounts();
        this.renderDashboardPersons();
        
        // --- 5. Render Executive Charts ---
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

        const ctxMain = document.getElementById('mainFlowChart');
        if (ctxMain) {
            this.mainChartInstance = new Chart(ctxMain, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Receitas',
                            data: dataIn,
                            backgroundColor: '#2ecc71',
                            borderRadius: 4
                        },
                        {
                            label: 'Despesas',
                            data: dataOut,
                            backgroundColor: '#e74c3c',
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
                        legend: { position: 'top', labels: { color: '#a0a0a0' } }
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
        const colors = ['#3498db', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c', '#e74c3c', '#34495e'];

        const ctxPie = document.getElementById('categoryPieChart');
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

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa se o formulário de transação existir (Dashboard e Lançamentos)
    if (document.getElementById('transactionForm')) {
        window.financeController = new FinanceController();
        
        // Bind Filter Event (só no dashboard)
        const filter = document.getElementById('globalDateFilter');
        if (filter) {
            filter.addEventListener('change', () => {
                window.financeController.updateDashboard();
            });
        }
    }
});
