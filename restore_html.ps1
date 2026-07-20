$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html | Where-Object { $_.Name -ne 'index.html' }

$sidebarTemplate = @"
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <i class="fa-solid fa-wallet"></i> Finance
            </div>
            <nav class="sidebar-nav">
                <a href="dashboard.html" class="nav-item {0}">
                    <i class="fa-solid fa-chart-pie"></i> Dashboard
                </a>
                <a href="transactions.html" class="nav-item {1}">
                    <i class="fa-solid fa-money-bill-transfer"></i> Lançamentos
                </a>
                <a href="cards.html" class="nav-item {2}">
                    <i class="fa-solid fa-credit-card"></i> Cartões
                </a>
                <a href="accounts.html" class="nav-item {3}">
                    <i class="fa-solid fa-users"></i> Contas & Perfis
                </a>
                <a href="reports.html" class="nav-item {4}">
                    <i class="fa-solid fa-chart-line"></i> Relatórios
                </a>
                <a href="users.html" class="nav-item {5}" id="navUsers" data-requires-role="admin">
                    <i class="fa-solid fa-user-shield"></i> Usuários
                </a>
                <a href="settings.html" class="nav-item {6}">
                    <i class="fa-solid fa-gear"></i> Configurações
                </a>
            </nav>
        </aside>
"@

$headerTemplate = @"
            <!-- Header -->
            <header class="top-header">
                <div class="header-title">{0}</div>
                <div class="header-actions" style="display: flex; gap: 1rem; align-items: center;">
                    {1}
                    <button id="themeToggle" class="btn" style="background: transparent; color: var(--text-secondary); padding: 0.5rem;">
                        <i class="fa-solid fa-moon"></i>
                    </button>
                    
                    <div class="user-profile-dropdown" style="position: relative;">
                        <div class="user-profile" id="userProfileBtn" style="cursor: pointer;">
                            <div class="user-info">
                                <div class="user-name" id="userName">Usuário</div>
                                <div class="user-role" id="userRoleTitle">Administrador</div>
                            </div>
                            <img src="" alt="Avatar" class="user-avatar" id="userAvatar">
                        </div>
                        <div class="dropdown-menu glass-panel" id="userDropdown" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 0.5rem; min-width: 200px; z-index: 100; flex-direction: column;">
                            <a href="#profile" class="dropdown-item" style="padding: 0.75rem 1rem; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--glass-border);"><i class="fa-solid fa-user"></i> Meu Perfil</a>
                            <a href="#password" class="dropdown-item" style="padding: 0.75rem 1rem; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--glass-border);"><i class="fa-solid fa-key"></i> Alterar Senha</a>
                            <a href="#" id="logoutBtn" class="dropdown-item" style="padding: 0.75rem 1rem; color: var(--danger); text-decoration: none;"><i class="fa-solid fa-right-from-bracket"></i> Sair</a>
                        </div>
                    </div>
                </div>
            </header>
"@

$titleMap = @{
    'dashboard.html' = 'Visão Geral'
    'transactions.html' = 'Todos os Lançamentos'
    'cards.html' = 'Gestão de Cartões'
    'accounts.html' = 'Minhas Contas'
    'reports.html' = 'Análises e Gráficos'
    'users.html' = 'Gerenciar Usuários'
    'settings.html' = 'Configurações'
}

foreach ($file in $files) {
    # Using UTF8 explicitly
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    $c0 = if ($file.Name -eq 'dashboard.html') { 'active' } else { '' }
    $c1 = if ($file.Name -eq 'transactions.html') { 'active' } else { '' }
    $c2 = if ($file.Name -eq 'cards.html') { 'active' } else { '' }
    $c3 = if ($file.Name -eq 'accounts.html') { 'active' } else { '' }
    $c4 = if ($file.Name -eq 'reports.html') { 'active' } else { '' }
    $c5 = if ($file.Name -eq 'users.html') { 'active' } else { '' }
    $c6 = if ($file.Name -eq 'settings.html') { 'active' } else { '' }
    
    $sidebar = $sidebarTemplate -f $c0, $c1, $c2, $c3, $c4, $c5, $c6
    $content = $content -replace '(?s)<!-- Sidebar -->.*?</aside>', $sidebar

    $title = $titleMap[$file.Name]
    $btn = if ($file.Name -eq 'transactions.html') { '<button class="btn btn-primary" onclick="window.UI.openModal(''newTransactionModal'')"><i class="fa-solid fa-plus"></i> Nova Transação</button>' } else { '' }
    $header = $headerTemplate -f $title, $btn
    $content = $content -replace '(?s)<!-- Header -->.*?</header>', $header

    Set-Content -Path $file.FullName -Value $content -Encoding UTF8
    Write-Host "Restored layout for $($file.Name)"
}
