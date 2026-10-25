// Bloqueia qualquer comando ou busca que cite arquivo secreto.
// Permite .env.example, process.env e import.meta.env.
import { readFileSync } from 'node:fs';

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const alvo = JSON.stringify(entrada.tool_input ?? {});
const proibido = /(^|[^a-z0-9_])\.env(?!\.example)([^a-z0-9_]|$)|service[-_ ]?account|firebase-adminsdk|\.jks\b|\.keystore\b|keystore\.properties/i;

if (proibido.test(alvo)) {
  console.error('Bloqueado: isto toca um arquivo secreto (.env, service account ou keystore). Não tente outro caminho. Avise o Eduardo.');
  process.exit(2);
}
process.exit(0);
