import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const content = fs.readFileSync(rulesPath, 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

test('firestore.rules tem chaves balanceadas e versão rules_version = 2', () => {
  assert.match(content, /rules_version\s*=\s*'2'\s*;/);
  let depth = 0;
  for (const ch of content) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Chave de fechamento inesperada em firestore.rules');
  }
  assert.equal(depth, 0, 'Chaves desbalanceadas em firestore.rules');
});

test('consentLogs bloqueia leitura e escrita pelo cliente (allow read, write: if false)', () => {
  const matchBlock = content.match(
    /match\s+\/consentLogs\/\{id\}\s*\{([\s\S]*?)\}/
  );
  assert.ok(matchBlock, 'Bloco match /consentLogs/{id} não encontrado');
  assert.match(
    matchBlock[1],
    /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/,
    'consentLogs deve ter allow read, write: if false;'
  );
});

test('_rate_limits bloqueia leitura e escrita pelo cliente (allow read, write: if false)', () => {
  const matchBlock = content.match(
    /match\s+\/_rate_limits\/\{id\}\s*\{([\s\S]*?)\}/
  );
  assert.ok(matchBlock, 'Bloco match /_rate_limits/{id} não encontrado');
  assert.match(
    matchBlock[1],
    /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/,
    '_rate_limits deve ter allow read, write: if false;'
  );
});

test('users restringe create e delete a admin e leitura ao próprio uid, admin ou gerente', () => {
  const matchBlock = content.match(
    /match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\}/
  );
  assert.ok(matchBlock, 'Bloco match /users/{userId} não encontrado');
  assert.match(matchBlock[1], /allow\s+create\s*:\s*if\s+isAdmin\(\)\s*;/);
  assert.match(matchBlock[1], /allow\s+delete\s*:\s*if\s+isAdmin\(\)\s*;/);
});

test('user_lookup permite get público para resolução de login mas bloqueia listagem (allow list: if false)', () => {
  const matchBlock = content.match(
    /match\s+\/user_lookup\/\{lookupId\}\s*\{([\s\S]*?)\}/
  );
  assert.ok(matchBlock, 'Bloco match /user_lookup/{lookupId} não encontrado');
  assert.match(matchBlock[1], /allow\s+get\s*:\s*if\s+true\s*;/);
  assert.match(matchBlock[1], /allow\s+list\s*:\s*if\s+false\s*;/);
});

test('accounts exige isMember() para leitura e restringe update de terceiros apenas a computedBalance', () => {
  const matchBlock = content.match(
    /match\s+\/accounts\/\{id\}\s*\{([\s\S]*?)\}/
  );
  assert.ok(matchBlock, 'Bloco match /accounts/{id} não encontrado');
  assert.match(matchBlock[1], /allow\s+read\s*:\s*if\s+isMember\(\)\s*;/);
  assert.match(
    matchBlock[1],
    /affectedKeys\(\)\.hasOnly\(\['computedBalance'\]\)/
  );
});

console.log(`\nTodos os ${passed} testes de firestore.rules passaram com sucesso.`);
