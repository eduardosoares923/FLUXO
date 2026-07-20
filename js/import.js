class ExcelImporter {
    constructor() {
        this.previewData = [];
        this.bindEvents();
    }

    bindEvents() {
        const btnImport = document.getElementById('btnImportExcel');
        const btnProcess = document.getElementById('btnProcessExcel');
        const btnConfirm = document.getElementById('btnConfirmImport');

        if (btnImport) {
            btnImport.addEventListener('click', () => {
                document.getElementById('excelFileInput').value = '';
                window.UI.openModal('importModal');
            });
        }

        if (btnProcess) {
            btnProcess.addEventListener('click', () => this.processExcel());
        }

        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => this.saveToDatabase());
        }
    }

    processExcel() {
        const fileInput = document.getElementById('excelFileInput');
        const file = fileInput.files[0];

        if (!file) {
            window.UI.showToast('Por favor, selecione um arquivo.', 'error');
            return;
        }

        if (typeof XLSX === 'undefined') {
            window.UI.showToast('Erro: Biblioteca de leitura não carregada.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                this.previewData = [];
                
                let lastValidDate = new Date(); // Preservar a data entre abas
                let lastBalance = 0;            // Preservar o saldo entre abas
                
                // Função helper para interpretar números BR de forma segura
                const parsePtBrNumber = (val) => {
                    if (typeof val === 'number') return val;
                    if (val === null || val === undefined || val === '') return NaN;
                    let str = String(val).trim();
                    // Ocultar parênteses como negativo, se houver
                    let isNegative = str.startsWith('(') || str.startsWith('-');
                    // Remover os pontos de milhar, manter apenas vírgula e números
                    str = str.replace(/\./g, '').replace(/[^\d,]/g, '').replace(',', '.');
                    let num = parseFloat(str);
                    if (isNaN(num)) return NaN;
                    return isNegative ? -Math.abs(num) : num;
                };

                // Iterar sobre todas as abas (meses)
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    if (!rows || rows.length === 0) return;

                    // 1. Achar a linha de cabeçalho
                    let headerRowIndex = -1;
                    let colData = -1;
                    let colDesc = -1;
                    let colVal = -1;
                    let colBalance = -1;
                    let creditCardTables = []; // Armazena { name: 'NEO', colDesc: X, colVal: X+1, colInst: X+2 }

                    for (let i = 0; i < Math.min(rows.length, 20); i++) {
                        const row = rows[i];
                        if (!row) continue;
                        
                        // Primeiro, achar as colunas do ledger principal
                        for (let j = 0; j < row.length; j++) {
                            const cellVal = String(row[j] || '').toLowerCase().trim();
                            if (cellVal.includes('data pagto') || cellVal === 'data') colData = j;
                            if (cellVal.includes('descrição') || cellVal === 'descricao') colDesc = j;
                            if (cellVal.includes('despesas') || cellVal === 'valor') colVal = j;
                            if (cellVal.includes('receitas') || cellVal === 'saldo') colBalance = j;
                        }

                        // Se achou pelo menos Descrição e Valor, consideramos esta a linha de cabeçalho
                        if (colDesc !== -1 && colVal !== -1) {
                            headerRowIndex = i;
                            
                            // Agora, varrer a linha novamente para achar as tabelas de cartão de crédito (Qualquer string que não seja do ledger principal)
                            for (let j = colBalance + 1; j < row.length; j++) {
                                const headerStr = String(row[j] || '').trim();
                                // Se tem um nome e não é uma das colunas conhecidas
                                if (headerStr && headerStr.length > 1 && !headerStr.toLowerCase().includes('total')) {
                                    creditCardTables.push({
                                        name: headerStr,
                                        colDesc: j,
                                        colVal: j + 1,
                                        colInst: j + 2
                                    });
                                }
                            }
                            break;
                        }
                    }

                    // Se não achou cabeçalho, tenta usar o índice padrão do print do usuário
                    if (headerRowIndex === -1) {
                        colData = 0; // A
                        colDesc = 2; // C
                        colVal = 4;  // E
                        colBalance = 5; // F
                        headerRowIndex = 1; // Linha 2
                    }

                    // 2. Extrair os dados a partir da linha seguinte ao cabeçalho
                    for (let i = headerRowIndex + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row) continue;
                        
                        let dataCell = colData !== -1 ? row[colData] : null;
                        
                        // === TENTAR INTERPRETAR A DATA ===
                        let hasNewDate = false;
                        if (dataCell !== undefined && dataCell !== null && dataCell !== '') {
                            if (typeof dataCell === 'number') {
                                lastValidDate = new Date(Math.round((dataCell - 25569) * 86400 * 1000));
                                hasNewDate = true;
                            } else if (typeof dataCell === 'string' && dataCell.includes('/')) {
                                const parts = dataCell.split('/');
                                if (parts.length === 3) {
                                    let d = parseInt(parts[0]);
                                    let m = parseInt(parts[1]);
                                    let y = parseInt(parts[2]);
                                    if (y < 100) y += 2000;
                                    lastValidDate = new Date(y, m - 1, d);
                                    hasNewDate = true;
                                }
                            }
                        }

                        // === EXTRAIR TRANSAÇÃO PRINCIPAL (LADO ESQUERDO) ===
                        let descCell = colDesc !== -1 ? row[colDesc] : null;
                        let valCell = colVal !== -1 ? row[colVal] : null;
                        let balanceCell = colBalance !== -1 ? row[colBalance] : null;

                        let isMainValid = (descCell && valCell !== undefined && valCell !== null && valCell !== '' && !String(descCell).toLowerCase().includes('total'));
                        
                        if (isMainValid) {
                            let amount = 0;
                            let type = 'income';

                            let rawVal = parsePtBrNumber(valCell);
                            if (!isNaN(rawVal)) {
                                let currentBalance = parsePtBrNumber(balanceCell);

                                if (!isNaN(currentBalance) && balanceCell !== undefined && balanceCell !== null && balanceCell !== '') {
                                    let delta = currentBalance - lastBalance;
                                    if (Math.abs(delta) < 0.01) {
                                        amount = Math.abs(rawVal);
                                        type = rawVal < 0 ? 'expense' : 'income';
                                    } else {
                                        amount = Math.abs(delta);
                                        type = delta < 0 ? 'expense' : 'income';
                                    }
                                    lastBalance = currentBalance;
                                } else {
                                    amount = Math.abs(rawVal);
                                    type = rawVal < 0 ? 'expense' : 'income';
                                    if (!isNaN(lastBalance)) lastBalance += (type === 'income' ? amount : -amount);
                                }
                                
                                if (amount !== 0) {
                                    this.previewData.push({
                                        id: window.Utils.generateId(),
                                        date: lastValidDate.toISOString().split('T')[0],
                                        description: String(descCell).trim(),
                                        amount: amount,
                                        type: type,
                                        category: 'Importado',
                                        paymentMethod: 'account',
                                        status: 'paid',
                                        userId: window.currentUser ? window.currentUser.id : '1'
                                    });
                                }
                            }
                        }

                        // === EXTRAIR TABELAS DE CARTÕES (LADO DIREITO) ===
                        creditCardTables.forEach(card => {
                            let cardDesc = row[card.colDesc];
                            let cardVal = row[card.colVal];
                            let cardInst = row[card.colInst]; // Ex: "1/4", "3/10"

                            // Se tem valor, processamos
                            if (cardVal !== undefined && cardVal !== null && cardVal !== '') {
                                let amount = parsePtBrNumber(cardVal);
                                if (!isNaN(amount) && amount !== 0) {
                                    
                                    // Monta a descrição
                                    let finalDesc = '';
                                    if (cardDesc && String(cardDesc).trim() !== '') {
                                        finalDesc = String(cardDesc).trim();
                                    } else {
                                        finalDesc = 'Compra Cartão'; // Fallback se vazia
                                    }

                                    // Adiciona a parcela na descrição, se existir
                                    if (cardInst && String(cardInst).trim() !== '') {
                                        finalDesc += ` (${String(cardInst).trim()})`;
                                    }

                                    // Para cartões, ignoramos totais
                                    if (finalDesc.toLowerCase().includes('total')) return;

                                    this.previewData.push({
                                        id: window.Utils.generateId(),
                                        date: lastValidDate.toISOString().split('T')[0],
                                        description: finalDesc,
                                        amount: Math.abs(amount),
                                        type: 'expense', // Faturas sempre são despesas no final
                                        category: 'Importado',
                                        paymentMethod: 'credit_card', // Força a ser cartão
                                        status: 'paid',
                                        notes: `Importado da fatura: ${card.name}`,
                                        userId: window.currentUser ? window.currentUser.id : '1'
                                    });
                                }
                            }
                        });
                    }
                });
                
                window.UI.closeModal('importModal');
                this.renderPreview();
                
            } catch (err) {
                console.error(err);
                window.UI.showToast('Não foi possível ler o arquivo. Ele está corrompido ou protegido?', 'error');
            }
        };
        
        reader.readAsArrayBuffer(file);
    }

    renderPreview() {
        if (this.previewData.length === 0) {
            window.UI.showToast('Nenhum lançamento foi encontrado na planilha.', 'warning');
            return;
        }

        const tbody = document.getElementById('previewTableBody');
        tbody.innerHTML = '';
        
        let totalIncome = 0;
        let totalExpense = 0;

        this.previewData.forEach(tx => {
            if (tx.type === 'income') totalIncome += tx.amount;
            else totalExpense += tx.amount;

            const isIncome = tx.type === 'income';
            const badgeClass = isIncome ? 'income' : 'expense';
            const badgeText = isIncome ? 'Receita' : 'Despesa';
            const sign = isIncome ? '+' : '-';
            const amountColor = isIncome ? 'var(--success)' : 'var(--text-primary)';

            tbody.innerHTML += `
                <tr>
                    <td>${window.Utils.formatDate(tx.date)}</td>
                    <td style="font-weight: 500;">${window.Utils.escapeHTML(tx.description)}</td>
                    <td style="color: ${amountColor}; font-weight: 600;">${sign} ${window.Utils.formatCurrency(tx.amount)}</td>
                    <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
                    <td><span class="tx-badge success">Pronto</span></td>
                </tr>
            `;
        });

        document.getElementById('previewCount').textContent = this.previewData.length;
        document.getElementById('previewIncome').textContent = window.Utils.formatCurrency(totalIncome);
        document.getElementById('previewExpense').textContent = window.Utils.formatCurrency(totalExpense);

        window.UI.openModal('importPreviewModal');
    }

    saveToDatabase() {
        if (this.previewData.length === 0) return;

        let existingTx = window.Storage.get('transactions') || [];
        existingTx = existingTx.concat(this.previewData);
        window.Storage.set('transactions', existingTx);

        window.UI.closeModal('importPreviewModal');
        window.UI.showToast(`${this.previewData.length} lançamentos importados com sucesso!`, 'success');
        
        // Refresh local table if it exists
        if (window.transactionsController) {
            window.transactionsController.allTransactions = existingTx;
            document.getElementById('btnFilter').click();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Apenas inicializar se os modais existirem na tela
    if (document.getElementById('importModal')) {
        window.ExcelImporterApp = new ExcelImporter();
    }
});
