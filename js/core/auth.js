class AuthManager {
    constructor() {
        this.session = window.Storage.get('session');
        this.isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname === '' || window.location.pathname.endsWith('/index');

        this.verifySession();
        this.bindLoginEvents();
        this.protectUI();
        this.initFirebaseAuthListener();
    }

    initFirebaseAuthListener() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    if (!this.session || this.session.id !== user.uid) {
                        this.syncUserSessionFromFirestore(user.uid);
                    }
                } else {
                    if (this.session) {
                        window.Storage.remove('session');
                        this.session = null;
                        if (!this.isLoginPage) window.location.href = 'index.html';
                    }
                }
            });
        }
    }

    async syncUserSessionFromFirestore(uid) {
        try {
            const db = firebase.firestore();
            const userEmail = (firebase.auth().currentUser && firebase.auth().currentUser.email) ? firebase.auth().currentUser.email.toLowerCase() : '';

            let userData = null;
            let userDocId = uid;

            // 1. Try fetching doc by UID
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists) {
                userData = doc.data();
            } else if (userEmail) {
                // 2. Fallback: Search by email if created beforehand in Users management
                const querySnap = await db.collection('users').where('email', '==', userEmail).get();
                if (!querySnap.empty) {
                    const matchDoc = querySnap.docs[0];
                    userData = matchDoc.data();
                    userDocId = matchDoc.id;
                }
            }

            if (userData) {
                if (userData.status === 'inativo') {
                    firebase.auth().signOut();
                    window.Storage.remove('session');
                    this.session = null;
                    if (window.UI) window.UI.showToast('Seu usuário está desativado pelo Administrador.', 'error');
                    if (!this.isLoginPage) window.location.href = 'index.html';
                    return;
                }

                this.session = {
                    id: userDocId,
                    name: userData.name || 'Usuário',
                    username: userData.username || (userData.email ? userData.email.split('@')[0] : 'usuario'),
                    cpf: userData.cpf || '',
                    email: userData.email || userEmail,
                    avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}`,
                    role: userData.role || 'usuario',
                    person: userData.person || userData.name || 'Eu',
                    permissions: userData.permissions || {},
                    loginTime: new Date().toISOString()
                };
                window.Storage.set('session', this.session);
                window.currentUser = this.session;

                // Re-initialize Firestore sync NOW that user is authenticated
                if (window.Storage && typeof window.Storage.initFirebaseSync === 'function') {
                    window.Storage.initFirebaseSync();
                }

                if (this.isLoginPage) {
                    window.location.href = 'dashboard.html';
                } else {
                    this.protectUI();
                }
            } else {
                // 3. New User Registration Fallback: Check if system is empty
                const allUsersSnap = await db.collection('users').get();
                const isFirstSystemUser = allUsersSnap.empty;

                const newUserRole = isFirstSystemUser ? 'admin' : 'usuario';
                const newUserName = isFirstSystemUser ? 'Administrador Principal' : (userEmail ? userEmail.split('@')[0] : 'Usuario');

                const newUserRecord = {
                    id: uid,
                    name: newUserName,
                    username: newUserName.toLowerCase().replace(/\s+/g, ''),
                    email: userEmail,
                    role: newUserRole,
                    person: newUserName,
                    status: 'ativo',
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUserName)}&background=random&color=fff`,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString()
                };
                
                await db.collection('users').doc(uid).set(newUserRecord);
                
                this.session = {
                    id: uid,
                    name: newUserRecord.name,
                    username: newUserRecord.username,
                    email: newUserRecord.email,
                    avatar: newUserRecord.avatar,
                    role: newUserRecord.role,
                    person: newUserRecord.person,
                    permissions: {},
                    loginTime: new Date().toISOString()
                };
                window.Storage.set('session', this.session);
                if (this.isLoginPage) {
                    window.location.href = 'dashboard.html';
                }
            }
        } catch (e) {
            console.error("Erro ao sincronizar sessão:", e);
            if (e.code === 'permission-denied') {
                if (window.UI) window.UI.showToast('Erro de Permissão no Banco de Dados. Desbloqueie o Firestore nas Regras.', 'error');
            } else {
                if (window.UI) window.UI.showToast('Erro ao ler banco de dados: ' + e.message, 'error');
            }
            const btn = document.getElementById('loginBtn');
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    }

    verifySession() {
        if (!this.session && !this.isLoginPage) {
            window.location.href = 'index.html';
        } else if (this.session && this.isLoginPage) {
            window.location.href = 'dashboard.html';
        }
    }

    canAccessPerson(personName) {
        if (!this.session) return false;
        if (this.session.role === 'admin') return true;
        if (!personName) return true;
        return this.session.person === personName;
    }

    hasPermission(module, action = 'view') {
        if (!this.session) return false;
        if (this.session.role === 'admin') return true;

        if (module === 'admin') return this.session.role === 'admin';
        if (module === 'gerente') return ['admin', 'gerente'].includes(this.session.role);
        
        if (module === 'config_system') return this.session.role === 'admin' || (this.session.permissions && this.session.permissions['settings'] && this.session.permissions['settings'].includes('edit'));
        if (module === 'manage_users') return this.session.role === 'admin' || (this.session.permissions && this.session.permissions['users'] && this.session.permissions['users'].includes('view'));

        const permissions = this.session.permissions || {};
        const modPerms = permissions[module] || [];
        return modPerms.includes(action);
    }

    protectUI() {
        if (this.isLoginPage) return;
        
        document.querySelectorAll('[data-requires-role]').forEach(el => {
            const requiredRole = el.getAttribute('data-requires-role');
            if (!this.hasPermission(requiredRole)) {
                el.style.display = 'none';
            }
        });

        document.querySelectorAll('.logout-btn, #logoutBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
        
        const userName = document.getElementById('userName');
        if (userName && this.session) userName.textContent = this.session.name;
    }

    logout() {
        if (window.Audit) {
            window.Audit.log('LOGOUT', { userId: this.session?.id });
        }
        if (typeof firebase !== 'undefined') {
            firebase.auth().signOut().then(() => {
                window.Storage.remove('session');
                window.location.href = 'index.html';
            });
        } else {
            window.Storage.remove('session');
            window.location.href = 'index.html';
        }
    }

    bindLoginEvents() {
        if (!this.isLoginPage) return;

        window.Storage.init();

        const loginForm = document.getElementById('loginForm');
        const togglePassword = document.getElementById('togglePassword');
        const emailInput = document.getElementById('email');
        const rememberedEmail = window.Storage.get('rememberedEmail');

        if (rememberedEmail && emailInput) {
            emailInput.value = rememberedEmail;
            document.getElementById('rememberMe').checked = true;
        }

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const passwordInput = document.getElementById('password');
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    togglePassword.classList.replace('fa-eye', 'fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    togglePassword.classList.replace('fa-eye-slash', 'fa-eye');
                }
            });
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const loginInput = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        const btn = document.getElementById('loginBtn');

        if (!loginInput || !password) {
            if (window.UI) window.UI.showToast('Preencha os campos de login e senha.', 'error');
            return;
        }

        btn.classList.add('loading');
        btn.disabled = true;

        try {
            let authEmail = loginInput;
            let foundUser = null;

            if (typeof firebase !== 'undefined') {
                const db = firebase.firestore();
                const usersSnap = await db.collection('users').get();
                const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const cleanInput = loginInput.toLowerCase();
                const cleanCpf = loginInput.replace(/\D/g, '');

                foundUser = allUsers.find(u => 
                    (u.username && u.username.toLowerCase() === cleanInput) ||
                    (u.email && u.email.toLowerCase() === cleanInput) ||
                    (cleanCpf.length > 0 && u.cpf && u.cpf.replace(/\D/g, '') === cleanCpf)
                );

                if (foundUser) {
                    if (foundUser.status === 'inativo') {
                        if (window.UI) window.UI.showToast('Este usuário está inativo. Entre em contato com o Administrador.', 'error');
                        btn.classList.remove('loading');
                        btn.disabled = false;
                        return;
                    }
                    
                    authEmail = foundUser.email || `${foundUser.username.toLowerCase()}@fluxo.app`;
                }

                const userCredential = await firebase.auth().signInWithEmailAndPassword(authEmail, password);
                
                if (rememberMe) {
                    window.Storage.set('rememberedEmail', loginInput);
                } else {
                    window.Storage.remove('rememberedEmail');
                }

                if (window.Audit) {
                    window.Audit.log('LOGIN', { identifier: loginInput, userId: userCredential.user.uid });
                }

                if (window.UI) window.UI.showToast('Login realizado com sucesso!', 'success');
            } else {
                if (window.UI) window.UI.showToast('Firebase não inicializado.', 'error');
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Erro de login:', error);
            let msg = 'Identificador ou senha incorretos.';
            if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
            if (error.code === 'auth/wrong-password') msg = 'Senha incorreta.';
            if (error.code === 'auth/invalid-email') msg = 'Formato de login inválido.';
            if (window.UI) window.UI.showToast(msg, 'error');
            
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }
}

window.Auth = new AuthManager();