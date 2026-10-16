import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');

const FORBIDDEN_PATTERNS = [
  { regex: /\balert\s*\(/, message: 'Proibido usar alert() nativo.' },
  { regex: /\bconfirm\s*\(/, message: 'Proibido usar confirm() nativo.' },
  { regex: /\bprompt\s*\(/, message: 'Proibido usar prompt() nativo.' },
  { regex: /<select\b/, message: 'Proibido usar <select> nativo.' },
  { regex: /type=["'](date|month|number|time)["']/, message: 'Proibido usar input type="date|month|number|time" nativo.' },
  { regex: /\s+title="/, message: 'Proibido usar atributo title="..." nativo. Use <Tooltip> ou aria-label.' },
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(srcDir);
const violations = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.regex.test(line)) {
        violations.push({
          file: path.relative(path.resolve(__dirname, '..'), file),
          line: idx + 1,
          message: rule.message,
          snippet: line.trim(),
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('\n[lint-ui] Violações das regras de interface encontradas:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} -> ${v.message}\n    ${v.snippet}`);
  }
  process.exit(1);
} else {
  console.log('[lint-ui] Nenhuma violação de controles nativos encontrada em src/.');
}
