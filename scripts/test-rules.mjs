import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Checagem por texto do firestore.rules (regras v2: acesso por família e por dono).
// Não usa emulador nem rede: só confere que as regras importantes continuam escritas como esperado.
// Testes de regras de verdade (emulador do Firebase) são uma tarefa à parte.

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
// Sem comentários, para um trecho comentado não passar como regra ativa
const content = fs.readFileSync(rulesPath, 'utf8').replace(/\/\/.*$/gm, '');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

/** Texto entre as chaves do trecho que começa em headerRegex (que deve terminar na chave de abertura). */
function extractBlock(source, headerRegex) {
  const m = headerRegex.exec(source);
  if (!m) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i);
  }
  return null;
}

function fnBody(name) {
  const body = extractBlock(content, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(body !== null, `função ${name}() não encontrada`);
  return body;
}

function matchBlock(collection) {
  const body = extractBlock(content, new RegExp(`match\\s+\\/${collection}\\/\\{\\w+\\}\\s*\\{`));
  assert.ok(body !== null, `bloco match /${collection}/{...} não encontrado`);
  return body;
}

test("rules_version = '2'", () => {
  assert.match(content, /rules_version\s*=\s*'2'\s*;/);
});

test('firestore.rules tem chaves balanceadas', () => {
  let depth = 0;
  for (const ch of content) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Chave de fechamento inesperada');
  }
  assert.equal(depth, 0, 'Chaves desbalanceadas');
});

test('signedIn() exige request.auth != null', () => {
  assert.match(fnBody('signedIn'), /request\.auth\s*!=\s*null/);
});

test("active() exige cadastro e bloqueia o status 'inativo'", () => {
  const body = fnBody('active');
  assert.match(body, /hasProfile\(\)/);
  assert.match(body, /status['"]\s*,\s*['"]ativo['"]\s*\)\s*!=\s*['"]inativo['"]/);
});

test('selfLocked() trava role, permissions, status, allowedPersons, familyId, superAdmin e person', () => {
  const body = fnBody('selfLocked');
  for (const field of ['role', 'permissions', 'status', 'allowedPersons', 'familyId', 'superAdmin', 'person']) {
    assert.match(body, new RegExp(`['"]${field}['"]`), `campo '${field}' não está em selfLocked()`);
  }
});

// Funções que valem para transactions, accounts, cards e demais registros financeiros
test('canRead/Create/Update/DeleteRecord exigem a família do usuário (myFamily)', () => {
  for (const name of ['canReadRecord', 'canCreateRecord', 'canUpdateRecord', 'canDeleteRecord']) {
    const body = fnBody(name);
    assert.match(body, /myFamily\(\)/, `${name}() não confere a família`);
    assert.match(body, /familyId/, `${name}() não confere familyId`);
  }
});

for (const [collection, module] of [
  ['transactions', 'transactions'],
  ['accounts', 'accounts'],
  ['cards', 'cards'],
]) {
  test(`${collection} usa as funções de registro com o módulo '${module}' (leitura, criação, edição e exclusão)`, () => {
    const body = matchBlock(collection);
    assert.match(body, new RegExp(`allow\\s+read\\s*:\\s*if\\s+canReadRecord\\('${module}'\\)\\s*;`));
    assert.match(body, new RegExp(`allow\\s+create\\s*:\\s*if\\s+canCreateRecord\\('${module}'\\)\\s*;`));
    assert.match(body, new RegExp(`allow\\s+update\\s*:\\s*if\\s+canUpdateRecord\\('${module}'\\)\\s*;`));
    assert.match(body, new RegExp(`allow\\s+delete\\s*:\\s*if\\s+canDeleteRecord\\('${module}'\\)\\s*;`));
    assert.doesNotMatch(body, /if\s+true\s*;/, `${collection} não pode ter regra 'if true'`);
  });
}

test('users: o próprio usuário só atualiza fora de selfLocked(); superAdmin não é criado por família', () => {
  const body = matchBlock('users');
  assert.match(
    body,
    /request\.auth\.uid\s*==\s*uid[\s\S]*?affectedKeys\(\)\.hasAny\(selfLocked\(\)\)/,
    'update do próprio cadastro precisa negar campos de selfLocked()'
  );
  assert.match(body, /!\(\s*'superAdmin'\s+in\s+request\.resource\.data\s*\)/, "create por família precisa negar 'superAdmin'");
  assert.match(body, /allow\s+delete\s*:\s*if\s+request\.auth\.uid\s*!=\s*uid/, 'ninguém apaga o próprio cadastro pelo cliente');
  assert.doesNotMatch(body, /allow\s+[^;]*if\s+true\s*;/, 'users não pode ter regra aberta');
});

test('user_lookup permite get público mas bloqueia listagem; escrita só de gerente ou superAdmin', () => {
  const body = matchBlock('user_lookup');
  assert.match(body, /allow\s+get\s*:\s*if\s+true\s*;/);
  assert.match(body, /allow\s+list\s*:\s*if\s+false\s*;/);
  assert.match(body, /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isManager\(\)\s*\|\|\s*isSuperAdmin\(\)\s*;/);
});

test('persons: leitura por conta não inativa (active) e escrita só de gerente', () => {
  const body = matchBlock('persons');
  assert.match(body, /allow\s+read\s*:\s*if\s+active\(\)\s*;/);
  assert.match(body, /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isManager\(\)\s*;/);
});

test('settings: leitura por conta não inativa (active) e escrita só de gerente ou permissão de edição', () => {
  const body = matchBlock('settings');
  assert.match(body, /allow\s+read\s*:\s*if\s+active\(\)\s*;/);
  assert.match(body, /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isManager\(\)/);
});

// Substitui as checagens antigas de consentLogs e _rate_limits: agora essas coleções ficam fechadas por aqui
test('todo o resto fica fechado (match /{document=**} com allow read, write: if false)', () => {
  const body = extractBlock(content, /match\s+\/\{document=\*\*\}\s*\{/);
  assert.ok(body !== null, 'bloco match /{document=**} não encontrado');
  assert.match(body, /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/);
});

if (failed > 0) {
  console.error(`\n${failed} teste(s) de firestore.rules falharam, ${passed} passaram.`);
  process.exit(1);
}
console.log(`\nTodos os ${passed} testes de firestore.rules passaram com sucesso.`);
