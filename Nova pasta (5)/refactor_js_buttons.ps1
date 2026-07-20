$files = Get-ChildItem -Path "js" -Filter *.js

foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    
    # cards.js / accounts.js - small buttons
    $content = $content -replace '<button class="btn" style="[^"]*background: var\(--accent-primary\)[^"]*"', '<button class="btn btn-primary btn-sm"'
    $content = $content -replace '<button class="btn" style="[^"]*background: rgba\(255,255,255,0\.1\)[^"]*"', '<button class="btn btn-secondary btn-sm"'
    $content = $content -replace '<button class="btn" style="[^"]*background: rgba\(239, 68, 68, 0\.1\)[^"]*"', '<button class="btn btn-danger btn-sm"'
    
    # users.js - ghost buttons
    $content = $content -replace '<button class="btn" style="[^"]*color: var\(--accent-primary\)[^"]*" onclick="window.UsersApp.openEditModal', '<button class="btn btn-ghost primary btn-sm" onclick="window.UsersApp.openEditModal'
    $content = $content -replace '<button class="btn" style="[^"]*color: var\(--danger\)[^"]*" onclick="window.UsersApp.openDeleteModal', '<button class="btn btn-ghost danger btn-sm" onclick="window.UsersApp.openDeleteModal'

    [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Processed JS $($f.Name)"
}
