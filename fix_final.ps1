$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html | Where-Object { $_.Name -ne 'index.html' }
foreach ($f in $files) {
    $text = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    
    $text = $text -replace 'Lan.amentos', 'Lançamentos'
    $text = $text -replace 'Cart.es', 'Cartões'
    $text = $text -replace 'Relat.rios', 'Relatórios'
    $text = $text -replace 'Usu.rios', 'Usuários'
    $text = $text -replace 'Usu.rio', 'Usuário'
    $text = $text -replace 'Configura..es', 'Configurações'
    $text = $text -replace 'Configura.es', 'Configurações'
    $text = $text -replace 'Vis.o Geral', 'Visão Geral'
    $text = $text -replace 'Gest.o', 'Gestão'
    $text = $text -replace 'Banc.rias', 'Bancárias'
    $text = $text -replace 'An.lises', 'Análises'
    $text = $text -replace 'Gr.ficos', 'Gráficos'
    $text = $text -replace 'Compara..o', 'Comparação'
    $text = $text -replace 'Hist.rica', 'Histórica'
    $text = $text -replace 'Evolu..o', 'Evolução'
    $text = $text -replace 'Patrim.nio', 'Patrimônio'
    $text = $text -replace 'Cr.dito', 'Crédito'
    $text = $text -replace 'Balan.o', 'Balanço'
    $text = $text -replace 'Per.odo', 'Período'
    $text = $text -replace 'Sugest.es', 'Sugestões'
    $text = $text -replace 'A..es', 'Ações'
    $text = $text -replace 'Transa..o', 'Transação'
    $text = $text -replace 'Cart.o', 'Cartão'
    $text = $text -replace 'Receitass', 'Receitas'
    
    [System.IO.File]::WriteAllText($f.FullName, $text, [System.Text.Encoding]::UTF8)
    Write-Host "Fixed $($f.Name)"
}
