$dashboard = Get-Content 'dashboard.html' -Raw
$matches = [regex]::Match($dashboard, '(?s)(<!-- Modal Nova Transação -->.*?</div>\s*</div>)')
if ($matches.Success) {
    $modal = $matches.Groups[1].Value
    $transactions = Get-Content 'transactions.html' -Raw
    $transactions = $transactions -replace '<!-- Toast Notifications Container -->', "$modal`n`n    <!-- Toast Notifications Container -->"
    [System.IO.File]::WriteAllText('transactions.html', $transactions, [System.Text.Encoding]::UTF8)
    Write-Host "Modal injected into transactions.html"
} else {
    Write-Host "Could not find modal in dashboard.html"
}
