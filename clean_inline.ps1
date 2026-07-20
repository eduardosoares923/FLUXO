$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    
    # Remove inline style from userDropdown
    $content = $content -replace '<div class="dropdown-menu glass-panel" id="userDropdown" style="[^"]+">', '<div class="dropdown-menu glass-panel" id="userDropdown">'
    
    # Also clean up the header-actions inline style while we are at it, we will add it to dashboard.css
    $content = $content -replace '<div class="header-actions" style="[^"]+">', '<div class="header-actions">'
    
    # Also clean up inline style from themeToggle and userProfileBtn and dropdown items
    $content = $content -replace 'id="themeToggle" class="btn" style="[^"]+"', 'id="themeToggle" class="btn btn-icon"'
    $content = $content -replace 'id="userProfileBtn" style="cursor: pointer;"', 'id="userProfileBtn"'
    $content = $content -replace 'class="dropdown-item" style="[^"]+"', 'class="dropdown-item"'
    
    [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Cleaned up inline styles in $($f.Name)"
}
