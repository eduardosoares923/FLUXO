class App {
    constructor() {
        this.checkAuth();
        this.bindEvents();
    }

    checkAuth() {
        const session = window.Storage.get('session');
        if (!session) return; // auth.js já redireciona

        // Patch for old sessions missing role
        if (!session.role && session.id === '1') {
            session.role = 'admin';
            window.Storage.set('session', session);
        }

        // Store globally for other scripts
        window.currentUser = session;

        // Preencher dados do usuário
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (userNameEl) userNameEl.textContent = session.name;
        if (userAvatarEl && session.avatar) userAvatarEl.src = session.avatar;
    }

    bindEvents() {
        // Theme toggle is handled by ui.js

        // Logout Logic
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.UI.confirmDialog('Deseja realmente sair do sistema?', 'Confirmação de Logout', () => {
                    window.Storage.remove('session');
                    window.location.href = 'index.html';
                });
            });
        }

        // Feature flags for unbuilt features
        const profileBtn = document.querySelector('a[href="#profile"]');
        const passwordBtn = document.querySelector('a[href="#password"]');
        
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.app) window.app.showToast('Edição de perfil será implementada em breve.', 'info');
                if (userDropdown) userDropdown.style.display = 'none';
            });
        }
        
        if (passwordBtn) {
            passwordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.app) window.app.showToast('Alteração de senha será implementada em breve.', 'info');
                if (userDropdown) userDropdown.style.display = 'none';
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if(confirm('Deseja realmente sair?')) {
                    window.Storage.remove('session');
                    window.location.href = 'index.html';
                }
            });
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        // Remover após 3 segundos
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
