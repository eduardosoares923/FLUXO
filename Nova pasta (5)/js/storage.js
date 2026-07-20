/**
 * Abstração do LocalStorage para manipulação de dados e persistência
 */

const APP_PREFIX = '@fluxo_caixa:';

const Storage = {
    // Inicializar o banco de dados no LocalStorage caso não exista
    init() {
        if (!this.get('users')) {
            // Criar usuário admin padrão conforme requisitos
            const defaultUser = {
                id: '1',
                name: 'Administrador',
                email: 'admin@admin.com',
                password: 'admin123', // Em um sistema real, seria um hash
                avatar: 'https://ui-avatars.com/api/?name=Admin&background=6366f1&color=fff',
                role: 'admin', // admin, gerente, usuario, visitante
                status: 'ativo', // ativo, inativo
                createdAt: new Date().toISOString(),
                lastLogin: null,
                notes: ''
            };
            this.set('users', [defaultUser]);
        }

        // Inicializar estruturas vazias caso não existam
        const collections = ['transactions', 'people', 'accounts', 'cards', 'categories', 'installments'];
        collections.forEach(collection => {
            if (!this.get(collection)) {
                this.set(collection, []);
            }
        });
    },

    set(key, value) {
        try {
            localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
        } catch (e) {
            console.error('Erro ao salvar no LocalStorage', e);
        }
    },

    get(key) {
        try {
            const item = localStorage.getItem(APP_PREFIX + key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error('Erro ao ler do LocalStorage', e);
            return null;
        }
    },

    remove(key) {
        localStorage.removeItem(APP_PREFIX + key);
    },

    clearAll() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(APP_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    }
};

window.Storage = Storage;
