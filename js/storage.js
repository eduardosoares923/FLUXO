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
                
                // Trigger event to update UI
                window.dispatchEvent(new CustomEvent('fluxo:dataChanged', { detail: { collection } }));
            }, (error) => {
                console.error('Firebase sync error on collection:', error);
            });
        });
    },

    // Legacy method for settings or local only overrides
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

            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                // Ensure no undefined values are sent to Firestore
                const cleanRecord = JSON.parse(JSON.stringify(record));
                
                // Don't duplicate the id field inside the document if you prefer, but it's okay
                firebase.firestore().collection(collection).doc(record.id).set(cleanRecord, { merge: true })
                    .then(() => resolve(record))
                    .catch(e => {
                        console.error('Erro ao salvar no Firestore:', e);
                        reject(e);
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

            if (this.isFirebaseReady && typeof firebase !== 'undefined') {
                firebase.firestore().collection(collection).doc(id).delete()
                    .then(() => resolve())
                    .catch(e => {
                        console.error('Erro ao deletar no Firestore:', e);
                        reject(e);
                    });
            } else {
                resolve();
            }
        });
    }
};