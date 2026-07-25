// auth.js

class AuthManager {
    constructor() {
        this.session = Storage.get('session');
        this.isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');
        
        this.verifySession();
        this.bindLoginEvents();
        this.protectUI();
        this.initFirebaseAuthListener();
    }

    initFirebaseAuthListener() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    // User is signed in via Firebase
                    // Ensure local session exists and syncs
                    if (!this.session || this.session.id !== user.uid) {
                        this.syncUserSessionFromFirestore(user.uid);
                    }
                } else {
                    // User is signed out
                    if (this.session) {
                        Storage.remove('session');
                        this.session = null;
                        if (!this.isLoginPage) window.location.href = 'index.html';
                    }
                }
            });
        }
    }

    async syncUserSessionFromFirestore(uid) {
        try {
            const doc = await firebase.firestore().collection('users').doc(uid).get();
            if (doc.exists) {
                const userData = doc.data();
                this.session = {
                    id: uid,
                    name: userData.name || 'UsuÃ¡rio',
                    email: userData.email || firebase.auth().currentUser.email,
                    avatar: userData.avatar || 'https://ui-avatars.com/api/?name=User',
                    role: userData.role || 'usuario',
                    permissions: userData.permissions || {},
                    loginTime: new Date().toISOString()
                };
                Storage.set('session', this.session);
                if (this.isLoginPage) {
                    window.location.href = 'dashboard.html';
                } else {
                    this.protectUI();
                }
            } else {
                // FALLBACK: O usuÃ¡rio foi criado manualmente no Firebase Auth, mas nÃ£o existe no Firestore ainda.
                // Vamos criar automaticamente como ADMIN para nÃ£o bloquear o acesso do dono do sistema.
                const userEmail = firebase.auth().currentUser.email;
                const newAdmin = {
                    id: uid,
                    name: 'Administrador Principal',
                    email: userEmail,
                    role: 'admin',
                    status: 'ativo',
                    avatar: 'https://ui-avatars.com/api/?name=Admin&background=random&color=fff',
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString()
                };
                
                await firebase.firestore().collection('users').doc(uid).set(newAdmin);
                
                this.session = {
                    id: uid,
                    name: newAdmin.name,
                    email: newAdmin.email,
                    avatar: newAdmin.avatar,
                    role: newAdmin.role,
                    permissions: {},
                    loginTime: new Date().toISOString()
                };
                Storage.set('session', this.session);
                if (this.isLoginPage) {
                    window.location.href = 'dashboard.html';
                }
            }
        } catch (e) {
            console.error("Erro ao sincronizar sessÃ£o:", e);
            if (e.code === 'permission-denied') {
                if (window.UI) window.UI.showToast('Erro de PermissÃ£o no Banco de Dados. Desbloqueie o Firestore nas Regras.', 'error');
            } else {
                if (window.UI) window.UI.showToast('Erro ao ler banco de dados: ' + e.message, 'error');
            }
            // Destravar o botÃ£o caso falhe
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
        if (userName && this.session) userName.textContent = this.session.name.split(' ')[0];
    }

    logout() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().signOut().then(() => {
                Storage.remove('session');
                window.location.href = 'index.html';
            });
        } else {
            Storage.remove('session');
            window.location.href = 'index.html';
        }
    }

    bindLoginEvents() {
        if (!this.isLoginPage) return;

        Storage.init();

        const loginForm = document.getElementById('loginForm');
        const togglePassword = document.getElementById('togglePassword');
        const emailInput = document.getElementById('email');
        const rememberedEmail = Storage.get('rememberedEmail');

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

    handleLogin(e) {
        e.preventDefault();
        const loginId = document.getElementById('email').value.trim(); // Now strictly email
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        const btn = document.getElementById('loginBtn');

        btn.classList.add('loading');
        btn.disabled = true;

        if (typeof firebase !== 'undefined') {
            firebase.auth().signInWithEmailAndPassword(loginId, password)
                .then((userCredential) => {
                    if (window.UI) window.UI.showToast('Login realizado com sucesso!', 'success');
                    
                    if (rememberMe) {
                        Storage.set('rememberedEmail', loginId);
                    } else {
                        Storage.remove('rememberedEmail');
                    }
                    
                    // The onAuthStateChanged listener will handle redirection
                })
                .catch((error) => {
                    let msg = 'E-mail ou senha incorretos.';
                    if (error.code === 'auth/user-not-found') msg = 'UsuÃ¡rio nÃ£o encontrado.';
                    if (window.UI) window.UI.showToast(msg, 'error');
                    btn.classList.remove('loading');
                    btn.disabled = false;
                });
        } else {
            if (window.UI) window.UI.showToast('Firebase nÃ£o inicializado.', 'error');
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }
}

// Inicializa AutenticaÃ§Ã£o Globalmente
window.Auth = new AuthManager();