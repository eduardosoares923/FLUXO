class App {
    constructor() {
        this.checkAuth();
        this.bindEvents();
    }

    checkAuth() {
        const session = window.Storage ? window.Storage.get('session') : null;
        if (!session) return;

        if (!session.role && session.id === '1') {
            session.role = 'admin';
            if (window.Storage) window.Storage.set('session', session);
        }

        window.currentUser = session;

        // Preencher dados do usuário no cabeçalho
        const userNameEl = document.getElementById('userName');
        const userRoleTitleEl = document.getElementById('userRoleTitle');
        const userAvatarEl = document.getElementById('userAvatar');
        
        const roleLabels = {
            'admin': 'Administrador',
            'gerente': 'Gerente',
            'usuario': 'Usuário',
            'visitante': 'Visitante'
        };

        if (userNameEl) userNameEl.textContent = session.name || 'Usuário';
        if (userRoleTitleEl) userRoleTitleEl.textContent = roleLabels[session.role] || 'Usuário';
        if (userAvatarEl) {
            userAvatarEl.src = session.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.name || 'User')}`;
        }
    }

    bindEvents() {
        // Logout Button Listener
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.Auth && typeof window.Auth.logout === 'function') {
                    window.Auth.logout();
                } else {
                    window.Storage.remove('session');
                    window.location.href = 'index.html';
                }
            });
        }

        // Meu Perfil Link Listener
        const myProfileLink = document.getElementById('myProfileLink') || document.querySelector('a[href="#profile"]');
        if (myProfileLink) {
            myProfileLink.addEventListener('click', (e) => {
                e.preventDefault();
                const userDropdown = document.getElementById('userDropdown');
                if (userDropdown) userDropdown.classList.remove('active');
                this.openMyProfileModal();
            });
        }

        // My Profile Form Submit Listener
        const myProfileForm = document.getElementById('myProfileForm');
        if (myProfileForm) {
            myProfileForm.addEventListener('submit', (e) => this.saveMyProfile(e));
        }
    }

    openMyProfileModal() {
        const currentUser = window.currentUser || (window.Storage ? window.Storage.get('session') : null);
        if (!currentUser) return;

        const modal = document.getElementById('myProfileModal');
        if (!modal) return;

        const nameInput = document.getElementById('myProfileNameInput');
        const usernameInput = document.getElementById('myProfileUsernameInput');
        const cpfInput = document.getElementById('myProfileCpfInput');
        const emailInput = document.getElementById('myProfileEmailInput');
        const personInput = document.getElementById('myProfilePersonInput');
        const avatarInput = document.getElementById('myProfileAvatarInput');
        const passwordInput = document.getElementById('myProfilePasswordInput');
        const passwordConfirmInput = document.getElementById('myProfilePasswordConfirmInput');

        if (nameInput) nameInput.value = currentUser.name || '';
        if (usernameInput) usernameInput.value = currentUser.username || (currentUser.email ? currentUser.email.split('@')[0] : '');
        if (cpfInput) cpfInput.value = currentUser.cpf || '';
        if (emailInput) emailInput.value = currentUser.email || '';
        if (personInput) personInput.value = currentUser.person || currentUser.name || 'Eduardo';
        if (avatarInput) avatarInput.value = currentUser.avatar || '';
        if (passwordInput) passwordInput.value = '';
        if (passwordConfirmInput) passwordConfirmInput.value = '';

        const nameHeader = document.getElementById('myProfileNameHeader');
        const roleBadge = document.getElementById('myProfileRoleBadge');
        const avatarPreview = document.getElementById('myProfileAvatarPreview');

        if (nameHeader) nameHeader.textContent = currentUser.name || 'Usuário';
        if (roleBadge) {
            const roleLabels = { 'admin': 'Administrador', 'gerente': 'Gerente', 'usuario': 'Usuário', 'visitante': 'Visitante' };
            roleBadge.textContent = roleLabels[currentUser.role] || 'Usuário';
        }
        if (avatarPreview) {
            avatarPreview.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'User')}`;
        }

        if (window.UI) window.UI.openModal('myProfileModal');
    }

    async saveMyProfile(e) {
        e.preventDefault();

        const currentUser = window.currentUser || (window.Storage ? window.Storage.get('session') : null);
        if (!currentUser) return;

        const name = document.getElementById('myProfileNameInput')?.value.trim();
        const username = document.getElementById('myProfileUsernameInput')?.value.trim().toLowerCase();
        const cpf = document.getElementById('myProfileCpfInput')?.value.trim();
        const email = document.getElementById('myProfileEmailInput')?.value.trim();
        let avatar = document.getElementById('myProfileAvatarInput')?.value.trim();
        const password = document.getElementById('myProfilePasswordInput')?.value;
        const confirmPassword = document.getElementById('myProfilePasswordConfirmInput')?.value;

        if (!name || !username) {
            if (window.UI) window.UI.showToast('Nome e Nome de Usuário são obrigatórios.', 'error');
            return;
        }

        if (password && password !== confirmPassword) {
            if (window.UI) window.UI.showToast('As senhas digitadas não coincidem.', 'error');
            return;
        }

        if (!avatar) {
            avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
        }

        try {
            const users = window.Storage.get('users') || [];
            const userIndex = users.findIndex(u => String(u.id) === String(currentUser.id));

            let userObj = userIndex !== -1 ? users[userIndex] : { ...currentUser };
            userObj.name = name;
            userObj.username = username;
            userObj.cpf = cpf;
            userObj.email = email;
            userObj.avatar = avatar;

            if (password) {
                userObj.password = password;
                if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
                    await firebase.auth().currentUser.updatePassword(password);
                }
            }

            await window.Storage.saveRecord('users', userObj);

            // Update active session
            currentUser.name = name;
            currentUser.username = username;
            currentUser.cpf = cpf;
            currentUser.email = email;
            currentUser.avatar = avatar;

            window.Storage.set('session', currentUser);
            window.currentUser = currentUser;

            this.checkAuth();
            if (window.UI) window.UI.closeModal('myProfileModal');
            if (window.UI) window.UI.showToast('Perfil atualizado com sucesso!', 'success');

            if (window.Audit) {
                window.Audit.log('MY_PROFILE_UPDATE', { userId: currentUser.id, name, username });
            }
        } catch (err) {
            console.error('Erro ao atualizar perfil:', err);
            if (window.UI) window.UI.showToast('Erro ao atualizar perfil: ' + (err.message || 'Tente novamente'), 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    
    // Listener Global para atualização em tempo real do Firebase
    window.addEventListener('fluxo:dataChanged', () => {
        if (window.app) window.app.checkAuth();
    });
});