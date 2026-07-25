// storage.js
const APP_PREFIX = 'fluxo_';

window.Storage = {
    syncCollections: ['users', 'accounts', 'transactions', 'cards', 'settings'],
    isFirebaseReady: false,
    unsubscribes: {},

    init() {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            this.initFirebaseSync();
        }
    },

    initFirebaseSync() {
        const db = firebase.firestore();
        this.isFirebaseReady = true;

        this.syncCollections.forEach(collection => {
            // Cancel previous listener if exists
            if (this.unsubscribes[collection]) {
                this.unsubscribes[collection]();
            }

            this.unsubscribes[collection] = db.collection(collection).onSnapshot((snapshot) => {
                const dataArray = [];
                snapshot.forEach(doc => {
                    dataArray.push({ id: doc.id, ...doc.data() });
                });
                
                // Store in local cache
                localStorage.setItem(APP_PREFIX + collection, JSON.stringify(dataArray));
                
                // Trigger events to update UI
                this.notifyDataChanged(collection);
            }, (error) => {
                console.error('Firebase sync error on collection:', collection, error);
                if (error.code === 'permission-denied') {
                    if (window.UI) window.UI.showToast('Permissão insuficiente para sincronizar ' + collection, 'error');
                } else if (error.code === 'unavailable') {
                    if (window.UI) window.UI.showToast('Modo offline: Sincronização em segundo plano', 'info');
                }
            });
        });
    },

    notifyDataChanged(collection) {
        window.dispatchEvent(new CustomEvent('fluxo:dataChanged', { detail: { collection } }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { collection } }));
    },

    // Helper for error messages
    notifyError(err, fallbackMsg) {
        if (!window.UI) return;
        let msg = fallbackMsg || 'Erro ao processar operação.';
        if (err) {
            if (err.code === 'permission-denied') msg = 'Permissão insuficiente. Verifique suas regras de acesso.';
            else if (err.code === 'unavailable') msg = 'Sem conexão com o servidor. Dados salvos localmente.';
            else if (err.message) msg = err.message;
        }
        window.UI.showToast(msg, 'error');
    },

    // Legacy method for settings or local only overrides
    set(key, value) {
        try {
            localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
        } catch (e) {
            console.error('Erro ao salvar no LocalStorage', e);
            this.notifyError(e, 'Erro ao salvar no armazenamento local');
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
            if (key.startsWith(APP_PREFIX) && key !== APP_PREFIX + 'rememberedEmail') {
                localStorage.removeItem(key);
            }
        });
    },

    // New Granular Operations for Firestore
    saveRecord(collection, record) {
        return new Promise((resolve, reject) => {
            if (!record.id) {
                record.id = window.Utils ? window.Utils.generateId() : Date.now().toString();
            }

            // Otimista local save to array to prevent ui lag
            const localData = this.get(collection) || [];
            const idx = localData.findIndex(item => item.id === record.id);
            if (idx >= 0) {
                localData[idx] = record;
            } else {
                localData.push(record);
            }
            this.set(collection, localData);
            this.notifyDataChanged(collection);

            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                const cleanRecord = JSON.parse(JSON.stringify(record));
                
                // 5s Timeout Safeguard to prevent infinite loading
                let isResolved = false;
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        console.warn('Firestore save query timed out. Resolving locally.');
                        resolve(record);
                    }
                }, 5000);

                firebase.firestore().collection(collection).doc(record.id).set(cleanRecord, { merge: true })
                    .then(() => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            resolve(record);
                        }
                    })
                    .catch(e => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            console.error('Erro ao salvar no Firestore:', e);
                            this.notifyError(e, 'Erro ao salvar documento no banco de dados');
                            resolve(record); // Fallback to local save so UI doesn't crash
                        }
                    });
            } else {
                resolve(record);
            }
        });
    },

    deleteRecord(collection, id) {
        return new Promise((resolve, reject) => {
            // Otimista local remove
            const localData = this.get(collection) || [];
            const filtered = localData.filter(item => item.id !== id);
            this.set(collection, filtered);
            this.notifyDataChanged(collection);

            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                let isResolved = false;
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        console.warn('Firestore delete query timed out. Resolving locally.');
                        resolve();
                    }
                }, 5000);

                firebase.firestore().collection(collection).doc(id).delete()
                    .then(() => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            resolve();
                        }
                    })
                    .catch(e => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            console.error('Erro ao deletar no Firestore:', e);
                            this.notifyError(e, 'Erro ao excluir documento no banco de dados');
                            resolve(); // Fallback to local deletion
                        }
                    });
            } else {
                resolve();
            }
        });
    }
};

// Auto-inicializar sincronização Firebase em TODAS as páginas
window.Storage.init();