$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html | Where-Object { $_.Name -ne 'index.html' }
foreach ($f in $files) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        $mangledBytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($text)
        $fixedText = [System.Text.Encoding]::UTF8.GetString($mangledBytes)
        
        [System.IO.File]::WriteAllText($f.FullName, $fixedText, [System.Text.Encoding]::UTF8)
        Write-Host "Fixed $($f.Name)"
    } catch {
        Write-Host "Error on $($f.Name): $_"
    }
}
