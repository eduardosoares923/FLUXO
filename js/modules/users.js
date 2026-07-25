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

            const roleKey = (user.role && roleLabels[user.role]) ? user.role : 'usuario';
            const roleBadge = roleLabels[roleKey];

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
                    <td style="padding: 1rem;">${roleBadge}</td>
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

    get PERMISSION_MODULES() {
        return [
            { id: 'dashboard', name: 'Dashboard' },
            { id: 'finance', name: 'Fluxo de Caixa' },
            { id: 'transactions', name: 'Lançamentos' },
            { id: 'accounts', name: 'Contas Bancárias' },
            { id: 'cards', name: 'Cartões' },
            { id: 'categories', name: 'Categorias' },
            { id: 'reports', name: 'Análises e Relatórios' },
            { id: 'settings', name: 'Configurações' },
            { id: 'users', name: 'Cadastro de Usuários' }
        ];
    }

    renderPermissions(permissions = {}) {
        const tbody = document.getElementById('permissionsTableBody');
        if (!tbody) return;
        let html = '';
        this.PERMISSION_MODULES.forEach(mod => {
            const perms = permissions[mod.id] || [];
            html += `<tr>
                <td style='padding: 0.5rem;'>${mod.name}</td>
                <td style='text-align: center; padding: 0.5rem;'><input type='checkbox' class='perm-cb' data-module='${mod.id}' value='view' ${perms.includes('view') ? 'checked' : ''}></td>
                <td style='text-align: center; padding: 0.5rem;'><input type='checkbox' class='perm-cb' data-module='${mod.id}' value='create' ${perms.includes('create') ? 'checked' : ''}></td>
                <td style='text-align: center; padding: 0.5rem;'><input type='checkbox' class='perm-cb' data-module='${mod.id}' value='edit' ${perms.includes('edit') ? 'checked' : ''}></td>
                <td style='text-align: center; padding: 0.5rem;'><input type='checkbox' class='perm-cb' data-module='${mod.id}' value='delete' ${perms.includes('delete') ? 'checked' : ''}></td>
            </tr>`;
        });
        tbody.innerHTML = html;
        
        // Hide permissions container if user role is admin (they have full access anyway)
        const roleInput = document.getElementById('userRoleInput');
        const permContainer = document.getElementById('permissionsContainer');
        const togglePerms = () => {
            if(roleInput.value === 'admin') {
                permContainer.style.display = 'none';
            } else {
                permContainer.style.display = 'block';
            }
        };
        roleInput.removeEventListener('change', togglePerms);
        roleInput.addEventListener('change', togglePerms);
        togglePerms();
    }

    openNewModal() {
        this.editingUserId = null;
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'Novo Perfil';
        
        // Password is required for new user
        document.getElementById('userPasswordInput').required = true;
        document.getElementById('userPasswordConfirmInput').required = true;
        this.renderPermissions({});
        
        window.UI.openModal('userModal');
    }

    openEditModal(id) {
        const user = this.users.find(u => u.id === id);
        if (!user) return;
        
        this.editingUserId = id;
        document.getElementById('userId').value = user.id;
        document.getElementById('userNameInput').value = user.name || '';
        document.getElementById('userCpfInput').value = user.cpf || '';
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
        this.renderPermissions(user.permissions || {});
        window.UI.openModal('userModal');
    }

    closeModal() {
        window.UI.closeModal('userModal');
        this.editingUserId = null;
    }

    saveUser(e) {
        e.preventDefault();
        
        const name = document.getElementById('userNameInput').value.trim();
        const cpf = document.getElementById('userCpfInput').value.trim();
        const email = document.getElementById('userEmailInput').value.trim();
        let avatar = document.getElementById('userAvatarInput').value.trim();
        const password = document.getElementById('userPasswordInput').value;
        const confirmPassword = document.getElementById('userPasswordConfirmInput').value;
        const role = (document.getElementById('userRoleInput')?.value) || 'usuario';
        const status = (document.getElementById('userStatusInput')?.value) || 'ativo';
                const notes = document.getElementById('userNotesInput').value.trim();
        
        // Extract permissions
        const perms = {};
        document.querySelectorAll('.perm-cb:checked').forEach(cb => {
            const mod = cb.getAttribute('data-module');
            if(!perms[mod]) perms[mod] = [];
            perms[mod].push(cb.value);
        });
        
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
                user.cpf = cpf;
                user.email = email;
                user.avatar = avatar;
                if (password) user.password = password; 
                
                if (user.role === 'admin' && user.status === 'ativo' && (role !== 'admin' || status !== 'ativo')) {
                    if (this.isLastActiveAdmin(user.id)) {
                        window.UI.showToast('VocÃª nÃ£o pode rebaixar ou desativar o Ãºltimo Administrador ativo.', 'error');
                        return;
                    }
                }
                
                user.role = role;
                user.status = status;
                user.notes = notes;
                user.permissions = perms;
                
                window.Storage.saveRecord('users', user).then(() => {
                    window.UI.showToast('Perfil atualizado com sucesso.', 'success');
                    this.renderUsers();
                });
            }
        } else {
            // New user via Secondary Firebase App to prevent logout
            if (typeof firebase !== 'undefined') {
                let secondaryApp;
                try {
                    secondaryApp = firebase.app("Secondary");
                } catch(e) {
                    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
                }
                
                secondaryApp.auth().createUserWithEmailAndPassword(email, password)
                    .then((userCred) => {
                        const newUser = {
                            id: userCred.user.uid,
                            name,
                            cpf,
                            email,
                            password,
                            avatar,
                            role,
                            status,
                            notes,
                            permissions: perms, // Fix: pass permissions correctly
                            createdAt: new Date().toISOString(),
                            lastLogin: null
                        };
                        window.Storage.saveRecord('users', newUser).then(() => {
                            window.UI.showToast('Novo perfil criado com sucesso.', 'success');
                            this.renderUsers();
                            secondaryApp.auth().signOut();
                        });
                    })
                    .catch((error) => {
                        let msg = 'Erro ao criar usuÃ¡rio.';
                        if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail jÃ¡ estÃ¡ em uso.';
                        if (error.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
                        window.UI.showToast(msg, 'error');
                    });
            }
        }
        
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
                const txToDelete = transactions.filter(tx => tx.userId === user.id);
                txToDelete.forEach(tx => window.Storage.deleteRecord('transactions', tx.id));
                
                const accToDelete = accounts.filter(a => a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase());
                accToDelete.forEach(a => window.Storage.deleteRecord('accounts', a.id));
                
                const cardsToDelete = cards.filter(c => c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase());
                cardsToDelete.forEach(c => window.Storage.deleteRecord('cards', c.id));
                
            } else if (action === 'transfer') {
                const targetUserId = document.getElementById('deleteUserTransferSelect').value;
                const targetUser = this.users.find(u => u.id === targetUserId);
                
                transactions.forEach(tx => {
                    if (tx.userId === user.id) {
                        tx.userId = targetUserId;
                        tx.person = targetUser.name;
                        window.Storage.saveRecord('transactions', tx);
                    }
                });
                
                accounts.forEach(a => {
                    if (a.owner && a.owner.trim().toLowerCase() === user.name.trim().toLowerCase()) {
                        a.owner = targetUser.name;
                        window.Storage.saveRecord('accounts', a);
                    }
                });
                
                cards.forEach(c => {
                    if (c.holder && c.holder.trim().toLowerCase() === user.name.trim().toLowerCase()) {
                        c.holder = targetUser.name;
                        window.Storage.saveRecord('cards', c);
                    }
                });
            }
        }

        this.users = this.users.filter(u => u.id !== id);
        window.Storage.deleteRecord('users', id);
        
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
