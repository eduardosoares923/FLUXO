const Utils = {
    formatCurrency(value) {
        const num = parseFloat(value);
        if (isNaN(num)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(num);
    },

    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const dateOnly = String(dateString).split('T')[0].trim();
            const [year, month, day] = dateOnly.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            if (isNaN(date.getTime())) return '-';
            return new Intl.DateTimeFormat('pt-BR').format(date);
        } catch (e) { return '-'; }
    },

    parseTxDate(dateString) {
        if (!dateString) return null;
        try {
            const dateOnly = String(dateString).split('T')[0].trim();
            const [year, month, day] = dateOnly.split('-').map(Number);
            if (!year || !month || !day) return null;
            return new Date(year, month - 1, day, 12, 0, 0);
        } catch (e) { return null; }
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    parseCurrency(valueString) {
        if (!valueString) return 0;
        if (typeof valueString === 'number') return valueString;
        let str = valueString.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    },

    validateRequired(...fields) {
        return fields.every(f => f !== null && f !== undefined && f.toString().trim() !== '');
    },
    
    validateNumber(val, min = -Infinity, max = Infinity) {
        const num = parseFloat(val);
        return !isNaN(num) && num >= min && num <= max;
    },

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    getPaymentMethodName(methodStr) {
        if (!methodStr || methodStr === 'account') {
            const accounts = window.Storage ? window.Storage.get('accounts') || [] : [];
            const defaultAcc = accounts.find(a => a.id === 'default_account');
            return defaultAcc ? defaultAcc.name : 'Conta Corrente';
        }
        
        if (methodStr.startsWith('acc_')) {
            const id = methodStr.replace('acc_', '');
            const accounts = window.Storage ? window.Storage.get('accounts') || [] : [];
            const acc = accounts.find(a => a.id === id);
            return acc ? acc.name : 'Conta Corrente';
        }
        
        if (methodStr.startsWith('card_')) {
            const id = methodStr.replace('card_', '');
            const cards = window.Storage ? window.Storage.get('cards') || [] : [];
            const card = cards.find(c => c.id === id);
            return card ? `Cartão ${card.name}` : 'Cartão de Crédito';
        }
        
        return methodStr;
    },

    /**
     * Extrai valores e valida um form html
     */
    getFormDataAndValidate(formId, requiredFields = []) {
        const form = document.getElementById(formId);
        if (!form) return null;
        
        const data = {};
        let isValid = true;
        const formData = new FormData(form);
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
            if (requiredFields.includes(key) && !value.toString().trim()) {
                isValid = false;
                const fieldEl = form.querySelector(`[name="${key}"]`);
                if(fieldEl) {
                    fieldEl.style.borderColor = 'var(--danger)';
                    // Remove error style on input
                    fieldEl.addEventListener('input', function() { this.style.borderColor = ''; }, {once:true});
                }
            }
        }
        
        if (!isValid) {
            if(window.UI) window.UI.showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
            return null;
        }
        return data;
    }
};

window.Utils = Utils;
