const firebaseConfig = {
    apiKey: "AIzaSyDInr79epZ8uJCnbgQNVP52Tn8imKei1_0",
    authDomain: "fluxopro-5ec30.firebaseapp.com",
    projectId: "fluxopro-5ec30",
    storageBucket: "fluxopro-5ec30.firebasestorage.app",
    messagingSenderId: "868961557881",
    appId: "1:868961557881:web:f7879c0e63dc3e904363a8",
    databaseURL: "https://fluxopro-5ec30-default-rtdb.firebaseio.com" // Padrão Firebase RTDB
};

// Ensure Firebase is loaded
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}

const APP_PREFIX = '@fluxo_caixa:';

const Storage = {
    isFirebaseReady: false,

    // Coleções que devem ser sincronizadas na nuvem
    syncCollections: ['users', 'transactions', 'people', 'accounts', 'cards', 'categories', 'installments'],

    init() {
        if (!this.get('users')) {
            const defaultUser = {
                id: '1',
                name: 'Administrador',
                email: 'admin@admin.com',
                password: 'admin123',
                avatar: 'https://ui-avatars.com/api/?name=Admin&background=6366f1&color=fff',
                role: 'admin',
                status: 'ativo',
                createdAt: new Date().toISOString(),
                lastLogin: null,
                notes: ''
            };
            this.set('users', [defaultUser]);
        }

        this.syncCollections.forEach(collection => {
            if (!this.get(collection)) {
                this.set(collection, []);
            }
        });

        // Start Firebase sync se disponível (Online)
        if (typeof firebase !== 'undefined') {
            this.initFirebaseSync();
        }
    },

    initFirebaseSync() {
        const db = firebase.database();
        
        // Ativa ouvintes (listeners) para puxar da nuvem e salvar no navegador automaticamente
        this.syncCollections.forEach(collection => {
            db.ref(collection).on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    localStorage.setItem(APP_PREFIX + collection, JSON.stringify(data));
                    // Dispara evento para o sistema saber que os dados chegaram da nuvem
                    window.dispatchEvent(new CustomEvent('fluxo:dataChanged', { detail: { collection } }));
                }
            });
        });

        this.isFirebaseReady = true;
    },

    set(key, value) {
        try {
            // Salva localmente IMEDIATAMENTE (Otimista) para não travar a tela
            localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
            
            // Empurra para a nuvem de forma invisível no fundo
            if (this.isFirebaseReady && typeof firebase !== 'undefined' && this.syncCollections.includes(key)) {
                firebase.database().ref(key).set(value).catch(e => console.error("Firebase save error", e));
            }
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
        // Também remove da nuvem se for uma coleção sincronizada
        if (this.isFirebaseReady && typeof firebase !== 'undefined' && this.syncCollections.includes(key)) {
            firebase.database().ref(key).remove().catch(e => console.error("Firebase delete error", e));
        }
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
