// storage.js
const APP_PREFIX = 'fluxo_';

window.Storage = {
    syncCollections: ['users', 'accounts', 'transactions', 'cards', 'settings', 'persons', 'paidInvoices', 'subscriptions'],
    isFirebaseReady: false,
    unsubscribes: {},
    // Rastreia IDs pendentes de exclusão para evitar que onSnapshot os ressuscite
    _pendingDeletes: {},

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
                const firestoreData = [];
                snapshot.forEach(doc => {
                    firestoreData.push({ id: doc.id, ...doc.data() });
                });
                
                const localData = this.get(collection) || [];
                
                // 1. Initial Migration: Se o Firestore estiver vazio mas houver dados locais, faz o upload inicial
                if (snapshot.empty && localData.length > 0) {
                    localData.forEach(item => {
                        if (item && item.id) {
                            const cleanRecord = JSON.parse(JSON.stringify(item));
                            db.collection(collection).doc(String(item.id)).set(cleanRecord, { merge: true });
                        }
                    });
                    return;
                }

                // 2. Filtrar itens que estão pendentes de exclusão local
                // Isso impede que o onSnapshot "ressuscite" um item que o usuário acabou de deletar
                const pendingSet = this._pendingDeletes[collection];
                let finalData = firestoreData;
                if (pendingSet && pendingSet.size > 0) {
                    finalData = firestoreData.filter(item => !pendingSet.has(String(item.id)));
                }

                // 3. Sincronização Normal: Firestore é a fonte da verdade (exceto itens pendentes)
                localStorage.setItem(APP_PREFIX + collection, JSON.stringify(finalData));
                
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
            const idx = localData.findIndex(item => String(item.id) === String(record.id));
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

                firebase.firestore().collection(collection).doc(String(record.id)).set(cleanRecord, { merge: true })
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
            const strId = String(id);

            // 1. Registrar como exclusão pendente ANTES de tudo
            // Isso garante que o onSnapshot não vai ressuscitar este item
            if (!this._pendingDeletes[collection]) {
                this._pendingDeletes[collection] = new Set();
            }
            this._pendingDeletes[collection].add(strId);

            // 2. Otimista local remove
            const localData = this.get(collection) || [];
            const filtered = localData.filter(item => String(item.id) !== strId);
            this.set(collection, filtered);
            this.notifyDataChanged(collection);

            // 3. Deletar no Firestore
            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                let isResolved = false;
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        console.warn('Firestore delete query timed out. Resolving locally.');
                        // Manter na pendingDeletes por mais 10s para segurança
                        setTimeout(() => {
                            if (this._pendingDeletes[collection]) {
                                this._pendingDeletes[collection].delete(strId);
                            }
                        }, 10000);
                        resolve();
                    }
                }, 5000);

                firebase.firestore().collection(collection).doc(strId).delete()
                    .then(() => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                        }
                        // Remover da lista de pendentes após confirmação do Firestore
                        // Aguardar um pouco para o onSnapshot processar
                        setTimeout(() => {
                            if (this._pendingDeletes[collection]) {
                                this._pendingDeletes[collection].delete(strId);
                            }
                        }, 3000);
                        resolve();
                    })
                    .catch(e => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            console.error('Erro ao deletar no Firestore:', e);
                            this.notifyError(e, 'Erro ao excluir documento no banco de dados');
                        }
                        // Em caso de erro, remover da pendingDeletes eventualmente
                        setTimeout(() => {
                            if (this._pendingDeletes[collection]) {
                                this._pendingDeletes[collection].delete(strId);
                            }
                        }, 5000);
                        resolve(); // Fallback to local deletion
                    });
            } else {
                // Sem Firebase, remover imediatamente da pendingDeletes
                this._pendingDeletes[collection].delete(strId);
                resolve();
            }
        });
    },

    deleteRecords(collection, ids) {
        return new Promise((resolve) => {
            if (!ids || ids.length === 0) {
                resolve();
                return;
            }

            const strIds = ids.map(id => String(id));
            const idSet = new Set(strIds);

            // 1. Registrar todos os IDs em _pendingDeletes
            if (!this._pendingDeletes[collection]) {
                this._pendingDeletes[collection] = new Set();
            }
            strIds.forEach(id => this._pendingDeletes[collection].add(id));

            // 2. Otimista local remove - UMA ÚNICA VEZ em memória
            const localData = this.get(collection) || [];
            const filtered = localData.filter(item => !idSet.has(String(item.id)));
            this.set(collection, filtered);
            this.notifyDataChanged(collection);

            // 3. Deletar no Firestore em lote (Batches de até 400 comandos para alta performance)
            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                const db = firebase.firestore();
                const chunkSize = 400;
                const chunks = [];
                for (let i = 0; i < strIds.length; i += chunkSize) {
                    chunks.push(strIds.slice(i, i + chunkSize));
                }

                const batchPromises = chunks.map(chunk => {
                    const batch = db.batch();
                    chunk.forEach(id => {
                        const ref = db.collection(collection).doc(id);
                        batch.delete(ref);
                    });
                    return batch.commit();
                });

                Promise.all(batchPromises).then(() => {
                    setTimeout(() => {
                        if (this._pendingDeletes[collection]) {
                            strIds.forEach(id => this._pendingDeletes[collection].delete(id));
                        }
                    }, 3000);
                    resolve();
                }).catch(e => {
                    console.error('Erro ao deletar lote no Firestore:', e);
                    setTimeout(() => {
                        if (this._pendingDeletes[collection]) {
                            strIds.forEach(id => this._pendingDeletes[collection].delete(id));
                        }
                    }, 5000);
                    resolve();
                });
            } else {
                if (this._pendingDeletes[collection]) {
                    strIds.forEach(id => this._pendingDeletes[collection].delete(id));
                }
                resolve();
            }
        });
    }
};

// Auto-inicializar sincronização Firebase em TODAS as páginas
window.Storage.init();