$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    
    # 1. Convert btn-action
    $content = $content -replace 'class="btn-action edit"', 'class="btn btn-ghost primary btn-sm"'
    $content = $content -replace 'class="btn-action delete"', 'class="btn btn-ghost danger btn-sm"'
    $content = $content -replace 'class="btn-action pay"', 'class="btn btn-ghost success btn-sm"'
    $content = $content -replace 'class="btn-action"', 'class="btn btn-ghost btn-sm"'
    
    # 2. Add base btn class where missing (just in case)
    # 3. Convert primary buttons
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Cancelar(.*?)</button>', '<button$1class="btn btn-secondary"$2>$3Cancelar$4</button>'
    $content = $content -replace '<button([^>]*)class="btn btn-primary"([^>]*)>(.*?)Cancelar(.*?)</button>', '<button$1class="btn btn-secondary"$2>$3Cancelar$4</button>'
    
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Salvar(.*?)</button>', '<button$1class="btn btn-success"$2>$3Salvar$4</button>'
    $content = $content -replace '<button([^>]*)class="btn btn-primary"([^>]*)>(.*?)Salvar(.*?)</button>', '<button$1class="btn btn-success"$2>$3Salvar$4</button>'
    
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Confirmar(.*?)</button>', '<button$1class="btn btn-success"$2>$3Confirmar$4</button>'
    $content = $content -replace '<button([^>]*)class="btn btn-primary"([^>]*)>(.*?)Confirmar(.*?)</button>', '<button$1class="btn btn-success"$2>$3Confirmar$4</button>'
    
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Excluir(.*?)</button>', '<button$1class="btn btn-danger"$2>$3Excluir$4</button>'
    $content = $content -replace '<button([^>]*)class="btn btn-primary"([^>]*)>(.*?)Excluir(.*?)</button>', '<button$1class="btn btn-danger"$2>$3Excluir$4</button>'

    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Filtrar(.*?)</button>', '<button$1class="btn btn-secondary"$2>$3Filtrar$4</button>'
    
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Nova Transação(.*?)</button>', '<button$1class="btn btn-primary"$2>$3Nova Transação$4</button>'
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Novo Cartão(.*?)</button>', '<button$1class="btn btn-primary"$2>$3Novo Cartão$4</button>'
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Nova Conta(.*?)</button>', '<button$1class="btn btn-primary"$2>$3Nova Conta$4</button>'
    $content = $content -replace '<button([^>]*)class="btn"([^>]*)>(.*?)Nova Categoria(.*?)</button>', '<button$1class="btn btn-primary"$2>$3Nova Categoria$4</button>'

    [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Processed $($f.Name)"
}
