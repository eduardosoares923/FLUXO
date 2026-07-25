class AuditManager {
    constructor() {
        this.collectionName = 'audit_logs';
    }

    async log(action, details = {}) {
        try {
            if (typeof firebase === 'undefined') return;
            const currentUser = window.currentUser || window.Auth?.session || null;
            
            const logEntry = {
                id: window.Utils?.generateId() || Date.now().toString(),
                action,
                details,
                performedBy: currentUser ? {
                    id: currentUser.id || 'system',
                    name: currentUser.name || 'Sistema',
                    email: currentUser.email || ''
                } : { id: 'anonymous', name: 'Anônimo', email: '' },
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            };

            await window.Storage.saveRecord(this.collectionName, logEntry);
        } catch (e) {
            console.warn('Erro ao registrar log de auditoria:', e);
        }
    }

    async getLogs(limit = 100) {
        try {
            const logs = window.Storage.get(this.collectionName) || [];
            return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
        } catch (e) {
            console.error('Erro ao buscar logs de auditoria:', e);
            return [];
        }
    }
}

window.Audit = new AuditManager();
