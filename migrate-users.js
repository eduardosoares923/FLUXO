/**
 * Migração: garante que cada usuário tenha um documento em `users/{uid}`,
 * onde {uid} é o UID de autenticação do Firebase (não um ID antigo/legado).
 *
 * MODO SEGURO POR PADRÃO: só mostra o que faria (dry run). Pra aplicar de
 * verdade, rode com --apply. Nunca apaga os documentos antigos sozinho,
 * isso fica pra você confirmar manualmente depois de testar o app.
 *
 * Como usar:
 *   1. npm install firebase-admin --save-dev   (dentro da pasta do projeto)
 *   2. Baixe a chave de serviço: Firebase Console > Configurações do
 *      projeto (ícone de engrenagem) > Contas de serviço > Gerar nova
 *      chave privada. Salva o arquivo JSON baixado como
 *      "serviceAccountKey.json" na raiz do projeto.
 *   3. Rode: node migrate-users.js           (só mostra o que vai fazer)
 *      Depois: node migrate-users.js --apply  (aplica de verdade)
 *
 * IMPORTANTE: nunca suba o serviceAccountKey.json pro GitHub (já deve
 * estar coberto pelo .gitignore, mas confira).
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLY = process.argv.includes('--apply');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('Arquivo serviceAccountKey.json não encontrado na raiz do projeto.');
  console.error('Baixe em: Firebase Console > Configurações do projeto > Contas de serviço.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

function normalize(str) {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPersonKeys(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(arr.map((p) => normalize(p)).filter(Boolean))];
}

async function main() {
  console.log(APPLY ? '=== MODO APLICAR (vai escrever no banco) ===' : '=== MODO SIMULAÇÃO (dry run, nada será alterado) ===');
  console.log('');

  const usersSnap = await db.collection('users').get();
  console.log(`Encontrados ${usersSnap.size} documentos na coleção 'users'.\n`);

  let migrated = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const docId = docSnap.id;
    const email = (data.email || '').trim().toLowerCase();

    if (!email) {
      console.log(`⚠️  Documento "${docId}" não tem e-mail, pulando (verifique manualmente).`);
      failed++;
      continue;
    }

    let authUser;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch (err) {
      console.log(`❌ Não achei usuário no Firebase Auth pro e-mail "${email}" (documento "${docId}"). Erro: ${err.message}`);
      failed++;
      continue;
    }

    const uid = authUser.uid;

    if (docId === uid) {
      console.log(`✅ "${data.name || email}" já está com o ID certo (${uid}).`);
      alreadyOk++;
      continue;
    }

    const newDocRef = db.collection('users').doc(uid);
    const newDocSnap = await newDocRef.get();

    if (newDocSnap.exists) {
      console.log(`ℹ️  "${data.name || email}" já tem um documento em users/${uid} (não vou sobrescrever). Documento antigo "${docId}" pode ser removido manualmente depois de conferir.`);
      continue;
    }

    const migratedData = {
      ...data,
      personKeys: toPersonKeys([data.person, data.name, data.username].filter(Boolean)),
    };

    console.log(`➡️  "${data.name || email}": migrando de users/${docId} para users/${uid}`);

    if (APPLY) {
      try {
        await newDocRef.set(migratedData);
        console.log(`   ✅ Criado users/${uid}. O documento antigo users/${docId} NÃO foi apagado (apague manualmente depois de testar).`);
        migrated++;
      } catch (err) {
        console.log(`   ❌ Erro ao criar novo documento: ${err.message}`);
        failed++;
      }
    } else {
      console.log('   (simulação, nada foi escrito ainda)');
      migrated++;
    }
  }

  console.log('\n=== Resumo ===');
  console.log(`Já corretos: ${alreadyOk}`);
  console.log(`${APPLY ? 'Migrados' : 'Seriam migrados'}: ${migrated}`);
  console.log(`Falhas/atenção: ${failed}`);

  if (!APPLY) {
    console.log('\nNada foi alterado ainda. Se os resultados acima parecem certos, rode:');
    console.log('  node migrate-users.js --apply');
  } else {
    console.log('\nPronto! Teste o app agora. Depois de confirmar que tudo funciona,');
    console.log('apague manualmente os documentos antigos (IDs diferentes) no Firestore.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro inesperado:', err);
    process.exit(1);
  });
