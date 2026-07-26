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
            const d = this.parseTxDate(dateString);
            if (!d || isNaN(d.getTime())) return '-';
            return new Intl.DateTimeFormat('pt-BR').format(d);
        } catch (e) { return '-'; }
    },

    parseTxDate(dateVal) {
        if (!dateVal) return null;
        try {
            if (dateVal instanceof Date) return dateVal;
            if (typeof dateVal === 'number') return new Date(dateVal);
            
            const str = String(dateVal).trim();
            if (!str) return null;

            // If it's a numeric string timestamp
            if (/^\d{10,}$/.test(str)) {
                return new Date(parseInt(str, 10));
            }

            // Handle DD/MM/YYYY (Brazilian format)
            if (str.includes('/')) {
                const parts = str.split('T')[0].split(' ')[0].split('/').map(Number);
                if (parts.length === 3) {
                    const [day, month, year] = parts;
                    if (year && month && day) {
                        return new Date(year, month - 1, day, 12, 0, 0);
                    }
                }
            }

            // Handle YYYY-MM-DD or ISO string
            const dateOnly = str.split('T')[0].split(' ')[0];
            const parts = dateOnly.split('-').map(Number);
            if (parts.length === 3) {
                const [year, month, day] = parts;
                if (year && month && day) {
                    return new Date(year, month - 1, day, 12, 0, 0);
                }
            }

            // Standard Date fallback
            const fallback = new Date(str);
            return isNaN(fallback.getTime()) ? null : fallback;
        } catch (e) {
            return null;
        }
    },

    getCardInvoiceMonth(txDateStr, closeDay = 28, dueDay = 10) {
        if (!txDateStr) return '';
        const d = this.parseTxDate(txDateStr);
        if (!d) return '';

        let year = d.getFullYear();
        let month = d.getMonth();
        const day = d.getDate();

        const closeD = parseInt(closeDay) || 28;

        // A partir do próprio dia de fechamento (day >= closeD), a compra vai para a fatura do mês seguinte!
        if (day >= closeD) {
            month += 1;
        }

        const invoiceDate = new Date(year, month, 1);
        const invYear = invoiceDate.getFullYear();
        const invMonth = String(invoiceDate.getMonth() + 1).padStart(2, '0');
        
        return `${invYear}-${invMonth}`;
    },

    getCardMetrics(closeDay = 28, dueDay = 10, refDate = new Date()) {
        const closeD = parseInt(closeDay) || 28;
        const dueD = parseInt(dueDay) || 10;
        
        const now = refDate ? new Date(refDate) : new Date();
        now.setHours(0, 0, 0, 0);

        const year = now.getFullYear();
        const month = now.getMonth();

        const getClampedDate = (y, m, d) => {
            const lastDay = new Date(y, m + 1, 0).getDate();
            const validDay = Math.min(d, lastDay);
            return new Date(y, m, validDay, 0, 0, 0, 0);
        };

        // Trata ajuste de finais de semana se necessário
        const getBusinessDay = (date, rollForward = true) => {
            const d = new Date(date);
            const dayOfWeek = d.getDay();
            if (dayOfWeek === 6) { // Sábado -> antecipa para sexta ou joga pra segunda
                d.setDate(d.getDate() + (rollForward ? 2 : -1));
            } else if (dayOfWeek === 0) { // Domingo
                d.setDate(d.getDate() + (rollForward ? 1 : -2));
            }
            return d;
        };

        const currentClosing = getClampedDate(year, month, closeD);

        // 1. Fechamento recente e próximo fechamento
        let prevClosing;
        let proximoFechamento;

        if (now < currentClosing) {
            proximoFechamento = currentClosing;
            prevClosing = getClampedDate(year, month - 1, closeD);
        } else {
            prevClosing = currentClosing;
            proximoFechamento = getClampedDate(year, month + 1, closeD);
        }

        // 2. Próximo Vencimento (A primeira data de vencimento que é HOJE ou no FUTURO)
        let proximoVencimento;
        const pcYear = prevClosing.getFullYear();
        const pcMonth = prevClosing.getMonth();

        let prevInvoiceDue;
        if (dueD > closeD) {
            prevInvoiceDue = getClampedDate(pcYear, pcMonth, dueD);
        } else {
            prevInvoiceDue = getClampedDate(pcYear, pcMonth + 1, dueD);
        }

        if (prevInvoiceDue >= now) {
            proximoVencimento = prevInvoiceDue;
        } else {
            const fYear = proximoFechamento.getFullYear();
            const fMonth = proximoFechamento.getMonth();
            if (dueD > closeD) {
                proximoVencimento = getClampedDate(fYear, fMonth, dueD);
            } else {
                proximoVencimento = getClampedDate(fYear, fMonth + 1, dueD);
            }
        }

        // O melhor dia de compra do ciclo atual (ex: 23/07/2026 em Julho):
        let melhorDiaCompra;
        if (now < currentClosing) {
            melhorDiaCompra = getClampedDate(year, month - 1, closeD);
        } else {
            melhorDiaCompra = currentClosing; // O dia 23/07/2026 em Julho!
        }
        const proximoMelhorDia = proximoFechamento;

        const diffMsClose = proximoFechamento - now;
        const diasParaFechamento = Math.max(0, Math.ceil(diffMsClose / (1000 * 60 * 60 * 24)));

        const diffMsDue = proximoVencimento - now;
        const diasParaVencimento = Math.max(0, Math.ceil(diffMsDue / (1000 * 60 * 60 * 24)));

        const vaiParaProxima = now >= currentClosing;

        // 3. Vencimento específico para compras feitas HOJE
        let vencimentoCompraHoje;
        if (vaiParaProxima) {
            const fYear = proximoFechamento.getFullYear();
            const fMonth = proximoFechamento.getMonth();
            if (dueD > closeD) {
                vencimentoCompraHoje = getClampedDate(fYear, fMonth, dueD);
            } else {
                vencimentoCompraHoje = getClampedDate(fYear, fMonth + 1, dueD);
            }
        } else {
            if (dueD > closeD) {
                vencimentoCompraHoje = getClampedDate(year, month, dueD);
            } else {
                vencimentoCompraHoje = getClampedDate(year, month + 1, dueD);
            }
        }

        const formattedFechamento = this.formatDate(proximoFechamento.toISOString().split('T')[0]);
        const formattedVencimento = this.formatDate(proximoVencimento.toISOString().split('T')[0]);
        const formattedVencimentoCompraHoje = this.formatDate(vencimentoCompraHoje.toISOString().split('T')[0]);
        const formattedMelhorDia = this.formatDate(melhorDiaCompra.toISOString().split('T')[0]);
        const formattedProximoMelhorDia = this.formatDate(proximoMelhorDia.toISOString().split('T')[0]);

        const destinoCompraHoje = vaiParaProxima 
            ? `Próxima Fatura (vence em ${formattedVencimentoCompraHoje})`
            : `Fatura Atual (vence em ${formattedVencimentoCompraHoje})`;

        return {
            proximoFechamento,
            proximoVencimento,
            melhorDiaCompra,
            proximoMelhorDia,
            diasParaFechamento,
            diasParaVencimento,
            vaiParaProxima,
            destinoCompraHoje,
            formattedFechamento,
            formattedVencimento,
            formattedMelhorDia,
            formattedProximoMelhorDia
        };
    },

    getCardMetricsForInvoiceMonth(invMonthStr, closeDay = 28, dueDay = 10) {
        const closeD = parseInt(closeDay) || 28;
        const dueD = parseInt(dueDay) || 10;
        
        let year, month;
        if (invMonthStr && invMonthStr.includes('-')) {
            const parts = invMonthStr.split('-');
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
        } else {
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth();
        }

        const getClampedDate = (y, m, d) => {
            const lastDay = new Date(y, m + 1, 0).getDate();
            const validDay = Math.min(d, lastDay);
            return new Date(y, m, validDay, 0, 0, 0, 0);
        };

        const vencimentoDate = getClampedDate(year, month, dueD);
        let fechamentoDate;

        if (dueD > closeD) {
            fechamentoDate = getClampedDate(year, month, closeD);
        } else {
            fechamentoDate = getClampedDate(year, month - 1, closeD);
        }

        const melhorDiaDate = fechamentoDate;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentClosingForToday = getClampedDate(today.getFullYear(), today.getMonth(), closeD);
        const vaiParaProxima = today >= currentClosingForToday;

        let vencimentoCompraHoje;
        const tYear = today.getFullYear();
        const tMonth = today.getMonth();
        if (vaiParaProxima) {
            const nextClosing = getClampedDate(tYear, tMonth + 1, closeD);
            const fYear = nextClosing.getFullYear();
            const fMonth = nextClosing.getMonth();
            if (dueD > closeD) {
                vencimentoCompraHoje = getClampedDate(fYear, fMonth, dueD);
            } else {
                vencimentoCompraHoje = getClampedDate(fYear, fMonth + 1, dueD);
            }
        } else {
            if (dueD > closeD) {
                vencimentoCompraHoje = getClampedDate(tYear, tMonth, dueD);
            } else {
                vencimentoCompraHoje = getClampedDate(tYear, tMonth + 1, dueD);
            }
        }

        const formattedFechamento = this.formatDate(fechamentoDate.toISOString().split('T')[0]);
        const formattedVencimento = this.formatDate(vencimentoDate.toISOString().split('T')[0]);
        const formattedMelhorDia = this.formatDate(melhorDiaDate.toISOString().split('T')[0]);
        const formattedVencimentoCompraHoje = this.formatDate(vencimentoCompraHoje.toISOString().split('T')[0]);

        const destinoCompraHoje = vaiParaProxima 
            ? `Próxima Fatura (vence em ${formattedVencimentoCompraHoje})`
            : `Fatura Atual (vence em ${formattedVencimentoCompraHoje})`;

        return {
            fechamentoDate,
            vencimentoDate,
            melhorDiaDate,
            formattedFechamento,
            formattedVencimento,
            formattedMelhorDia,
            vaiParaProxima,
            destinoCompraHoje
        };
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
