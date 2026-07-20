class UsersApp {
    constructor() {
        this.users = [];
        this.editingUserId = null;
        
        // Ensure user is admin to see this page
        if (!window.Auth.hasPermission('manage_users')) {
            window.location.href = 'dashboard.html';
            return;
        }

        this.init();
        this.bindEvents();
    }

    init() {
        this.loadUsers();
        this.renderUsers();
    }

    loadUsers() {
        this.users = window.Storage.get('users') || [];
    }

    bindEvents() {
        const searchInput = document.getElementById('searchUser');
        const roleSelect = document.getElementById('filterRole');
        const statusSelect = document.getElementById('filterStatus');
        const form = document.getElementById('userForm');

        if (searchInput) searchInput.addEventListener('input', () => this.renderUsers());
        if (roleSelect) roleSelect.addEventListener('change', () => this.renderUsers());
        if (statusSelect) statusSelect.addEventListener('change', () => this.renderUsers());
        
        if (form) form.addEventListener('submit', (e) => this.saveUser(e));
        
        // Delete Modal Events
        const closeDeleteBtn = document.getElementById('closeDeleteUserModalBtn');
        const cancelDeleteBtn = document.getElementById('cancelDeleteUserBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteUserBtn');
        
        const closeDeleteModal = () => {
            window.UI.closeModal('deleteUserModal');
        };
        
        if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteModal);
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => this.confirmDeleteUser());
        
        const actionRadios = document.querySelectorAll('input[name="deleteUserAction"]');
        const transferSelect = document.getElementById('deleteUserTransferSelect');
        if (actionRadios && transferSelect) {
            actionRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    transferSelect.style.display = e.target.value === 'transfer' ? 'block' : 'none';
                });
            });
        }
        
        // Event Delegation for Table Actions
        const tbody = document.getElementById('usersTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                
                if (action === 'edit') this.openEditModal(id);
                if (action === 'delete') this.openDeleteModal(id);
            });
        }
    }

    renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        const searchTerm = (document.getElementById('searchUser')?.value || '').toLowerCase();
        const roleFilter = document.getElementById('filterRole')?.value || 'all';
        const statusFilter = document.getElementById('filterStatus')?.value || 'all';

        let filtered = this.users.filter(u => {
            const matchesSearch = u.name.toLowerCase().includes(searchTerm) || u.email.toLowerCase().includes(searchTerm);
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;
            const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
            return matchesSearch && matchesRole && matchesStatus;
        });

        tbody.innerHTML = '';
        
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum usuário encontrado.</td></tr>`;
            return;
        }

        let htmlBuffer = '';

        filtered.forEach(user => {
            const roleLabels = {
                'admin': '<span style="color: #8b5cf6; background: rgba(139, 92, 246, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Administrador</span>',
                'gerente': '<span style="color: #3b82f6; background: rgba(59, 130, 246, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Gerente</span>',
                'usuario': '<span style="color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Usuário</span>',
                'visitante': '<span style="color: #64748b; background: rgba(100, 116, 139, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Visitante</span>'
            };

            const statusLabel = user.status === 'ativo' 
                ? '<span style="color: var(--success);"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem; vertical-align: middle;"></i> Ativo</span>' 
                : '<span style="color: var(--danger);"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem; vertical-align: middle;"></i> Inativo</span>';

            const lastLoginText = user.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Nunca acessou';
            const avatarSrc = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;

            htmlBuffer += `
                <tr style="border-bottom: 1px solid var(--glass-border)">
                    <td style="padding: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <img src="${avatarSrc}" alt="${window.Utils.escapeHTML(user.name)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary);">${window.Utils.escapeHTML(user.name)}</div>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${window.Utils.escapeHTML(user.email)}</td>
                    <td style="padding: 1rem;">${roleLabels[user.role || 'usuario']}</td>
                    <td style="padding: 1rem;">${statusLabel}</td>
                    <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.9rem;">${lastLoginText}</td>
                    <td style="padding: 1rem; text-align: right;">
                        <button class="btn btn-ghost primary btn-sm" data-action="edit" data-id="${user.id}" title="Editar">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-ghost danger btn-sm" data-action="delete" data-id="${user.id}" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = htmlBuffer;
    }

    openNewModal() {
        this.editingUserId = null;
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'Novo Perfil';
        
        // Password is required for new user
        document.getElementById('userPasswordInput').required = true;
        document.getElementById('userPasswordConfirmInput').required = true;
        
        window.UI.openModal('userModal');
    }

    openEditModal(id) {
        const user = this.users.find(u => u.id === id);
        if (!user) return;
        
        this.editingUserId = id;
        document.getElementById('userId').value = user.id;
        document.getElementById('userNameInput').value = user.name || '';
        document.getElementById('userAvatarInput').value = user.avatar || '';
        document.getElementById('userEmailInput').value = user.email || '';
        document.getElementById('userRoleInput').value = user.role || 'usuario';
        document.getElementById('userStatusInput').value = user.status || 'ativo';
        document.getElementById('userNotesInput').value = user.notes || '';
        
        document.getElementById('userPasswordInput').value = '';
        document.getElementById('userPasswordConfirmInput').value = '';
        
        // Password is not required when editing
        document.getElementById('userPasswordInput').required = false;
        document.getElementById('userPasswordConfirmInput').required = false;
        
        document.getElementById('userModalTitle').textContent = 'Editar Perfil';
        window.UI.openModal('userModal');
    }

    closeModal() {
        window.UI.closeModal('userModal');
        this.editingUserId = null;
    }

    saveUser(e) {
        e.preventDefault();
        
        const name = document.getElementById('userNameInput').value.trim();
        const email = document.getElementById('userEmailInput').value.trim();
        let avatar = document.getElementById('userAvatarInput').value.trim();
        const password = document.getElementById('userPasswordInput').value;
        const confirmPassword = document.getElementById('userPasswordConfirmInput').value;
        const role = document.getElementById('userRoleInput').value;
        const status = document.getElementById('userStatusInput').value;
        const notes = document.getElementById('userNotesInput').value.trim();
        
        if (!name || !email) {
            window.UI.showToast('Nome e e-mail são obrigatórios.', 'error');
            return;
        }

        if (password && password !== confirmPassword) {
            window.UI.showToast('As senhas não coincidem.', 'error');
            return;
        }

        // Verifica email duplicado
        const existingEmail = this.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== this.editingUserId);
        if (existingEmail) {
            window.UI.showToast('Já existe um usuário com este e-mail.', 'error');
            return;
        }
        
        if (!avatar) {
            avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
        }

        if (this.editingUserId) {
            // Edit
            const userIndex = this.users.findIndex(u => u.id === this.editingUserId);
            if (userIndex !== -1) {
                const user = this.users[userIndex];
                user.name = name;
                user.email = email;
                user.avatar = avatar;
                if (password) user.password = password; // Only update if typed
                
                // Prevenir mudança de status/cargo do próprio usuário se ele for o único admin ativo
                if (user.role === 'admin' && user.status === 'ativo' && (role !== 'admin' || status !== 'ativo')) {
                    if (this.isLastActiveAdmin(user.id)) {
                        window.UI.showToast('Você não pode rebaixar ou desativar o último Administrador ativo.', 'error');
                        return;
                    }
                }
                
                user.role = role;
                user.status = status;
                user.notes = notes;
                
                this.users[userIndex] = user;
                window.UI.showToast('Perfil atualizado com sucesso.', 'success');
            }
        } else {
            // New
            const newUser = {
                id: window.Utils.generateId(),
                name,
                email,
                password,
                avatar,
                role,
                status,
                notes,
                createdAt: new Date().toISOString(),
                lastLogin: null
            };
            this.users.push(newUser);
            window.UI.showToast('Novo perfil criado com sucesso.', 'success');
        }

        window.Storage.set('users', this.users);
        
        // Se editou a si mesmo, atualiza a sessão local e header
        if (this.editingUserId === window.currentUser.id) {
            const updatedUser = this.users.find(u => u.id === this.editingUserId);
            window.currentUser.name = updatedUser.name;
            window.currentUser.avatar = updatedUser.avatar;
            window.currentUser.role = updatedUser.role;
            window.Storage.set('session', window.currentUser);
            window.app.checkAuth(); // To re-render avatar and name in top header
        }

        this.renderUsers();
        this.closeModal();
    }

    openDeleteModal(id) {
        if (id === window.currentUser.id) {
            window.UI.showToast('Você não pode excluir sua própria conta por aqui.', 'error');
            return;
        }

        const user = this.users.find(u => u.id === id);
        if (!user) return;
        
        if (user.role === 'admin' && user.status === 'ativo') {
            if (this.isLastActiveAdmin(id)) {
                window.UI.showToast('Não é possível excluir o último Administrador ativo do sistema.', 'error');
                return;
            }
        }

        document.getElementById('deleteUserIdInput').value = user.id;
        document.getElementById('deleteUserName').textContent = user.name;
        
        const transactions = window.Storage.get('transactions') || [];
        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        
        const linkedTransactions = transactions.filter(tx => tx.userId === user.id);
        const linkedAccounts = accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase());
        const linkedCards = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase());
        
        const warningEl = document.getElementById('deleteUserWarning');
        const countEl = document.getElementById('deleteUserTxCount');
        const optionsEl = document.getElementById('deleteUserOptions');
        const selectEl = document.getElementById('deleteUserTransferSelect');
        const radioDelete = document.getElementById('actionDeleteUserTx');
        
        const totalLinks = linkedTransactions.length + linkedAccounts.length + linkedCards.length;
        
        if (totalLinks > 0) {
            countEl.textContent = `${linkedTransactions.length} transações, ${linkedAccounts.length} contas e ${linkedCards.length} cartões`;
            warningEl.style.display = 'block';
            optionsEl.style.display = 'block';
            radioDelete.checked = true;
            selectEl.style.display = 'none';
            
            // Populate transfer options
            selectEl.innerHTML = '';
            this.users.filter(u => u.id !== id).forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.name;
                selectEl.appendChild(opt);
            });
        } else {
            warningEl.style.display = 'none';
            optionsEl.style.display = 'none';
        }
        
        window.UI.openModal('deleteUserModal');
    }

    confirmDeleteUser() {
        const id = document.getElementById('deleteUserIdInput').value;
        const user = this.users.find(u => u.id === id);
        if (!user) return;
        
        const transactions = window.Storage.get('transactions') || [];
        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        
        const linkedTransactions = transactions.filter(tx => tx.userId === user.id);
        const linkedAccounts = accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase());
        const linkedCards = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase());
        
        if (linkedTransactions.length > 0 || linkedAccounts.length > 0 || linkedCards.length > 0) {
            const action = document.querySelector('input[name="deleteUserAction"]:checked').value;
            if (action === 'delete') {
                const newTransactions = transactions.filter(tx => tx.userId !== user.id);
                window.Storage.set('transactions', newTransactions);
                
                const newAccounts = accounts.filter(a => !(a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase()));
                window.Storage.set('accounts', newAccounts);
                
                const newCards = cards.filter(c => !(c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase()));
                window.Storage.set('cards', newCards);
                
            } else if (action === 'transfer') {
                const targetUserId = document.getElementById('deleteUserTransferSelect').value;
                const targetUser = this.users.find(u => u.id === targetUserId);
                
                transactions.forEach(tx => {
                    if (tx.userId === user.id) {
                        tx.userId = targetUserId;
                        tx.person = targetUser.name;
                    }
                });
                window.Storage.set('transactions', transactions);
                
                accounts.forEach(a => {
                    if (a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase()) {
                        a.owner = targetUser.name;
                    }
                });
                window.Storage.set('accounts', accounts);
                
                cards.forEach(c => {
                    if (c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase()) {
                        c.holder = targetUser.name;
                    }
                });
                window.Storage.set('cards', cards);
            }
        }

        this.users = this.users.filter(u => u.id !== id);
        window.Storage.set('users', this.users);
        
        window.UI.closeModal('deleteUserModal');
        this.renderUsers();
        window.UI.showToast('Perfil excluído com sucesso.', 'success');
    }

    isLastActiveAdmin(excludeId) {
        const activeAdmins = this.users.filter(u => u.role === 'admin' && u.status === 'ativo' && u.id !== excludeId);
        return activeAdmins.length === 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Wait for app.js to initialize window.app and auth
    setTimeout(() => {
        window.UsersApp = new UsersApp();
    }, 100);
});
