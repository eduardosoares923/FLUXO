# FLUXO (React) — migração da versão vanilla JS

Este projeto é a conversão do sistema FLUXO (originalmente HTML/CSS/JS puro +
Firebase, repo `eduardosoares923/FLUXO`) para React + Vite, com a correção do
problema de segurança encontrado na revisão do código original.

## O que já está pronto

- Estrutura completa do projeto (Vite + React Router + Firebase modular v9+)
- **Autenticação corrigida** (`src/context/AuthContext.jsx`): login por
  usuário/e-mail/CPF sem mais precisar ler a coleção `users` inteira
  (ver seção "O fix de segurança" abaixo)
- Hook genérico de sincronização em tempo real com Firestore
  (`src/hooks/useCollection.js`), substituindo `storage.js`
- Layout com sidebar, proteção de rotas por permissão (`src/components/Layout.jsx`)
- Páginas com CRUD funcional completo: **Login, Dashboard, Contas, Cartões,
  Transações, Usuários**
- CSS original reaproveitado (`src/styles/*.css`, copiado do repo antigo) +
  um CSS complementar (`app-shell.css`) só para as classes novas da estrutura React
- `firestore.rules` já corrigido

## O que falta portar (para o Antigravity continuar)

- **Assinaturas** (`src/pages/Subscriptions.jsx`): só tem CRUD básico.
  Falta portar de `js/modules/subscriptions.js` (749 linhas): ciclo de
  cobrança, lembretes, marcação de fatura paga (`paidInvoices`)
- **Relatórios** (`src/pages/Reports.jsx`): só tem despesas por categoria/mês.
  Falta portar de `js/modules/reports.js` (1130 linhas): gráficos, comparação
  mês a mês, exportação Excel/PDF
- **Configurações** (`src/pages/Settings.jsx`): é só um placeholder.
  Falta portar de `js/modules/settings.js` (302 linhas)
- **Importação de extrato/planilha** (`js/modules/import.js`, 318 linhas):
  ainda não tem página React equivalente
- Cálculos mais avançados de fatura de cartão (`getCardMetrics` e
  `getCardMetricsForInvoiceMonth` em `utils.js`) só foram parcialmente
  portados (`getCardInvoiceMonth`); o resto fica pra quando as telas de
  Cartões/Faturas precisarem

## O fix de segurança (o motivo de tudo isso)

**Problema no código antigo:** para logar com usuário/CPF (não só e-mail), o
app buscava **toda a coleção `users`** no Firestore, no navegador, antes de
autenticar:

```js
const usersSnap = await db.collection('users').get(); // lia TODO MUNDO
```

Isso só funciona se as regras do Firestore permitirem ler a coleção `users`
publicamente, o que expõe nome, e-mail, CPF, cargo e permissões de todos os
usuários para qualquer visitante do site.

**Correção aplicada:** criamos uma coleção separada e minimalista,
`user_lookup`, onde cada documento:
- tem como **ID** o identificador normalizado (username, e-mail ou CPF só
  com dígitos)
- guarda **apenas** `{ email }`

As regras (`firestore.rules`) permitem `get` (ler um doc específico, cujo ID
você só sabe se já digitou aquele username/CPF/e-mail) mas proíbem `list`
nessa coleção (não dá pra "varrer" todos os usuários). A coleção `users`
completa passou a exigir estar logado (e só admin lê todo mundo).

Sempre que um usuário for criado ou editado (tela de Usuários), o app chama
`upsertUserLookup()` para manter esses documentos de `user_lookup` em dia.

## Rodando localmente

```bash
npm install
npm run dev
```

## Deploy

O jeito mais simples é publicar `firestore.rules` no Console do Firebase
(Firestore → Regras → colar o conteúdo do arquivo → Publicar) e fazer o
deploy do build (`npm run build`) no Vercel, do mesmo jeito que o projeto
antigo já estava configurado (`nova-pasta-5-nine.vercel.app`).

---

## Prompt para colar no Antigravity

Pode usar o texto abaixo como ponto de partida pra pedir pro Antigravity
continuar o trabalho:

> Este é o projeto FLUXO, um app de controle financeiro pessoal, migrado de
> HTML/CSS/JS puro + Firebase para React + Vite (o código já está pronto no
> repositório atual). A migração já incluiu a correção de um problema de
> segurança: o login antigo lia a coleção inteira `users` do Firestore no
> cliente para resolver login por usuário/CPF; agora existe uma coleção
> `user_lookup` minimalista (`{ email }` por identificador) usada só para
> essa resolução, e as regras do Firestore (`firestore.rules`) já refletem
> isso.
>
> Já estão portadas e funcionais: autenticação (`src/context/AuthContext.jsx`),
> sincronização em tempo real com Firestore (`src/hooks/useCollection.js`),
> layout com sidebar e permissões (`src/components/Layout.jsx`), e as páginas
> Login, Dashboard, Contas, Cartões, Transações e Usuários com CRUD completo.
>
> Siga o roadmap em PRIORIDADES.md, que tem 4 fases. Antes de tudo, confirme
> a Fase 0 (firestore.rules publicado, coleção user_lookup alimentada) —
> isso é correção de segurança, não deve ficar pra depois.
>
> Depois disso, na Fase 1: implemente TanStack Query nos dados do Firestore
> usando queryClient.setQueryData() dentro do callback do onSnapshot (não dá
> pra usar um queryFn tradicional aqui, porque useCollection.js usa
> listeners em tempo real, não request/response); adicione Error Boundaries
> nas rotas; use React.lazy + Suspense por rota, começando por Relatórios.
> Para o item de estado global, ANTES de implementar Zustand me pergunte se é
> para conviver com o AuthContext (só tema/filtros) ou para substituir ele
> por completo (incluindo sessão do usuário) — não implemente os dois
> convivendo sem essa decisão.
>
> Na Fase 2, adicione React Hook Form + Zod nos formulários que ainda usam
> useState cru, comece a introduzir TypeScript por Conta/Cartão/Transação,
> padronize loading/vazio/erro em todas as telas, e troque os confirm()
> nativos de exclusão (Contas, Cartões, Usuários) por um modal de
> confirmação com toast.
>
> Só na Fase 3 complete a migração de Assinaturas, Relatórios, Configurações
> e Importação, portando a lógica original que está em
> reference-original-js/modules/ (subscriptions.js, reports.js,
> settings.js, import.js), mantendo os padrões já usados nas páginas
> prontas (useCollection, AuthContext, CSS existente em src/styles). Depois
> disso, revise as regras do Firestore das coleções financeiras para
> restringir por owner/person, não só por estar logado.
>
> Fase 4 (virtualização, useTransition, React Compiler) só se eu pedir
> depois de medir performance real.
>
> Antes de cada item, me explica rapidamente a abordagem antes de gerar o
> código.
