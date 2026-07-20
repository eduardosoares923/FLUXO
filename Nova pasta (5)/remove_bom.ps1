$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    if ($content -match '^\?') {
        $content = $content -replace '^\?', ''
        [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Removed stray ? from $($f.Name)"
    }
}
