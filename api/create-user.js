// Vercel Serverless Function: cria um usuário no Firebase Auth + Firestore
// usando o Admin SDK, do lado do servidor. Diferente de
// createUserWithEmailAndPassword no navegador, isso NÃO troca a sessão de
// quem está chamando (o admin continua logado como admin).
//
// Requer a variável de ambiente FIREBASE_SERVICE_ACCOUNT no Vercel, com o
// conteúdo do JSON da chave de serviço (o mesmo tipo de credencial usada
// no server.js do NexClaim).

import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

function normalize(str) {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPersonKeys(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(arr.map((p) => normalize(p)).filter(Boolean))];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const app = getAdminApp();
    const auth = admin.auth(app);
    const db = admin.firestore(app);

    // 1. Confirma que quem está chamando está logado E é admin
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    const decoded = await auth.verifyIdToken(idToken);
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Só administradores podem criar usuários' });
    }

    // 2. Valida os dados recebidos
    const { name, username, email, cpf, password, role, person, allowedPersons } = req.body || {};
    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Preencha nome, usuário, e-mail e senha' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
    }

    // 3. Cria o usuário no Firebase Auth (sem afetar a sessão de ninguém,
    //    porque isso roda no servidor, não no navegador)
    const newUser = await auth.createUser({
      email: email.trim().toLowerCase(),
      password,
      displayName: name.trim(),
    });

    // 4. Cria o documento no Firestore, já com as chaves normalizadas
    const finalPerson = person?.trim() || name.trim();
    const finalAllowedPersons = role === 'gerente' ? allowedPersons?.trim() || '' : '';

    const record = {
      id: newUser.uid,
      name: name.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      cpf: cpf?.trim() || '',
      role: role || 'usuario',
      person: finalPerson,
      allowedPersons: finalAllowedPersons,
      status: 'ativo',
      personKeys: toPersonKeys([finalPerson, name, username].filter(Boolean)),
      allowedPersonKeys: finalAllowedPersons ? toPersonKeys(finalAllowedPersons) : [],
      createdAt: new Date().toISOString(),
    };

    await db.collection('users').doc(newUser.uid).set(record);

    // 5. Mantém a coleção user_lookup em dia (login por username/CPF)
    const lookupIds = new Set([normalize(username), normalize(email)]);
    const cpfDigits = (cpf || '').replace(/\D/g, '');
    if (cpfDigits.length >= 11) lookupIds.add(cpfDigits);
    await Promise.all(
      [...lookupIds].map((id) =>
        db.collection('user_lookup').doc(id).set({ email: email.trim().toLowerCase() }, { merge: true })
      )
    );

    return res.status(200).json({ success: true, uid: newUser.uid });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    const message = err.code === 'auth/email-already-exists' ? 'Esse e-mail já está em uso' : err.message;
    return res.status(500).json({ error: message });
  }
}
