$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html
$script = "<script>try { const theme = JSON.parse(localStorage.getItem('fluxoPro_theme')); if (theme) document.documentElement.setAttribute('data-theme', theme); } catch(e){}</script>`n</head>"

foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    if (-not ($content -match 'localStorage\.getItem\(''fluxoPro_theme''\)')) {
        $content = $content -replace '</head>', $script
        [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Injected anti-flicker script into $($f.Name)"
    }
}
