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
        const btnNovo = document.getElementById('btnNovoPerfil');
        const searchInput = document.getElementById('searchUser');
        const roleSelect = document.getElementById('filterRole');
        const statusSelect = document.getElementById('filterStatus');
        const form = document.getElementById('userForm');

        const refreshUsersHandler = () => {
            this.loadUsers();
            this.renderUsers();
        };
        window.addEventListener('dataUpdated', refreshUsersHandler);
        window.addEventListener('fluxo:dataChanged', refreshUsersHandler);

        if (btnNovo) btnNovo.addEventListener('click', () => this.openNewModal());
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
            const matchesSearch = 
                (u.name && u.name.toLowerCase().includes(searchTerm)) || 
                (u.username && u.username.toLowerCase().includes(searchTerm)) || 
                (u.email && u.email.toLowerCase().includes(searchTerm)) ||
                (u.cpf && u.cpf.includes(searchTerm)) ||
                (u.person && u.person.toLowerCase().includes(searchTerm));

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
                'admin': '<span style="color: #8b5cf6; background: rgba(139, 92, 246, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Administrador</span>',
                'gerente': '<span style="color: #3b82f6; background: rgba(59, 130, 246, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Gerente</span>',
                'usuario': '<span style="color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Usuário</span>',
                'visitante': '<span style="color: #64748b; background: rgba(100, 116, 139, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Visitante</span>'
            };

            const statusLabel = user.status === 'ativo' 
                ? '<span style="color: var(--success); font-weight: 500;"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem; vertical-align: middle;"></i> Ativo</span>' 
                : '<span style="color: var(--danger); font-weight: 500;"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem; vertical-align: middle;"></i> Inativo</span>';

            const lastLoginText = user.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Nunca acessou';
            const avatarSrc = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;

            const roleKey = (user.role && roleLabels[user.role]) ? user.role : 'usuario';
            const roleBadge = roleLabels[roleKey];
            const usernameDisplay = user.username ? `@${user.username}` : (user.email ? user.email.split('@')[0] : 'usuario');
            const personDisplay = user.person || user.name || 'Eduardo';

            htmlBuffer += `
                <tr style="border-bottom: 1px solid var(--glass-border)">
                    <td style="padding: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <img src="${avatarSrc}" alt="${window.Utils.escapeHTML(user.name)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary);">${window.Utils.escapeHTML(user.name)}</div>
                                <div style="font-size: 0.78rem; color: var(--accent-primary);">${window.Utils.escapeHTML(usernameDisplay)} &bull; <i class="fa-solid fa-user-tag" style="font-size: 0.7rem;"></i> ${window.Utils.escapeHTML(personDisplay)}</div>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                        <div>${window.Utils.escapeHTML(user.email || 'Sem e-mail')}</div>
                        ${user.cpf ? `<div style="font-size: 0.75rem; color: var(--text-muted);">CPF: ${window.Utils.escapeHTML(user.cpf)}</div>` : ''}
                    </td>
                    <td style="padding: 1rem;">${roleBadge}</td>
                    <td style="padding: 1rem;">${statusLabel}</td>
                    <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.85rem;">${lastLoginText}</td>
                    <td style="padding: 1rem; text-align: right; white-space: nowrap;">
                        <button class="btn btn-ghost primary btn-sm" onclick="window.UsersApp.openEditModal('${user.id}')" data-action="edit" data-id="${user.id}" title="Editar">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        <button class="btn btn-ghost danger btn-sm" onclick="window.UsersApp.openDeleteModal('${user.id}')" data-action="delete" data-id="${user.id}" title="Excluir">
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
            { id: 'incomes', name: 'Receitas' },
            { id: 'expenses', name: 'Despesas' },
            { id: 'accounts', name: 'Contas Bancárias' },
            { id: 'cards', name: 'Cartões de Crédito' },
            { id: 'persons', name: 'Pessoas' },
            { id: 'reports', name: 'Análises e Relatórios' },
            { id: 'settings', name: 'Configurações' },
            { id: 'users', name: 'Administração / Usuários' }
        ];
    }

    populatePersonOptions(selectedPerson = '') {
        const personSelect = document.getElementById('userPersonInput');
        if (!personSelect) return;

        let personsList = window.Storage.get('persons') || [];
        let personNames = personsList.map(p => p.name.trim());

        if (personNames.length === 0) {
            personNames = ['Eduardo', 'Mãe', 'Rodrigo'];
        }

        if (selectedPerson && !personNames.some(p => p.toLowerCase() === selectedPerson.trim().toLowerCase())) {
            personNames.push(selectedPerson.trim());
        }

        personSelect.innerHTML = '';
        personNames.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p.toLowerCase() === selectedPerson.trim().toLowerCase()) opt.selected = true;
            personSelect.appendChild(opt);
        });
    }

    renderPermissions(permissions = {}) {
        const tbody = document.getElementById('permissionsTableBody');
        if (!tbody) return;
        let html = '';
        this.PERMISSION_MODULES.forEach(mod => {
            const perms = permissions[mod.id] || [];
            html += `<tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-primary); font-size: 0.85rem; min-width: 120px;">
                    ${mod.name}
                </td>
                <td style="text-align: center; padding: 0.4rem 0.25rem;">
                    <label style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="perm-cb" data-module="${mod.id}" value="view" ${perms.includes('view') ? 'checked' : ''}>
                        <span>Ver</span>
                    </label>
                </td>
                <td style="text-align: center; padding: 0.4rem 0.25rem;">
                    <label style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="perm-cb" data-module="${mod.id}" value="create" ${perms.includes('create') ? 'checked' : ''}>
                        <span>Criar</span>
                    </label>
                </td>
                <td style="text-align: center; padding: 0.4rem 0.25rem;">
                    <label style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="perm-cb" data-module="${mod.id}" value="edit" ${perms.includes('edit') ? 'checked' : ''}>
                        <span>Editar</span>
                    </label>
                </td>
                <td style="text-align: center; padding: 0.4rem 0.25rem;">
                    <label style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="perm-cb" data-module="${mod.id}" value="delete" ${perms.includes('delete') ? 'checked' : ''}>
                        <span>Excluir</span>
                    </label>
                </td>
                <td style="text-align: center; padding: 0.4rem 0.25rem;">
                    <label style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="perm-cb" data-module="${mod.id}" value="export" ${perms.includes('export') ? 'checked' : ''}>
                        <span>Exportar</span>
                    </label>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
        
        const roleInput = document.getElementById('userRoleInput');
        const permContainer = document.getElementById('permissionsContainer');
        const togglePerms = () => {
            if (roleInput && permContainer) {
                if (roleInput.value === 'admin') {
                    permContainer.style.display = 'none';
                } else {
                    permContainer.style.display = 'block';
                }
            }
        };
        if (roleInput) {
            roleInput.removeEventListener('change', togglePerms);
            roleInput.addEventListener('change', togglePerms);
            togglePerms();
        }
    }

    openNewModal() {
        this.editingUserId = null;
        const form = document.getElementById('userForm');
        if (form) form.reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'Novo Perfil de Usuário';
        
        this.populatePersonOptions('Eduardo');

        document.getElementById('userPasswordInput').required = true;
        document.getElementById('userPasswordConfirmInput').required = true;
        this.renderPermissions({});
        
        window.UI.openModal('userModal');
    }

    openEditModal(id) {
        this.loadUsers();
        const user = this.users.find(u => String(u.id) === String(id) || String(u.uid) === String(id) || (u.email && u.email.toLowerCase() === String(id).toLowerCase()));
        if (!user) {
            if (window.UI) window.UI.showToast('Usuário não localizado no sistema.', 'error');
            return;
        }
        
        this.editingUserId = user.id;
        const setVal = (elemId, val) => {
            const el = document.getElementById(elemId);
            if (el) el.value = val;
        };

        setVal('userId', user.id);
        setVal('userNameInput', user.name || '');
        setVal('userUsernameInput', user.username || '');
        setVal('userCpfInput', user.cpf || '');
        setVal('userAvatarInput', user.avatar || '');
        setVal('userEmailInput', user.email || '');
        
        this.populatePersonOptions(user.person || user.name || 'Eduardo');

        setVal('userRoleInput', user.role || 'usuario');
        setVal('userStatusInput', user.status || 'ativo');
        setVal('userPasswordInput', '');
        setVal('userPasswordConfirmInput', '');
        
        const pwdInput = document.getElementById('userPasswordInput');
        if (pwdInput) pwdInput.required = false;
        const pwdConfirmInput = document.getElementById('userPasswordConfirmInput');
        if (pwdConfirmInput) pwdConfirmInput.required = false;
        
        const titleEl = document.getElementById('userModalTitle');
        if (titleEl) titleEl.textContent = 'Editar Perfil de Usuário';

        this.renderPermissions(user.permissions || {});
        window.UI.openModal('userModal');
    }

    closeModal() {
        window.UI.closeModal('userModal');
        this.editingUserId = null;
    }

    async saveUser(e) {
        e.preventDefault();
        
        const name = document.getElementById('userNameInput').value.trim();
        const username = document.getElementById('userUsernameInput').value.trim().toLowerCase();
        const cpf = document.getElementById('userCpfInput').value.trim();
        const email = document.getElementById('userEmailInput').value.trim();
        const person = document.getElementById('userPersonInput').value.trim();
        let avatar = document.getElementById('userAvatarInput').value.trim();
        const password = document.getElementById('userPasswordInput').value;
        const confirmPassword = document.getElementById('userPasswordConfirmInput').value;
        const role = document.getElementById('userRoleInput')?.value || 'usuario';
        const status = document.getElementById('userStatusInput')?.value || 'ativo';
        
        // Extract permissions
        const perms = {};
        document.querySelectorAll('.perm-cb:checked').forEach(cb => {
            const mod = cb.getAttribute('data-module');
            if (!perms[mod]) perms[mod] = [];
            perms[mod].push(cb.value);
        });
        
        if (!name || !username || !person) {
            window.UI.showToast('Nome completo, nome de usuário e Pessoa vinculada são obrigatórios.', 'error');
            return;
        }

        if (password && password !== confirmPassword) {
            window.UI.showToast('As senhas não coincidem.', 'error');
            return;
        }

        // Uniqueness checks
        const existingUsername = this.users.find(u => u.username && u.username.toLowerCase() === username && String(u.id) !== String(this.editingUserId));
        if (existingUsername) {
            window.UI.showToast('Já existe um usuário com este Nome de Usuário.', 'error');
            return;
        }

        if (email) {
            const existingEmail = this.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && String(u.id) !== String(this.editingUserId));
            if (existingEmail) {
                window.UI.showToast('Já existe um usuário com este E-mail.', 'error');
                return;
            }
        }

        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf) {
            const existingCpf = this.users.find(u => u.cpf && u.cpf.replace(/\D/g, '') === cleanCpf && String(u.id) !== String(this.editingUserId));
            if (existingCpf) {
                window.UI.showToast('Já existe um usuário com este CPF.', 'error');
                return;
            }
        }
        
        if (!avatar) {
            avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
        }

        const authEmail = email || `${username}@fluxo.app`;

        if (this.editingUserId) {
            // Edit
            const userIndex = this.users.findIndex(u => String(u.id) === String(this.editingUserId));
            if (userIndex !== -1) {
                const user = this.users[userIndex];
                user.name = name;
                user.username = username;
                user.cpf = cpf;
                user.email = email;
                user.person = person;
                user.avatar = avatar;
                if (password) user.password = password; 
                
                if (user.role === 'admin' && user.status === 'ativo' && (role !== 'admin' || status !== 'ativo')) {
                    if (this.isLastActiveAdmin(user.id)) {
                        window.UI.showToast('Você não pode rebaixar ou desativar o último Administrador ativo.', 'error');
                        return;
                    }
                }
                
                user.role = role;
                user.status = status;
                user.permissions = perms;
                
                await window.Storage.saveRecord('users', user);
                if (window.Audit) {
                    window.Audit.log('USER_UPDATE', { userId: user.id, username, role, person, status });
                }
                window.UI.showToast('Perfil atualizado com sucesso.', 'success');
            }
        } else {
            // New user via Secondary Firebase App to prevent current admin logout
            if (typeof firebase !== 'undefined') {
                let secondaryApp;
                try {
                    secondaryApp = firebase.app("Secondary");
                } catch(e) {
                    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
                }
                
                try {
                    const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(authEmail, password);
                    const newUser = {
                        id: userCred.user.uid,
                        name,
                        username,
                        cpf,
                        email,
                        authEmail,
                        person,
                        avatar,
                        role,
                        status,
                        permissions: perms,
                        createdAt: new Date().toISOString(),
                        lastLogin: null
                    };
                    
                    await window.Storage.saveRecord('users', newUser);
                    if (window.Audit) {
                        window.Audit.log('USER_CREATE', { userId: newUser.id, username, person, role });
                    }
                    window.UI.showToast('Novo usuário criado com sucesso.', 'success');
                    secondaryApp.auth().signOut();
                } catch(error) {
                    let msg = 'Erro ao criar usuário.';
                    if (error.code === 'auth/email-already-in-use') msg = 'Este usuário/e-mail já está em uso.';
                    if (error.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
                    window.UI.showToast(msg, 'error');
                    return;
                }
            }
        }
        
        // Update local session if editing self
        if (String(this.editingUserId) === String(window.currentUser?.id)) {
            const updatedUser = this.users.find(u => String(u.id) === String(this.editingUserId));
            if (updatedUser) {
                window.currentUser.name = updatedUser.name;
                window.currentUser.avatar = updatedUser.avatar;
                window.currentUser.role = updatedUser.role;
                window.currentUser.person = updatedUser.person;
                window.Storage.set('session', window.currentUser);
                if (window.app) window.app.checkAuth();
            }
        }

        this.loadUsers();
        this.renderUsers();
        this.closeModal();
    }

    openDeleteModal(id) {
        if (String(id) === String(window.currentUser?.id)) {
            window.UI.showToast('Você não pode excluir sua própria conta por aqui.', 'error');
            return;
        }

        this.loadUsers();
        const user = this.users.find(u => String(u.id) === String(id));
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
        
        const linkedTransactions = transactions.filter(tx => String(tx.userId) === String(user.id));
        const warningEl = document.getElementById('deleteUserWarning');
        const countEl = document.getElementById('deleteUserTxCount');
        const optionsEl = document.getElementById('deleteUserOptions');
        const selectEl = document.getElementById('deleteUserTransferSelect');
        const radioDelete = document.getElementById('actionDeleteUserTx');
        
        if (linkedTransactions.length > 0) {
            countEl.textContent = linkedTransactions.length;
            warningEl.style.display = 'block';
            optionsEl.style.display = 'block';
            radioDelete.checked = true;
            selectEl.style.display = 'none';
            
            selectEl.innerHTML = '';
            this.users.filter(u => String(u.id) !== String(id)).forEach(u => {
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
        const user = this.users.find(u => String(u.id) === String(id));
        if (!user) return;

        if (window.Audit) {
            window.Audit.log('USER_DELETE', { userId: user.id, name: user.name, username: user.username });
        }

        const transactions = window.Storage.get('transactions') || [];
        const accounts = window.Storage.get('accounts') || [];
        const cards = window.Storage.get('cards') || [];
        const linkedTransactions = transactions.filter(tx => String(tx.userId) === String(user.id));

        if (linkedTransactions.length > 0) {
            const action = document.querySelector('input[name="deleteUserAction"]:checked')?.value;
            if (action === 'delete') {
                linkedTransactions.forEach(tx => window.Storage.deleteRecord('transactions', tx.id));
            } else if (action === 'transfer') {
                const targetUserId = document.getElementById('deleteUserTransferSelect').value;
                const targetUser = this.users.find(u => String(u.id) === String(targetUserId));
                if (targetUser) {
                    transactions.forEach(tx => {
                        if (String(tx.userId) === String(user.id)) {
                            tx.userId = targetUserId;
                            tx.person = targetUser.person || targetUser.name;
                            window.Storage.saveRecord('transactions', tx);
                        }
                    });
                }
            }
        }

        this.users = this.users.filter(u => String(u.id) !== String(id));
        window.Storage.deleteRecord('users', id);
        
        window.UI.closeModal('deleteUserModal');
        this.renderUsers();
        window.UI.showToast('Perfil excluído com sucesso.', 'success');
    }

    isLastActiveAdmin(excludeId) {
        const activeAdmins = this.users.filter(u => u.role === 'admin' && u.status === 'ativo' && String(u.id) !== String(excludeId));
        return activeAdmins.length === 0;
    }
}

function initUsersApp() {
    if (!window.UsersApp && window.Auth) {
        window.UsersApp = new UsersApp();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initUsersApp, 50));
} else {
    setTimeout(initUsersApp, 50);
}
