$files = Get-ChildItem -Path $PSScriptRoot -Filter *.html | Where-Object { $_.Name -ne 'index.html' }

$map = @(
    @('LanÃ§amentos', 'Lançamentos'),
    @('CartÃµes', 'Cartões'),
    @('RelatÃ³rios', 'Relatórios'),
    @('UsuÃ¡rios', 'Usuários'),
    @('UsuÃ¡rio', 'Usuário'),
    @('ConfiguraÃ§Ãµes', 'Configurações'),
    @('VisÃ£o Geral', 'Visão Geral'),
    @('CartÃ£o', 'Cartão'),
    @('cartÃ£o', 'cartão'),
    @('PÃ¡gina', 'Página'),
    @('VocÃª', 'Você'),
    @('NÃ£o', 'Não'),
    @('nÃ£o', 'não'),
    @('AÃ§Ã£o', 'Ação'),
    @('AÃ§Ãµes', 'Ações'),
    @('DescriÃ§Ã£o', 'Descrição'),
    @('MÃªs', 'Mês'),
    @('HistÃ³rico', 'Histórico'),
    @('PrÃ³ximo', 'Próximo'),
    @('Ãšltimo', 'Último'),
    @('Ãºltimo', 'último'),
    @('OpÃ§Ãµes', 'Opções'),
    @('VisÃ£o', 'Visão'),
    @('PadrÃ£o', 'Padrão'),
    @('SaÃ­da', 'Saída'),
    @('CrÃ©dito', 'Crédito'),
    @('DÃ©bito', 'Débito'),
    @('MÃ¡ximo', 'Máximo'),
    @('MÃ­nimo', 'Mínimo'),
    @('MÃ©dio', 'Médio'),
    @('Receita', 'Receitas'),
    @('PerÃ­odo', 'Período'),
    @('SalÃ¡rio', 'Salário'),
    @('BÃ¡sico', 'Básico'),
    @('GrÃ¡fico', 'Gráfico'),
    @('AlimentaÃ§Ã£o', 'Alimentação'),
    @('EducaÃ§Ã£o', 'Educação'),
    @('SaÃºde', 'Saúde'),
    @('ConcluÃ­do', 'Concluído'),
    @('InÃ­cio', 'Início'),
    @('MetrÃ³poles', 'Metrópoles'),
    @('VeÃ­culo', 'Veículo'),
    @('AutomÃ³vel', 'Automóvel'),
    @('ImÃ³vel', 'Imóvel'),
    @('FamÃ­lia', 'Família'),
    @('InscriÃ§Ã£o', 'Inscrição'),
    @('TransaÃ§Ã£o', 'Transação'),
    @('transaÃ§Ã£o', 'transação'),
    @('TransaÃ§Ãµes', 'Transações'),
    @('transaÃ§Ãµes', 'transações'),
    @('ExcluÃ­r', 'Excluir'),
    @('excluÃ­do', 'excluído'),
    @('ExcluÃ­do', 'Excluído'),
    @('FÃ­sica', 'Física'),
    @('fÃ­sica', 'física'),
    @('JurÃ­dica', 'Jurídica'),
    @('jurÃ­dica', 'jurídica'),
    @('InstituiÃ§Ã£o', 'Instituição')
)

foreach ($file in $files) {
    # Read as UTF8 so we see the mangled chars properly
    $content = Get-Content -Path $file.FullName -Encoding UTF8 -Raw
    
    foreach ($pair in $map) {
        $key = $pair[0]
        $val = $pair[1]
        $content = $content.Replace($key, $val)
    }
    
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8
    Write-Host "Fixed encoding for $($file.Name)"
}
