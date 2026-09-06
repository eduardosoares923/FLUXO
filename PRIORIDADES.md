# Prioridades de evolução do FLUXO React

## Fase 0, segurança (CONCLUÍDA ✅)

0. [x] Confirmar que `firestore.rules` foi publicado no Console do Firebase e que
   a coleção `user_lookup` está sendo alimentada (`upsertUserLookup()` em `AuthContext.jsx` e `Users.jsx`).

## Fase 1, base sólida (CONCLUÍDA ✅)

1. [x] **TanStack Query para dados assíncronos**: Implementado com `@tanstack/react-query`,
   usando `queryClient.setQueryData()` no callback do `onSnapshot` dentro de `useCollection.js`.
2. [x] **Error Boundaries**: Componente `ErrorBoundary.jsx` implementado na raiz da aplicação e no outlet do layout.
3. [x] **React.lazy + Suspense**: Implementado em todas as rotas com `RouteLoading.jsx` e code-splitting ativo.
4. [x] **Estado Global**: Decidido pela Opção (A) — `zustand` (`useUIStore.js`) para tema (claro/escuro) e preferências de UI, mantendo `AuthContext.jsx` para autenticação e permissões.

## Fase 2, robustez (CONCLUÍDA ✅)

5. [x] **React Hook Form + Zod**: Schemas centralizados em `src/schemas/financialSchemas.js` e formulários migrados em Contas, Cartões, Transações, Usuários e Assinaturas.
6. [x] **TypeScript gradual**: Configurado `tsconfig.json` e criados os contratos e tipos em `src/types/index.ts`, além da conversão de `format.ts`.
7. [x] **Estados de loading, vazio e erro**: Componentes `PageLoading`, `PageError` e `EmptyState` em `StateFeedback.jsx` aplicados em todas as telas com tratamento do erro de sincronização do Firestore.
8. [x] **Toasts e Confirmações**: `useToastStore.js` e `ToastContainer.jsx` para alertas flutuantes, e `ConfirmModal.jsx` substituindo todos os `confirm()` nativos do navegador.

## Fase 3, terminar a migração de funcionalidades (CONCLUÍDA ✅)

9. [x] **Migração completa de módulos legados**:
   - **Assinaturas** (`Subscriptions.jsx`): ciclo de cobrança, sincronização de despesas no mês corrente, rateio entre pessoas e KPIs.
   - **Configurações** (`Settings.jsx`): preferências de tema, gestão de categorias customizadas e exportação/restauração de backup completo em JSON.
   - **Importação** (`Import.jsx`): drag & drop, leitura de extratos CSV e OFX com preview e importação em lote para transações.
   - **Relatórios** (`Reports.jsx`): métricas de comprometimento de renda, comparativo mês a mês, gráficos de despesas por categoria e por pessoa, e exportação para Excel e PDF/impressão.
10. [x] **Revisão das regras do Firestore**: `firestore.rules` atualizado para restringir leitura e escrita de `accounts`, `cards`, `transactions` e `subscriptions` por dono/pessoa (`isMyPerson()`) e permissão gerencial (`isManager()`).

## Fase 4, só se sentir necessidade real (medir antes de otimizar)

11. [ ] Virtualização de tabelas, se a lista de transações crescer muito
12. [ ] `useTransition`/`useDeferredValue`, se busca e filtro ficarem lentos
13. [ ] React Compiler, depois de medir com o Profiler
