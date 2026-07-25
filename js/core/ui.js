class UIManager {
    constructor() {
        this.initDropdowns();
        this.initModals();
        this.initThemeToggle();
        this.createToastContainer();
    }

    createToastContainer() {
        if (!document.getElementById('toastContainer')) {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        
        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        // Trigger reflow for animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            
            // Auto clear forms inside modal
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }

    initModals() {
        // Auto bind close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) this.closeModal(modal.id);
            });
        });

        // Close on background click
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal.id);
            });
        });
    }

    initDropdowns() {
        // Handle User Profile Dropdown globally
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            userProfile.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = userProfile.nextElementSibling;
                if (menu && menu.classList.contains('dropdown-menu')) {
                    // Close others first (if any)
                    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
                        if (m !== menu) m.classList.remove('active');
                    });
                    menu.classList.toggle('active');
                }
            });

            // Close when clicking outside
            document.addEventListener('click', () => {
                document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
            });
        }
    }

    initThemeToggle() {
        const toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        const currentTheme = Storage.get('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        this.updateThemeIcon(toggle, currentTheme);

        toggle.addEventListener('click', () => {
            const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            Storage.set('theme', theme);
            this.updateThemeIcon(toggle, theme);
        });
    }

    updateThemeIcon(btn, theme) {
        if (!btn) return;
        btn.innerHTML = theme === 'dark' 
            ? '<i class="fa-solid fa-sun"></i>' 
            : '<i class="fa-solid fa-moon"></i>';
    }

    confirmDialog(message, title = 'Confirmação', callback) {
        // Reusable confirm dialog injected in DOM
        let modal = document.getElementById('globalConfirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'globalConfirmModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="globalConfirmTitle">${title}</h2>
                        <button type="button" class="close-modal"><i class="fa-solid fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <p id="globalConfirmMessage" style="margin-bottom: 2rem;">${message}</p>
                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary" id="globalConfirmCancel">Cancelar</button>
                            <button type="button" class="btn btn-primary" id="globalConfirmOk" style="background-color: var(--danger);">Confirmar</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('.close-modal').addEventListener('click', () => this.closeModal('globalConfirmModal'));
            modal.querySelector('#globalConfirmCancel').addEventListener('click', () => this.closeModal('globalConfirmModal'));
        }

        document.getElementById('globalConfirmTitle').textContent = title;
        document.getElementById('globalConfirmMessage').textContent = message;
        
        const okBtn = document.getElementById('globalConfirmOk');
        // Clear previous listeners
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        newOkBtn.addEventListener('click', () => {
            this.closeModal('globalConfirmModal');
            if (typeof callback === 'function') callback();
        });

        this.openModal('globalConfirmModal');
    }
}

// Inicializar globalmente
window.UI = new UIManager();
