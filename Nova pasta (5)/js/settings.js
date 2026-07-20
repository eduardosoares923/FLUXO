class SettingsController {
    constructor() {
        this.init();
        this.importedTransactions = [];
    }

    init() {
        // Backup Actions
        document.getElementById('btnExportBackup')?.addEventListener('click', () => this.exportBackup());
        document.getElementById('restoreFileInput')?.addEventListener('change', (e) => this.handleRestore(e));
        
        // Import Actions
        const dropArea = document.getElementById('dropAreaImport');
        const fileInput = document.getElementById('importFileInput');
        const btnConfirm = document.getElementById('btnConfirmImport');

        if (dropArea) {
            dropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropArea.classList.add('dragover');
            });
            dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dropArea.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    this.handleImportFile(fileInput.files[0]);
                }
            });
            fileInput?.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleImportFile(e.target.files[0]);
                }
            });
        }

        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => this.processImport());
        }
    }

    // ==========================================
    // BACKUP: EXPORT & RESTORE
    // ==========================================

    exportBackup() {
        // Collect everything from localStorage
        const backupData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            users: Storage.get('users') || [],
            currentUser: Storage.get('currentUser') || null,
            accounts: Storage.get('accounts') || [],
            cards: Storage.get('cards') || [],
            transactions: Storage.get('transactions') || [],
            theme: Storage.get('theme') || 'dark'
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_fluxo_caixa_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.UI.showToast('Backup gerado com sucesso!', 'success');
    }

    handleRestore(event) {
        const file = event.target.files[0];
        if (!file) return;

        window.UI.confirmDialog("ATENÇÃO: Restaurar um backup irá APAGAR todos os dados atuais do sistema e substituí-los pelos do arquivo. Tem certeza?", 'Confirmação', () => {
            this.showLoading('Restaurando Backup...', 0);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.transactions || !data.accounts) {
                        throw new Error("Formato de backup inválido.");
                    }

                    this.setLoadingProgress(50);
                    
                    // Save to local storage
                    if (data.users) Storage.set('users', data.users);
                    if (data.currentUser) Storage.set('currentUser', data.currentUser);
                    if (data.accounts) Storage.set('accounts', data.accounts);
                    if (data.cards) Storage.set('cards', data.cards);
                    if (data.transactions) Storage.set('transactions', data.transactions);
                    if (data.theme) Storage.set('theme', data.theme);

                    this.setLoadingProgress(100);
                    setTimeout(() => {
                        this.hideLoading();
                        window.UI.showToast('Backup restaurado com sucesso! Recarregando...', 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    }, 800);

                } catch (error) {
                    this.hideLoading();
                    window.UI.showToast('Erro ao ler arquivo: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        });
        event.target.value = ''; // reset input
    }

    // ==========================================
    // IMPORT TRANSACTIONS (EXCEL/CSV)
    // ==========================================

    handleImportFile(file) {
        document.getElementById('importFileName').textContent = file.name;
        document.getElementById('importActions').style.display = 'block';
        this.importedTransactions = [];
        this.selectedFile = file;
    }

    processImport() {
        if (!this.selectedFile) return;

        this.showLoading('Lendo planilha...', 10);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.setLoadingProgress(30);
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Assume first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                this.setLoadingProgress(60);
                this.parseExcelData(json);
                
            } catch (error) {
                this.hideLoading();
                window.UI.showToast('Erro ao processar planilha. Tente enviar em CSV.', 'error');
                console.error(error);
            }
        };
        reader.readAsArrayBuffer(this.selectedFile);
    }

    parseExcelData(rows) {
        if (!rows || rows.length === 0) {
            this.hideLoading();
            window.UI.showToast('A planilha está vazia.', 'error');
            return;
        }

        const existingTx = Storage.get('transactions') || [];
        let addedCount = 0;
        let duplicateCount = 0;

        rows.forEach(row => {
            // Tenta identificar colunas (insensitive)
            const keys = Object.keys(row);
            const getVal = (possibleNames) => {
                for (let k of keys) {
                    if (possibleNames.some(p => k.toLowerCase().includes(p))) return row[k];
                }
                return "";
            };

            let dateRaw = getVal(['data', 'date']);
            let desc = getVal(['descri', 'histórico', 'historico']);
            let valRaw = getVal(['valor', 'amount', 'quantia']);
            let catRaw = getVal(['categoria', 'category']);
            let typeRaw = getVal(['tipo', 'type']);

            // Formatação de valor (tratar string R$, etc)
            let amount = 0;
            if (typeof valRaw === 'number') {
                amount = valRaw;
            } else if (typeof valRaw === 'string') {
                let clean = valRaw.replace(/[^\d,-]/g, '').replace(',', '.');
                amount = parseFloat(clean);
            }
            if (isNaN(amount) || amount === 0) return; // ignora linhas sem valor válido

            let type = amount < 0 ? 'expense' : 'income';
            amount = Math.abs(amount);

            // Override tipo se coluna existir
            if (typeRaw) {
                if (typeRaw.toLowerCase().includes('receita') || typeRaw.toLowerCase().includes('in')) type = 'income';
                if (typeRaw.toLowerCase().includes('despesa') || typeRaw.toLowerCase().includes('out')) type = 'expense';
            }

            // Converter data (Excel epoch ou string DD/MM/YYYY)
            let finalDate = new Date().toISOString().split('T')[0];
            if (typeof dateRaw === 'number') {
                const jsDate = new Date((dateRaw - (25567 + 2)) * 86400 * 1000);
                finalDate = jsDate.toISOString().split('T')[0];
            } else if (typeof dateRaw === 'string' && dateRaw.includes('/')) {
                const parts = dateRaw.split('/');
                if (parts.length === 3) {
                    finalDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                }
            }

            // Categoria Padrão
            const category = catRaw ? String(catRaw).trim() : 'Outros';
            const description = desc ? String(desc).trim() : 'Importado';

            // Anti-Duplicidade Rule (Mesma data, valor exato e descrição parecida)
            const isDuplicate = existingTx.some(tx => 
                tx.date === finalDate && 
                Math.abs(tx.amount - amount) < 0.01 && 
                tx.description.toLowerCase() === description.toLowerCase()
            );

            if (!isDuplicate) {
                existingTx.push({
                    id: window.Utils.generateId(),
                    type,
                    amount,
                    description,
                    category,
                    date: finalDate,
                    paymentMethod: 'account', // default
                    person: ''
                });
                addedCount++;
            } else {
                duplicateCount++;
            }
        });

        this.setLoadingProgress(90);
        
        Storage.set('transactions', existingTx);
        
        setTimeout(() => {
            this.hideLoading();
            let msg = `${addedCount} transações importadas com sucesso!`;
            if (duplicateCount > 0) msg += ` (${duplicateCount} ignoradas por duplicidade).`;
            
            window.UI.showToast(msg, 'success');
            
            // Dispatch para atualizar dashboards paralelos (se existirem na mesma page)
            const event = new CustomEvent('dataUpdated');
            window.dispatchEvent(event);

            // Reseta UI
            document.getElementById('importActions').style.display = 'none';
            document.getElementById('importFileName').textContent = '';
            document.getElementById('importFileInput').value = '';
            this.selectedFile = null;

        }, 800);
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    showLoading(text, percent) {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').style.display = 'flex';
        this.setLoadingProgress(percent);
    }

    setLoadingProgress(percent) {
        document.getElementById('loadingProgress').style.width = percent + '%';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
        this.setLoadingProgress(0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dropAreaImport')) {
        window.settingsController = new SettingsController();
    }
});
