# Design do Wynd (site e app)

Fonte: canvas "Wynd Site redesign" (49 telas, claro e escuro). Este arquivo resume o que os agentes precisam. Em dúvida visual, o canvas manda; no site, os valores já estão em `src/styles/tailwind.css` e `tailwind.config.js` (conferidos: batem com o canvas). No app, estes valores vão para o tema do Compose.

Nomes: tema claro = **Floresta**. Tema escuro = **Verde calmo**.

## Fontes
- Títulos, números grandes e valores em R$: **Bricolage Grotesque** 700 (títulos de página 34px, título de card 18px, saldo grande 56px, valor de card 34px, valor de lista 16px).
- Todo o resto: **DM Sans** 400, 500, 700 (texto 14 a 15px, apoio 12 a 13px).
- No app, usar as mesmas famílias (arquivos de fonte no projeto).

## Cores (mesmos nomes no site e no app)
| Token | Floresta (claro) | Verde calmo (escuro) | Uso |
|---|---|---|---|
| bg | #F3F1E9 | #0A1110 | fundo da tela |
| card | #FCFBF7 | #152120 | cartões |
| border | #DDDACB | #25332F | contornos |
| ink | #14261D | #E8F0EC | texto principal |
| muted | #3F5046 | #9DB2AA | texto de apoio |
| pri | #1F5A41 | #5ED9BF | cor principal, barras |
| priSoft | #D8E8DC | #123A33 | fundo de ícone de receita, selo |
| priInk | #174632 | #5ED9BF | texto e links na cor principal, receita |
| spend | #C8553D | #FF8F73 | despesa (decorativo) |
| spendText | #B3442A | #FF8F73 | texto de despesa |
| spendSoft | #F2D9D0 | #3A2018 | fundo de ícone de despesa |
| neutral | #EAE7DA | #17231F | fundos neutros |
| track | #D6D2C2 | #2A3A35 | trilho de barras, rolagem |
| nav | #14261D | #1B2B28 | menu lateral |
| navMuted | #9DB0A4 | #9DB2AA | item inativo do menu |
| navActBg | #2B4538 | #1F3A33 | item ativo do menu |
| navActIcon | #A9D6BC | #7FE0C8 | ícone e texto ativos |
| fab | #2F7A57 | #3FC3A8 | botão principal |
| fabIcon | #FFFFFF | #0A1110 | texto do botão principal |
| seg | #E6E3D5 | #0F1917 | fundo de segmentado |
| segOn | #FCFBF7 | #1F3A33 | opção ativa do segmentado |
| heroStart / heroEnd | #1F5A41 / #2F7A57 | #123A33 / #1F5A4C | gradiente do cartão de saldo |
| heroInk / heroMuted | #FFFFFF / #CFE6D8 | #E8FBF4 / #9FD8CB | texto no cartão de saldo |
| wordA / wordB | #E0B04A / #C99A2A | #F8D77F / #D9A22E | gradiente da marca "wynd" |

Regras de cor:
- Receita em priInk (verde). Despesa em spendText (terracota/coral). Nunca vermelho puro.
- Nunca usar cor literal em tela. Sempre o token (no site, as classes do Tailwind ligadas às variáveis).
- Receita e despesa também se diferenciam por sinal (+ e -) e pelo ícone, nunca só pela cor.

## Formas e tamanhos
- Cartões grandes: raio 28 (card-lg). Cartões médios 24 a 26. Campos e botões retangulares 18. Pílulas e botões de ação: 22 (altura 44) ou 999.
- Ícone em quadrado de 42 x 42, raio 14, com fundo priSoft (receita) ou spendSoft (despesa).
- Barras de progresso: altura 8 (listas) ou 10 (destaque), raio 4 a 5, trilho em track.
- Alvo de toque mínimo 44. Botões principais 44 a 46 de altura.
- Menu lateral no site: 248 de largura, fundo nav. Conteúdo com padding 28 a 36.
- No celular: layout em coluna única, menu "Mais" para os itens secundários.
- Listas: linhas com separador de 1px em border, padding vertical 13.
- Ícones: traço de 1.8, sem emoji.

## Componentes próprios (nada do navegador ou do sistema)
Regra do canvas: no site, não usar alert, confirm, select nativo, calendário nativo, barra de rolagem padrão nem tooltip nativo. Cada um tem o seu componente:
- **Aviso (toast)**: título e linha de apoio; erro explica o que fazer ("Confira a conexão e tente de novo."); ação "Desfazer" quando couber.
- **Confirmação** no lugar de confirm: título em pergunta, uma frase do que acontece, botões Cancelar e a ação (Excluir).
- **Sino de avisos** no lugar da notificação do navegador: lista de avisos com "Marcar como lidos".
- **Lista de escolha** no lugar do select; **calendário próprio** no lugar do date nativo; **barra de rolagem fina** nas cores do tema; **dica** com o texto curto ao passar o mouse.
No app, usar os equivalentes do Compose estilizados com os mesmos tokens (bottom sheet para escolha, dialog próprio para confirmação, snackbar para aviso).

## Texto
- Português do Brasil, frases curtas, voz de quem explica ao lado ("Gastou 73% do que entrou, faltam 14 dias para fechar o mês").
- Valores: `R$ 1.100,00`. Despesa com "- ", receita com "+ ".
- Erro: diz o que houve e como resolver. Nunca "erro desconhecido".

## Telas do canvas (claro e escuro de cada uma)
Painel, Transações, Entrar, Criar conta, Contas, Cartões, Fixas, Metas, Relatórios, Usuários, Configurações, Importar, Ferramentas (tags, calculadoras, modo viagem), Ajuda, Termos de uso, Política de privacidade, Excluir conta, Aceitar termos, Painel no celular, Menu no celular, Componentes.

## Acessibilidade
- Contraste de texto mínimo 4,5:1 nos dois temas. Cores que precisam ser distinguidas também diferem em luminosidade.
- Botão é botão (não div clicável). Ícone sozinho tem rótulo.
- Foco visível. Estados vazio, carregando e erro em toda tela de dados.
- Tema claro e escuro sempre entregues juntos.
