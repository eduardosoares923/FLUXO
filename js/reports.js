class ReportsController {
    constructor() {
        this.theme = Storage.get('theme') || 'dark';
        this.textColor = this.theme === 'dark' ? '#f8fafc' : '#0f172a';
        this.gridColor = this.theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        this.charts = {}; // Store chart instances
        this.currentFilter = 'todos';
        
        this.loadData();
        this.init();
    }

    loadData() {
        this.transactions = Storage.get('transactions') || [];
        this.accounts = Storage.get('accounts') || [];
        this.cards = Storage.get('cards') || [];
        
        this.personMap = new Map();
        this.accounts.forEach(a => { 
            if (a.owner) {
                const name = a.owner.trim();
                if (!this.personMap.has(name.toLowerCase())) this.personMap.set(name.toLowerCase(), name);
            } 
        });
        this.cards.forEach(c => { 
            if (c.holder) {
                const name = c.holder.trim();
                if (!this.personMap.has(name.toLowerCase())) this.personMap.set(name.toLowerCase(), name);
            } 
        });
        this.transactions.forEach(tx => {
            if (tx.person) {
                const name = tx.person.trim();
                if (!this.personMap.has(name.toLowerCase())) this.personMap.set(name.toLowerCase(), name);
            }
        });
    }

    init() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    this.theme = document.documentElement.getAttribute('data-theme') || 'dark';
                    this.textColor = this.theme === 'dark' ? '#f8fafc' : '#0f172a';
                    this.gridColor = this.theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
                    this.renderCharts();
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });

        window.addEventListener('dataUpdated', () => {
            this.loadData();
            this.populateFilter();
            this.applyFilter();
        });

        const filterSelect = document.getElementById('reportPersonFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.applyFilter();
            });
        }

        document.getElementById('btnExportPDF')?.addEventListener('click', () => this.exportPDF());
        document.getElementById('btnExportExcel')?.addEventListener('click', () => this.exportExcel());
        document.getElementById('btnExportCSV')?.addEventListener('click', () => this.exportCSV());

        this.populateFilter();
        this.applyFilter();
    }

    populateFilter() {
        const select = document.getElementById('reportPersonFilter');
        if (!select) return;
        
        const currentVal = select.value;
        select.innerHTML = '<option value="todos">Todos (Consolidado)</option>';
        
        this.personMap.forEach((originalName, lowerName) => {
            // Verifica se a pessoa tem dados pra não listar fantasmas
            let hasData = false;
            let pInc=0, pExp=0, pCard=0, pBal=0;
            const pAccounts = this.accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === lowerName).map(a => { pBal += parseFloat(a.balance)||0; return a.id === 'default_account' ? 'account' : `acc_${a.id}` });
            const pCards = this.cards.filter(c => c.holder && c.holder.trim().toLowerCase() === lowerName).map(c => `card_${c.id}`);
            this.transactions.forEach(tx => {
                let belongs = false;
                if (tx.person && tx.person.trim().toLowerCase() === lowerName) belongs = true;
                else if (!tx.person && (pAccounts.includes(tx.paymentMethod) || pCards.includes(tx.paymentMethod))) belongs = true;
                if(belongs) {
                    if(tx.paymentMethod && tx.paymentMethod.startsWith('card_')) pCard += tx.amount;
                    else if(tx.type === 'income') pInc += tx.amount;
                    else pExp += tx.amount;
                }
            });
            if(pInc === 0 && pExp === 0 && pCard === 0 && pBal === 0) return; // skip empty

            const opt = document.createElement('option');
            opt.value = lowerName;
            opt.textContent = originalName;
            select.appendChild(opt);
        });

        if (Array.from(select.options).some(opt => opt.value === currentVal)) select.value = currentVal;
        else { select.value = 'todos'; this.currentFilter = 'todos'; }
    }

    applyFilter() {
        if (this.currentFilter === 'todos') {
            this.filteredTx = this.transactions;
            this.filteredAccounts = this.accounts;
            this.filteredCards = this.cards;
        } else {
            const targetLower = this.currentFilter;
            this.filteredAccounts = this.accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === targetLower);
            const pAccountsIds = this.filteredAccounts.map(a => a.id === 'default_account' ? 'account' : `acc_${a.id}`);
            
            this.filteredCards = this.cards.filter(c => c.holder && c.holder.trim().toLowerCase() === targetLower);
            const pCardsIds = this.filteredCards.map(c => `card_${c.id}`);

            this.filteredTx = this.transactions.filter(tx => {
                if (tx.person && tx.person.trim().toLowerCase() === targetLower) return true;
                if (!tx.person && (pAccountsIds.includes(tx.paymentMethod) || pCardsIds.includes(tx.paymentMethod))) return true;
                return false;
            });
        }

        const compSec = document.getElementById('comparisonSection');
        const personChartContainer = document.getElementById('chartPersonContainer');
        if (this.currentFilter === 'todos') {
            if (compSec) compSec.style.display = 'block';
            if (personChartContainer) personChartContainer.style.display = 'block';
            this.updateComparisons();
        } else {
            if (compSec) compSec.style.display = 'none';
            if (personChartContainer) personChartContainer.style.display = 'none';
        }

        this.updateSummary();
        this.updateSuggestions();
        this.renderCharts();
    }

    updateSummary() {
        let income = 0; let expense = 0; let cardsTotal = 0; let equity = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        this.filteredAccounts.forEach(a => { equity += parseFloat(a.balance) || 0; });
        this.filteredTx.forEach(tx => {
            if (tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                if (tx.type === 'expense' && tx.date <= todayStr) cardsTotal += tx.amount;
            } else {
                if (tx.type === 'income') { income += tx.amount; equity += tx.amount; }
                else if (tx.type === 'expense') { expense += tx.amount; equity -= tx.amount; }
            }
        });

        const economy = income - expense - cardsTotal;
        const commitment = income > 0 ? ((expense + cardsTotal) / income) * 100 : 0;

        document.getElementById('repIncome').textContent = window.Utils.formatCurrency(income);
        document.getElementById('repExpense').textContent = window.Utils.formatCurrency(expense);
        
        const ecoEl = document.getElementById('repEconomy');
        ecoEl.textContent = window.Utils.formatCurrency(economy);
        ecoEl.style.color = economy >= 0 ? 'var(--success)' : 'var(--danger)';

        document.getElementById('repEquity').textContent = window.Utils.formatCurrency(equity);
        document.getElementById('repCards').textContent = window.Utils.formatCurrency(cardsTotal);
        
        const comEl = document.getElementById('repCommitment');
        comEl.textContent = `${commitment.toFixed(1)}%`;
        comEl.style.color = commitment > 70 ? 'var(--danger)' : (commitment > 50 ? 'var(--warning)' : 'var(--success)');
    }

    updateSuggestions() {
        const container = document.getElementById('aiSuggestionsContainer');
        if (!container) return;
        container.innerHTML = '';

        // Generate suggestions based on this.filteredTx and summary metrics
        const suggestions = [];
        
        let income = 0; let expense = 0; let cardsTotal = 0;
        const categoryTotals = {};
        const cardTotals = {};
        
        const todayStr = new Date().toISOString().split('T')[0];
        
        this.filteredTx.forEach(tx => {
            if (tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                if (tx.type === 'expense' && tx.date <= todayStr) {
                    cardsTotal += tx.amount;
                    cardTotals[tx.paymentMethod] = (cardTotals[tx.paymentMethod] || 0) + tx.amount;
                }
            } else {
                if (tx.type === 'income') income += tx.amount;
                else if (tx.type === 'expense') {
                    expense += tx.amount;
                    categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
                }
            }
        });

        const commitment = income > 0 ? ((expense + cardsTotal) / income) * 100 : 0;

        // 1. Alerta de Comprometimento de Renda
        if (commitment > 70) {
            suggestions.push({
                icon: 'fa-triangle-exclamation',
                color: 'var(--danger)',
                title: 'Orçamento Comprometido',
                desc: `Seu comprometimento de renda está muito alto (${commitment.toFixed(0)}%). Considere cortar gastos não essenciais urgentemente.`
            });
        } else if (commitment < 50 && income > 0) {
            suggestions.push({
                icon: 'fa-piggy-bank',
                color: 'var(--success)',
                title: 'Excelente momento para investir',
                desc: 'Seu nível de gastos está saudável. Este é um ótimo período para separar um dinheiro para investimentos ou reserva.'
            });
        }

        // 2. Maior categoria de gasto
        const topCategory = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1])[0];
        if (topCategory && topCategory[1] > 0) {
            suggestions.push({
                icon: 'fa-chart-pie',
                color: 'var(--warning)',
                title: 'Atenção aos Gastos',
                desc: `A categoria "${topCategory[0]}" representa sua maior despesa à vista (${window.Utils.formatCurrency(topCategory[1])}). Veja se é possível reduzi-la.`
            });
        }

        // 3. Cartão mais utilizado
        const topCard = Object.entries(cardTotals).sort((a,b) => b[1] - a[1])[0];
        if (topCard && topCard[1] > (income * 0.3)) {
            const cardObj = this.cards.find(c => `card_${c.id}` === topCard[0]);
            const cardName = cardObj ? cardObj.name : 'Cartão';
            suggestions.push({
                icon: 'fa-credit-card',
                color: '#f97316',
                title: 'Uso Elevado de Cartão',
                desc: `Atenção com a fatura do cartão ${cardName} (${window.Utils.formatCurrency(topCard[1])}). Representa uma grande fatia da sua renda.`
            });
        }

        // Renderizar no DOM
        if (suggestions.length === 0) {
            suggestions.push({
                icon: 'fa-thumbs-up',
                color: 'var(--success)',
                title: 'Tudo tranquilo',
                desc: 'Suas finanças parecem estar sob controle. Continue acompanhando seus registros.'
            });
        }

        suggestions.forEach(s => {
            const card = document.createElement('div');
            card.className = 'suggestion-card';
            card.innerHTML = `
                <div class="suggestion-icon" style="background: ${s.color}20; color: ${s.color};">
                    <i class="fa-solid ${s.icon}"></i>
                </div>
                <div class="suggestion-content">
                    <div class="suggestion-title">${s.title}</div>
                    <div class="suggestion-desc">${s.desc}</div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    updateComparisons() {
        const container = document.getElementById('comparisonCards');
        if (!container) return;
        container.innerHTML = '';

        // Calculate totals per person
        const personStats = {};
        
        const todayStr = new Date().toISOString().split('T')[0];

        this.transactions.forEach(tx => {
            // Find owner of transaction
            let person = tx.person ? tx.person.trim() : null;
            if (!person) {
                if (tx.paymentMethod.startsWith('card_')) {
                    const c = this.cards.find(x => `card_${x.id}` === tx.paymentMethod);
                    if (c) person = c.holder;
                } else {
                    const accId = tx.paymentMethod.replace('acc_', '');
                    const a = this.accounts.find(x => x.id === accId || (accId === 'account' && x.id === 'default_account'));
                    if (a) person = a.owner;
                }
            }
            if (!person) return;
            
            if (!personStats[person]) personStats[person] = { income: 0, expense: 0, debt: 0 };
            
            if (tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                if (tx.type === 'expense') personStats[person].debt += tx.amount;
            } else {
                if (tx.type === 'income') personStats[person].income += tx.amount;
                else if (tx.type === 'expense') personStats[person].expense += tx.amount;
            }
        });

        const statsArray = Object.entries(personStats).map(([name, data]) => ({ name, ...data, economy: data.income - data.expense - data.debt }));

        if (statsArray.length === 0) return;

        // Maior Renda
        const highestIncome = [...statsArray].sort((a,b) => b.income - a.income)[0];
        // Maior Gasto (Despesa + Divida)
        const highestSpender = [...statsArray].sort((a,b) => (b.expense+b.debt) - (a.expense+a.debt))[0];
        // Economizou Mais
        const bestSaver = [...statsArray].sort((a,b) => b.economy - a.economy)[0];
        // Maior Fatura
        const highestDebt = [...statsArray].sort((a,b) => b.debt - a.debt)[0];

        const makeCard = (label, person, value, color) => `
            <div class="comparison-card">
                <div class="comparison-label">${label}</div>
                <div class="comparison-winner">${person.name}</div>
                <div class="comparison-value" style="color: ${color}">${window.Utils.formatCurrency(value)}</div>
            </div>
        `;

        if (highestIncome && highestIncome.income > 0) {
            container.innerHTML += makeCard('Maior Renda', highestIncome, highestIncome.income, 'var(--success)');
        }
        if (highestSpender && (highestSpender.expense + highestSpender.debt) > 0) {
            container.innerHTML += makeCard('Maior Gasto', highestSpender, (highestSpender.expense + highestSpender.debt), 'var(--danger)');
        }
        if (bestSaver && bestSaver.economy > 0) {
            container.innerHTML += makeCard('Poupou Mais', bestSaver, bestSaver.economy, '#3b82f6');
        }
        if (highestDebt && highestDebt.debt > 0) {
            container.innerHTML += makeCard('Maior Fatura de Cartão', highestDebt, highestDebt.debt, 'var(--warning)');
        }
    }

    renderCharts() {
        // Colors palette
        this.bgColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        
        this.renderIncomeVsExpense();
        this.renderCategoryChart();
        this.renderMonthlyFlow();
        if (this.currentFilter === 'todos') this.renderPersonChart();
        this.renderAccountsChart();
        this.renderCardsChart();
        this.renderBalanceEvolution();
    }

    destroyChart(id) {
        if (this.charts[id]) {
            this.charts[id].destroy();
        }
    }

    renderIncomeVsExpense() {
        this.destroyChart('chartIncomeVsExpense');
        const ctx = document.getElementById('chartIncomeVsExpense');
        if (!ctx) return;

        let inc=0, exp=0;
        this.filteredTx.forEach(tx => {
            if (tx.type === 'income') inc += tx.amount;
            else if (tx.type === 'expense') exp += tx.amount;
        });

        this.charts['chartIncomeVsExpense'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Receitas', 'Despesas'],
                datasets: [{
                    data: [inc, exp],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: this.textColor } } }
            }
        });
    }

    renderCategoryChart() {
        this.destroyChart('chartCategory');
        const ctx = document.getElementById('chartCategory');
        if (!ctx) return;

        const totals = {};
        this.filteredTx.forEach(tx => {
            if (tx.type === 'expense') {
                totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
            }
        });

        const labels = Object.keys(totals);
        const data = Object.values(totals);

        if (labels.length === 0) { labels.push('Nenhum'); data.push(1); }

        this.charts['chartCategory'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels, datasets: [{ data, backgroundColor: this.bgColors, borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: this.textColor } } }
            }
        });
    }

    renderMonthlyFlow() {
        this.destroyChart('chartMonthlyFlow');
        const ctx = document.getElementById('chartMonthlyFlow');
        if (!ctx) return;

        const monthlyData = {};
        this.filteredTx.forEach(tx => {
            const monthStr = tx.date.substring(0, 7);
            if (!monthlyData[monthStr]) monthlyData[monthStr] = { income: 0, expense: 0 };
            if (tx.type === 'income') monthlyData[monthStr].income += tx.amount;
            else if (tx.type === 'expense') monthlyData[monthStr].expense += tx.amount;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const labels = sortedMonths.map(m => {
            const [y, mm] = m.split('-'); return new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        });
        const incomeData = sortedMonths.map(m => monthlyData[m].income);
        const expenseData = sortedMonths.map(m => monthlyData[m].expense);

        this.charts['chartMonthlyFlow'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Atual'],
                datasets: [
                    { label: 'Receitas', data: incomeData.length ? incomeData : [0], backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Despesas', data: expenseData.length ? expenseData : [0], backgroundColor: '#ef4444', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: this.textColor }, grid: { display: false } },
                    y: { ticks: { color: this.textColor }, grid: { color: this.gridColor } }
                },
                plugins: { legend: { labels: { color: this.textColor } } }
            }
        });
    }

    renderPersonChart() {
        this.destroyChart('chartPerson');
        const ctx = document.getElementById('chartPerson');
        if (!ctx) return;

        const personExp = {};
        this.filteredTx.forEach(tx => {
            if (tx.type === 'expense') {
                let p = tx.person ? tx.person.trim() : 'Outros';
                personExp[p] = (personExp[p] || 0) + tx.amount;
            }
        });

        const labels = Object.keys(personExp);
        const data = Object.values(personExp);

        this.charts['chartPerson'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Nenhum'],
                datasets: [{ label: 'Despesas por Pessoa', data: data.length ? data : [0], backgroundColor: '#f59e0b', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: this.textColor }, grid: { display: false } },
                    y: { ticks: { color: this.textColor }, grid: { color: this.gridColor } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    renderAccountsChart() {
        this.destroyChart('chartAccounts');
        const ctx = document.getElementById('chartAccounts');
        if (!ctx) return;

        const accTotals = {};
        this.filteredTx.forEach(tx => {
            if (tx.type === 'expense' && (!tx.paymentMethod || !tx.paymentMethod.startsWith('card_'))) {
                let name = 'Desconhecida';
                if (tx.paymentMethod === 'account') name = 'Carteira Principal';
                else {
                    const accId = tx.paymentMethod.replace('acc_', '');
                    const a = this.filteredAccounts.find(x => x.id === accId);
                    if (a) name = a.name;
                }
                accTotals[name] = (accTotals[name] || 0) + tx.amount;
            }
        });

        const labels = Object.keys(accTotals);
        const data = Object.values(accTotals);

        this.charts['chartAccounts'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Nenhum'], datasets: [{ data: data.length ? data : [1], backgroundColor: this.bgColors, borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: this.textColor } } } }
        });
    }

    renderCardsChart() {
        this.destroyChart('chartCards');
        const ctx = document.getElementById('chartCards');
        if (!ctx) return;

        const cardTotals = {};
        this.filteredTx.forEach(tx => {
            if (tx.type === 'expense' && tx.paymentMethod && tx.paymentMethod.startsWith('card_')) {
                const cId = tx.paymentMethod.replace('card_', '');
                const c = this.filteredCards.find(x => x.id === cId);
                const name = c ? c.name : 'Cartão Excluído';
                cardTotals[name] = (cardTotals[name] || 0) + tx.amount;
            }
        });

        const labels = Object.keys(cardTotals);
        const data = Object.values(cardTotals);

        this.charts['chartCards'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Nenhum'], datasets: [{ label: 'Fatura Gerada', data: data.length ? data : [0], backgroundColor: '#ec4899', borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { ticks: { color: this.textColor }, grid: { color: this.gridColor } }, y: { ticks: { color: this.textColor }, grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    renderBalanceEvolution() {
        this.destroyChart('chartBalanceEvolution');
        const ctx = document.getElementById('chartBalanceEvolution');
        if (!ctx) return;

        // Ordenar transações por data
        const sortedTx = [...this.filteredTx].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        let currentBalance = 0;
        this.filteredAccounts.forEach(a => currentBalance += parseFloat(a.balance)||0);
        
        // Vamos recriar o histórico retroativamente
        const history = [];
        let runningBalance = currentBalance;
        
        // Loop invertido para descobrir os saldos do passado
        for (let i = sortedTx.length - 1; i >= 0; i--) {
            const tx = sortedTx[i];
            history.unshift({ date: tx.date, balance: runningBalance });
            if (tx.type === 'income') runningBalance -= tx.amount;
            else if (tx.type === 'expense') runningBalance += tx.amount; // volta o dinheiro
        }

        // Agrupar último saldo do dia
        const dailyBalance = {};
        history.forEach(h => { dailyBalance[h.date] = h.balance; });
        
        const labels = Object.keys(dailyBalance).map(d => {
            const [y,m,day] = d.split('-'); return `${day}/${m}`;
        });
        const data = Object.values(dailyBalance);

        this.charts['chartBalanceEvolution'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Hoje'], datasets: [{ label: 'Evolução de Patrimônio', data: data.length ? data : [currentBalance], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { ticks: { color: this.textColor }, grid: { display: false } }, y: { ticks: { color: this.textColor }, grid: { color: this.gridColor } } }
            }
        });
    }

    // --- Exportações ---
    
    exportPDF() {
        if (typeof window.jspdf === 'undefined') {
            alert("Biblioteca jsPDF não carregada.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        const filterName = this.currentFilter === 'todos' ? 'Consolidado' : this.personMap.get(this.currentFilter) || 'Individual';
        const currentDate = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const user = window.currentUser ? window.currentUser.name : 'Administrador';

        // CAPA / CABEÇALHO
        doc.setFillColor(31, 41, 55); // var(--bg-primary) style
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Relatório Financeiro', 15, 20);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Filtro: ${filterName} | Gerado em: ${currentDate}`, 15, 28);
        doc.text(`Por: ${user}`, 15, 34);

        // RESUMO FINANCEIRO
        let startY = 50;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumo do Período', 15, startY);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        startY += 10;
        
        const incText = document.getElementById('repIncome').textContent;
        const expText = document.getElementById('repExpense').textContent;
        const ecoText = document.getElementById('repEconomy').textContent;
        const equText = document.getElementById('repEquity').textContent;
        const carText = document.getElementById('repCards').textContent;
        
        doc.text(`Receita Total: ${incText}`, 15, startY);
        doc.text(`Despesa Total: ${expText}`, 105, startY);
        startY += 8;
        doc.text(`Faturas de Cartões: ${carText}`, 15, startY);
        doc.text(`Economia: ${ecoText}`, 105, startY);
        startY += 8;
        doc.text(`Patrimônio / Contas: ${equText}`, 15, startY);

        // TABELA DE TRANSAÇÕES
        startY += 15;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Detalhamento de Lançamentos', 15, startY);
        startY += 5;

        const tableColumn = ["Data", "Tipo", "Categoria", "Descrição", "Valor", "Pessoa"];
        const tableRows = [];

        this.filteredTx.forEach(tx => {
            const dataStr = new Date(tx.date).toLocaleDateString('pt-BR');
            const tipo = tx.type === 'income' ? 'Receita' : 'Despesa';
            const val = window.Utils.formatCurrency(tx.amount);
            const p = tx.person || '-';
            tableRows.push([dataStr, tipo, tx.category, tx.description, val, p]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] }, // accent-primary
            styles: { fontSize: 9, cellPadding: 3 },
            didDrawPage: function (data) {
                // Footer
                let str = 'Página ' + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                doc.text(str, data.settings.margin.left, pageHeight - 10);
            }
        });

        doc.save(`relatorio_financeiro_${this.currentFilter}.pdf`);
    }

    async exportExcel() {
        if (typeof ExcelJS === 'undefined') {
            alert("Biblioteca ExcelJS não encontrada.");
            return;
        }

        const loading = document.getElementById('excelLoadingOverlay');
        if (loading) loading.style.display = 'flex';
        await new Promise(r => setTimeout(r, 150)); // Render UI

        try {
            const wb = new ExcelJS.Workbook();
            wb.creator = 'Fluxo de Caixa App';
            wb.created = new Date();
            const filterName = this.currentFilter === 'todos' ? 'Consolidado' : (this.personMap.get(this.currentFilter) || 'Individual');
            
            // --- ESTILOS GLOBAIS ---
            const formatCurrency = '"R$" #,##0.00;[Red]\\-"R$" #,##0.00';
            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
            const headerFont = { name: 'Calibri', color: { argb: 'FFFFFFFF' }, bold: true };
            const borderAll = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };

            const setupTable = (ws, columns, data, startRow = 5) => {
                ws.columns = columns;
                const headerRow = ws.getRow(startRow);
                columns.forEach((col, i) => {
                    const cell = headerRow.getCell(i + 1);
                    cell.value = col.header;
                    cell.fill = headerFill;
                    cell.font = headerFont;
                    cell.alignment = { horizontal: 'center' };
                });

                data.forEach((rowObj, index) => {
                    const row = ws.getRow(startRow + 1 + index);
                    columns.forEach((col, i) => {
                        const cell = row.getCell(i + 1);
                        cell.value = rowObj[col.key];
                        cell.border = borderAll;
                        if (col.isCurrency) cell.numFmt = formatCurrency;
                        if (col.align) cell.alignment = { horizontal: col.align };
                    });
                });
                return startRow + data.length;
            };

            const getFriendlyPaymentName = (id) => {
                if (!id) return '-';
                if (id.startsWith('card_')) {
                    const cards = Storage.get('cards') || [];
                    const c = cards.find(c => c.id === id);
                    return c ? c.name : id;
                }
                const accs = Storage.get('accounts') || [];
                const a = accs.find(a => a.id === id);
                return a ? a.name : 'Dinheiro/Outro';
            };
            const getPersonName = (p) => p || 'Não Informada';
            const safeGetText = (id, def) => document.getElementById(id) ? document.getElementById(id).textContent : def;

            // ==========================================
            // ABA 1: DASHBOARD POWERBI (EXECUTIVE VIEW)
            // ==========================================
            const wsDash = wb.addWorksheet('1. Dashboard Executivo', { 
                properties: { tabColor: { argb: 'FF10B981' } },
                views: [{ showGridLines: false }] // MAGIA: Sem linhas de grade
            });
            
            // Transformar planillha em "Pixels" (24 colunas estreitas)
            for (let i = 1; i <= 24; i++) {
                wsDash.getColumn(i).width = 4.5; 
            }
            
            // Fundo principal de todo o dashboard (Cinza bem clarinho)
            for (let r = 1; r <= 80; r++) {
                const row = wsDash.getRow(r);
                for (let c = 1; c <= 24; c++) {
                    row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                }
            }

            // --- HERO HEADER --- (Faixa Azul Escuro)
            for (let r = 1; r <= 5; r++) {
                const row = wsDash.getRow(r);
                for (let c = 1; c <= 24; c++) {
                    row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                }
            }
            
            // Titulo no Header
            wsDash.mergeCells('B2:M3');
            const titleCell = wsDash.getCell('B2');
            titleCell.value = 'RELATÓRIO FINANCEIRO EXECUTIVO';
            titleCell.font = { name: 'Calibri', size: 24, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

            // Metadados no Header
            wsDash.mergeCells('N2:W3');
            const metaCell = wsDash.getCell('N2');
            metaCell.value = `Visão: ${filterName}\nData: ${new Date().toLocaleDateString('pt-BR')}`;
            metaCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF9CA3AF' } };
            metaCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
            metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

            // --- FUNÇÃO KPI (PowerBI Style) ---
            const addKpiCard = (startCol, endCol, title, valueStr, valueColor) => {
                const startRow = 7;
                const endRow = 11;
                wsDash.mergeCells(startRow, startCol, endRow, endCol);
                const cell = wsDash.getCell(startRow, startCol);
                
                // Texto e Fonte
                cell.value = `${title}\n${valueStr}`;
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: valueColor } };
                
                // Formatação do Card (Fundo Branco, Sombra Simulada)
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                cell.border = borderAll;
                
                // Limpar linhas em volta se houver
                for(let r=startRow; r<=endRow; r++){
                    for(let c=startCol; c<=endCol; c++){
                        const innerCell = wsDash.getCell(r, c);
                        innerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                        if(r===startRow) innerCell.border = { top: borderAll.top };
                        if(r===endRow) innerCell.border = Object.assign({}, innerCell.border, { bottom: borderAll.bottom });
                        if(c===startCol) innerCell.border = Object.assign({}, innerCell.border, { left: borderAll.left });
                        if(c===endCol) innerCell.border = Object.assign({}, innerCell.border, { right: borderAll.right });
                    }
                }
            };

            // Buscar Valores
            const incText = safeGetText('repIncome', 'R$ 0,00');
            const expText = safeGetText('repExpense', 'R$ 0,00');
            const ecoText = safeGetText('repEconomy', 'R$ 0,00');
            const equText = safeGetText('repEquity', 'R$ 0,00');
            const carText = safeGetText('repCards', 'R$ 0,00');
            const comText = safeGetText('repCommitment', '0%');

            // Criar 6 KPIs alinhados
            addKpiCard(2, 5, 'RECEITA TOTAL', incText, 'FF10B981'); // B-E
            addKpiCard(6, 9, 'DESPESA TOTAL', expText, 'FFEF4444'); // F-I
            addKpiCard(10, 13, 'SALDO CONTAS', equText, 'FF3B82F6'); // J-M
            addKpiCard(14, 17, 'CARTÕES', carText, 'FFF59E0B'); // N-Q
            addKpiCard(18, 20, 'ECONOMIA', ecoText, 'FF8B5CF6'); // R-T
            addKpiCard(21, 23, 'COMPROM.', comText, 'FF6B7280'); // U-W

            // --- INSIGHTS ---
            wsDash.mergeCells('B13:W14');
            const insight = wsDash.getCell('B13');
            let txt = `Relatório gerado com sucesso. ${this.filteredTx.length} transações processadas.`;
            insight.value = txt;
            insight.font = { name: 'Calibri', size: 12, italic: true, color: { argb: 'FF4B5563' } };
            insight.alignment = { vertical: 'middle', horizontal: 'center' };
            insight.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
            insight.border = borderAll;

            // --- GRÁFICOS (Painéis) ---
            const chartIds = [
                { id: 'chartCategory', title: 'Gastos por Categoria', row: 16, col: 2, cRow: 18, w: 450, h: 300 },
                { id: 'chartMonthlyFlow', title: 'Fluxo de Caixa Mensal', row: 16, col: 13, cRow: 18, w: 450, h: 300 },
                { id: 'chartPerson', title: 'Despesas por Pessoa', row: 36, col: 2, cRow: 38, w: 450, h: 300 },
                { id: 'chartAccounts', title: 'Gastos por Conta Bancária', row: 36, col: 13, cRow: 38, w: 450, h: 300 },
                { id: 'chartCards', title: 'Faturas por Cartão', row: 56, col: 2, cRow: 58, w: 450, h: 300 },
                { id: 'chartBalanceEvolution', title: 'Evolução Patrimonial', row: 56, col: 13, cRow: 58, w: 450, h: 300 }
            ];

            chartIds.forEach(chart => {
                const canvas = document.getElementById(chart.id);
                if (canvas) {
                    try {
                        // Title Area
                        wsDash.mergeCells(chart.row, chart.col, chart.row, chart.col + 9);
                        const tCell = wsDash.getCell(chart.row, chart.col);
                        tCell.value = chart.title;
                        tCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1F2937' } };
                        tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                        tCell.border = { top: borderAll.top, left: borderAll.left, right: borderAll.right, bottom: borderAll.bottom };

                        // Add Image
                        const base64Image = canvas.toDataURL('image/png', 1.0);
                        const imgId = wb.addImage({ base64: base64Image, extension: 'png' });
                        wsDash.addImage(imgId, {
                            tl: { col: chart.col - 1, row: chart.cRow - 1 }, // 0-indexed
                            ext: { width: chart.w, height: chart.h }
                        });
                    } catch(e) { console.warn('Falha no gráfico', chart.id, e); }
                }
            });

            // ==========================================
            // ABA 2: RESUMO E CATEGORIAS
            // ==========================================
            const wsCat = wb.addWorksheet('2. Resumo Analítico');
            wsCat.mergeCells('A1:C2');
            wsCat.getCell('A1').value = 'ANÁLISE DE GASTOS POR CATEGORIA';
            wsCat.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
            wsCat.getCell('A1').alignment = { vertical: 'middle' };
            
            const catMap = new Map();
            this.filteredTx.filter(t => t.type === 'expense').forEach(t => {
                const c = t.category || 'Outros';
                catMap.set(c, (catMap.get(c) || 0) + t.amount);
            });
            const catData = Array.from(catMap.entries()).map(([cat, val]) => ({ cat, val })).sort((a,b) => b.val - a.val);
            const endRowCat = setupTable(wsCat, [
                { header: 'Categoria de Despesa', key: 'cat', width: 40 },
                { header: 'Total Gasto (R$)', key: 'val', width: 25, isCurrency: true }
            ], catData, 4);

            wsCat.getCell(`A${endRowCat+1}`).value = 'TOTAL GERAL:';
            wsCat.getCell(`A${endRowCat+1}`).font = { bold: true };
            wsCat.getCell(`B${endRowCat+1}`).value = { formula: `SUM(B5:B${endRowCat})` };
            wsCat.getCell(`B${endRowCat+1}`).numFmt = formatCurrency;
            wsCat.getCell(`B${endRowCat+1}`).font = { bold: true };

            // ==========================================
            // ABA 3: FLUXO DE CAIXA
            // ==========================================
            const wsFlow = wb.addWorksheet('3. Fluxo Diário');
            wsFlow.mergeCells('A1:D2');
            wsFlow.getCell('A1').value = 'FLUXO DE CAIXA CRONOLÓGICO (DIA A DIA)';
            wsFlow.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
            wsFlow.getCell('A1').alignment = { vertical: 'middle' };
            
            const flowMap = new Map();
            this.filteredTx.forEach(t => {
                const d = t.date;
                if (!flowMap.has(d)) flowMap.set(d, { in: 0, out: 0 });
                if (t.type === 'income') flowMap.get(d).in += t.amount;
                else flowMap.get(d).out += t.amount;
            });
            
            const flowData = Array.from(flowMap.entries())
                .sort((a,b) => a[0].localeCompare(b[0]))
                .map(([d, v]) => ({
                    date: new Date(d).toLocaleDateString('pt-BR'),
                    in: v.in, 
                    out: v.out, 
                    bal: v.in - v.out
                }));
                
            setupTable(wsFlow, [
                { header: 'Data', key: 'date', width: 15, align: 'center' },
                { header: 'Receitas (R$)', key: 'in', width: 20, isCurrency: true },
                { header: 'Despesas (R$)', key: 'out', width: 20, isCurrency: true },
                { header: 'Resultado Diário (R$)', key: 'bal', width: 25, isCurrency: true }
            ], flowData, 4);

            // ==========================================
            // ABA 4: TRANSAÇÕES CONSOLIDADAS
            // ==========================================
            const wsTx = wb.addWorksheet('4. Transações', { properties: { tabColor: { argb: 'FF3B82F6' } } });
            wsTx.mergeCells('A1:G2');
            wsTx.getCell('A1').value = 'REGISTRO MESTRE DE TRANSAÇÕES';
            wsTx.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
            wsTx.getCell('A1').alignment = { vertical: 'middle' };

            const txCols = [
                { header: 'Data', key: 'date', width: 15, align: 'center' },
                { 
                    header: 'Tipo', key: 'type', width: 15, align: 'center',
                    fill: (r) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: r.type === 'Receita' ? 'FFE6F4EA' : 'FFFCE8E8' } })
                },
                { header: 'Categoria', key: 'cat', width: 25 },
                { header: 'Descrição', key: 'desc', width: 45 },
                { header: 'Valor', key: 'val', width: 20, isCurrency: true },
                { header: 'Pessoa', key: 'person', width: 25 },
                { header: 'Pagamento/Origem', key: 'pay', width: 30 }
            ];

            const txData = this.filteredTx.map(t => ({
                date: new Date(t.date).toLocaleDateString('pt-BR'),
                type: t.type === 'income' ? 'Receita' : 'Despesa',
                cat: t.category, 
                desc: t.description, 
                val: t.amount, 
                person: getPersonName(t.person),
                pay: getFriendlyPaymentName(t.paymentMethod)
            }));
            const endRowTx = setupTable(wsTx, txCols, txData, 4);
            
            wsTx.getCell(`D${endRowTx+1}`).value = 'TOTAL:';
            wsTx.getCell(`D${endRowTx+1}`).font = { bold: true };
            wsTx.getCell(`E${endRowTx+1}`).value = { formula: `SUM(E5:E${endRowTx})` };
            wsTx.getCell(`E${endRowTx+1}`).numFmt = formatCurrency;
            wsTx.getCell(`E${endRowTx+1}`).font = { bold: true };

            // ==========================================
            // ABA 5: MEIOS DE PAGAMENTO
            // ==========================================
            const wsPay = wb.addWorksheet('5. Bancos e Cartões');
            wsPay.mergeCells('A1:C2');
            wsPay.getCell('A1').value = 'CONSOLIDAÇÃO POR CONTAS BANCÁRIAS E CARTÕES';
            wsPay.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
            wsPay.getCell('A1').alignment = { vertical: 'middle' };
            
            const payMap = new Map();
            this.filteredTx.filter(t => t.type === 'expense').forEach(t => {
                const p = getFriendlyPaymentName(t.paymentMethod);
                payMap.set(p, (payMap.get(p) || 0) + t.amount);
            });
            const payData = Array.from(payMap.entries()).map(([pay, val]) => ({ pay, val })).sort((a,b) => b.val - a.val);
            
            setupTable(wsPay, [
                { header: 'Meio de Pagamento', key: 'pay', width: 45 },
                { header: 'Volume de Gasto (R$)', key: 'val', width: 25, isCurrency: true }
            ], payData, 4);

            // ==========================================
            // ABA 6: AUDITORIA E DETALHES
            // ==========================================
            const wsAud = wb.addWorksheet('6. Auditoria');
            wsAud.getColumn(1).width = 30;
            wsAud.getColumn(2).width = 50;
            
            wsAud.getCell('A1').value = 'LOG DE EXPORTAÇÃO E AUDITORIA DO SISTEMA';
            wsAud.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
            
            const audData = [
                ['Data e Hora da Geração', new Date().toLocaleString('pt-BR')],
                ['Filtro Aplicado', filterName],
                ['Total de Registros Processados', this.filteredTx.length],
                ['Total de Contas Bancárias Ativas', this.accounts.length],
                ['Total de Cartões de Crédito', this.cards.length]
            ];
            
            audData.forEach((row, i) => {
                wsAud.getCell(`A${i+4}`).value = row[0];
                wsAud.getCell(`A${i+4}`).font = { bold: true };
                wsAud.getCell(`B${i+4}`).value = row[1];
            });

            // DISPARO DO DOWNLOAD
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Relatorio_Executivo_${this.currentFilter}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Erro na exportação Excel:", error);
            alert("Erro ao gerar Excel Corporativo: " + (error.message || error));
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    exportCSV() {
        let csv = 'Data,Tipo,Categoria,Descricao,Valor,Pessoa,Pagamento\n';
        this.filteredTx.forEach(tx => {
            const tipo = tx.type === 'income' ? 'Receita' : 'Despesa';
            csv += `${tx.date},${tipo},${tx.category},"${tx.description}",${tx.amount},"${tx.person||''}","${tx.paymentMethod}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `transacoes_${this.currentFilter}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chartIncomeVsExpense')) {
        window.reportsController = new ReportsController();
    }
});
