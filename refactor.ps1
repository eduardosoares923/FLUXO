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
                <a href="users.html" class="nav-item {5}" data-requires-role="admin">
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
                <div class="header-actions flex-row gap-md" style="display:flex; align-items:center; gap: 1.5rem;">
                    {1}
                    <button id="themeToggle" class="btn" style="background: transparent; color: var(--text-secondary); padding: 0.5rem; border: none; cursor: pointer;">
                        <i class="fa-solid fa-moon"></i>
                    </button>
                    
                    <div class="user-profile" style="position:relative; display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <div class="user-info flex-col align-start" style="text-align: right; display:flex; flex-direction:column;">
                            <div class="user-name" id="userName" style="font-weight: 600; font-size: 0.875rem;">Usuário</div>
                        </div>
                        <div class="user-avatar" style="width:40px;height:40px;border-radius:50%;background:var(--accent-primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;">U</div>
                        <div class="dropdown-menu">
                            <a href="settings.html" class="dropdown-item"><i class="fa-solid fa-user"></i> Meu Perfil</a>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item logout-btn" style="color: var(--danger);"><i class="fa-solid fa-right-from-bracket"></i> Sair</a>
                        </div>
                    </div>
                </div>
            </header>
"@

$titleMap = @{
    'dashboard.html' = 'Visão Geral'
    'transactions.html' = 'Lançamentos Financeiros'
    'cards.html' = 'Gestão de Cartões'
    'accounts.html' = 'Contas Bancárias e Perfis'
    'reports.html' = 'Relatórios Financeiros'
    'users.html' = 'Gestão de Usuários'
    'settings.html' = 'Configurações do Sistema'
}

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw

    if ($content -notmatch 'components.css') {
        $content = $content -replace '<link rel="stylesheet" href="css/style.css">', "<link rel=`"stylesheet`" href=`"css/style.css`">`n    <link rel=`"stylesheet`" href=`"css/components.css`">"
    }

    if ($content -notmatch 'js/ui.js') {
        $content = $content -replace '<script src="js/utils.js"></script>', "<script src=`"js/utils.js`"></script>`n    <script src=`"js/ui.js`"></script>`n    <script src=`"js/auth.js`"></script>"
    }

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
    Write-Host "Updated $($file.Name)"
}
