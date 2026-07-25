// auth.js

class AuthManager {
    constructor() {
        this.session = Storage.get('session');
        this.isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');
        
        this.verifySession();
        this.bindLoginEvents();
        this.protectUI();
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

        // Modulos de legado que ainda nÃ£o foram convertidos na UI
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
        
        // Esconder elementos protegidos que precisam de role superior
        document.querySelectorAll('[data-requires-role]').forEach(el => {
            const requiredRole = el.getAttribute('data-requires-role');
            if (!this.hasPermission(requiredRole)) {
                el.style.display = 'none';
            }
        });

        // Configurar botões de logout globais
        document.querySelectorAll('.logout-btn, #logoutBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
        
        // Atualizar Nome/Avatar no cabeçalho se existir
        const userName = document.getElementById('userName');
        if (userName && this.session) userName.textContent = this.session.name.split(' ')[0];
    }

    logout() {
        Storage.remove('session');
        window.location.href = 'index.html';
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
        const loginId = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        const btn = document.getElementById('loginBtn');

        btn.classList.add('loading');
        btn.disabled = true;

        setTimeout(() => {
            const users = Storage.get('users') || [];
            const user = users.find(u => 
                (
                    (u.email && u.email.toLowerCase() === loginId) || 
                    (u.name && u.name.toLowerCase() === loginId) || 
                    (u.cpf && u.cpf === loginId)
                ) && 
                u.password === password
            );

            if (user) {
                if (window.UI) window.UI.showToast('Login realizado com sucesso!', 'success');
                
                user.lastLogin = new Date().toISOString();
                const userIndex = users.findIndex(u => u.id === user.id);
                if (userIndex !== -1) {
                    users[userIndex] = user;
                    Storage.set('users', users);
                }

                Storage.set('session', {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    role: user.role || 'usuario',
                    permissions: user.permissions || {},
                    loginTime: new Date().toISOString()
                });

                if (rememberMe) {
                    Storage.set('rememberedEmail', loginId);
                } else {
                    Storage.remove('rememberedEmail');
                }

                setTimeout(() => window.location.href = 'dashboard.html', 800);
            } else {
                if (window.UI) window.UI.showToast('E-mail ou senha incorretos.', 'error');
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }, 800);
    }
}

// Inicializa Autenticação Globalmente
window.Auth = new AuthManager();
