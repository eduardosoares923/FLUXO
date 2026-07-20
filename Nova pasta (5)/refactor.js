const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html'); // Skip index.html for layout (it's the login page)

const sidebarTemplate = (currentPage) => `
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <i class="fa-solid fa-wallet"></i> Finance
            </div>
            <nav class="sidebar-nav">
                <a href="dashboard.html" class="nav-item ${currentPage === 'dashboard.html' ? 'active' : ''}">
                    <i class="fa-solid fa-chart-pie"></i> Dashboard
                </a>
                <a href="transactions.html" class="nav-item ${currentPage === 'transactions.html' ? 'active' : ''}">
                    <i class="fa-solid fa-money-bill-transfer"></i> Lançamentos
                </a>
                <a href="cards.html" class="nav-item ${currentPage === 'cards.html' ? 'active' : ''}">
                    <i class="fa-solid fa-credit-card"></i> Cartões
                </a>
                <a href="accounts.html" class="nav-item ${currentPage === 'accounts.html' ? 'active' : ''}">
                    <i class="fa-solid fa-users"></i> Contas & Perfis
                </a>
                <a href="reports.html" class="nav-item ${currentPage === 'reports.html' ? 'active' : ''}">
                    <i class="fa-solid fa-chart-line"></i> Relatórios
                </a>
                <a href="users.html" class="nav-item ${currentPage === 'users.html' ? 'active' : ''}" data-requires-role="admin">
                    <i class="fa-solid fa-user-shield"></i> Usuários
                </a>
                <a href="settings.html" class="nav-item ${currentPage === 'settings.html' ? 'active' : ''}">
                    <i class="fa-solid fa-gear"></i> Configurações
                </a>
            </nav>
        </aside>`;

const headerTemplate = (title, hasNewTransactionBtn) => `
            <!-- Header -->
            <header class="top-header">
                <div class="header-title">${title}</div>
                <div class="header-actions flex-row gap-md">
                    ${hasNewTransactionBtn ? `<button class="btn btn-primary" onclick="window.UI.openModal('newTransactionModal')"><i class="fa-solid fa-plus"></i> Nova Transação</button>` : ''}
                    <button id="themeToggle" class="btn" style="background: transparent; color: var(--text-secondary); padding: 0.5rem;">
                        <i class="fa-solid fa-moon"></i>
                    </button>
                    
                    <div class="user-profile">
                        <div class="user-info flex-col align-start" style="text-align: right;">
                            <div class="user-name" id="userName" style="font-weight: 600; font-size: 0.875rem;">Usuário</div>
                        </div>
                        <div class="user-avatar">U</div>
                        <div class="dropdown-menu">
                            <a href="settings.html" class="dropdown-item"><i class="fa-solid fa-user"></i> Meu Perfil</a>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item logout-btn" style="color: var(--danger);"><i class="fa-solid fa-right-from-bracket"></i> Sair</a>
                        </div>
                    </div>
                </div>
            </header>`;

const titleMap = {
    'dashboard.html': 'Visão Geral',
    'transactions.html': 'Lançamentos Financeiros',
    'cards.html': 'Gestão de Cartões',
    'accounts.html': 'Contas Bancárias e Perfis',
    'reports.html': 'Relatórios Financeiros',
    'users.html': 'Gestão de Usuários',
    'settings.html': 'Configurações do Sistema'
};

htmlFiles.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');

    // 1. Add components.css if not present
    if (!content.includes('components.css')) {
        content = content.replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="css/style.css">\n    <link rel="stylesheet" href="css/components.css">');
    }

    // 2. Add js/ui.js before other scripts
    if (!content.includes('js/ui.js')) {
        content = content.replace('<script src="js/storage.js"></script>', '<script src="js/storage.js"></script>\n    <script src="js/utils.js"></script>\n    <script src="js/ui.js"></script>\n    <script src="js/auth.js"></script>');
    }

    // Clean up multiple includes for utils and auth
    const deduplicateScript = (scriptName) => {
        const regex = new RegExp(`(<script src="js/${scriptName}\\.js"><\\/script>\\s*)+`, 'g');
        content = content.replace(regex, `<script src="js/${scriptName}.js"></script>\n    `);
    };
    deduplicateScript('utils');
    deduplicateScript('auth');

    // 3. Replace Sidebar
    content = content.replace(/<!-- Sidebar -->[\s\S]*?<\/aside>/i, sidebarTemplate(file));

    // 4. Replace Header
    const hasTransaction = file === 'transactions.html';
    content = content.replace(/<!-- Header -->[\s\S]*?<\/header>/i, headerTemplate(titleMap[file], hasTransaction));

    fs.writeFileSync(path.join(dir, file), content);
    console.log(`Updated ${file}`);
});
