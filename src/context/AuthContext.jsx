import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalize } from '../utils/format';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        setLoading(false);
        return;
      }
      await syncSessionFromFirestore(user.uid, user.email);
      setLoading(false);
    });
    return unsub;
  }, []);

  const syncSessionFromFirestore = useCallback(async (uid, authEmail) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      let userData = snap.exists() ? snap.data() : null;
      let userDocId = uid;

      if (!userData && authEmail) {
        // Fallback: usuário já existia por e-mail mas doc ainda não tem o uid como id
        const q = query(collection(db, 'users'), where('email', '==', authEmail.toLowerCase()));
        const qs = await getDocs(q);
        if (!qs.empty) {
          userDocId = qs.docs[0].id;
          userData = qs.docs[0].data();
        }
      }

      if (userData) {
        if (userData.status === 'inativo') {
          await signOut(auth);
          setSession(null);
          return;
        }
        const newSession = {
          id: userDocId,
          name: userData.name || 'Usuário',
          username: userData.username || (userData.email ? userData.email.split('@')[0] : 'usuario'),
          cpf: userData.cpf || '',
          email: userData.email || authEmail,
          avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}`,
          role: userData.role || 'usuario',
          person: userData.person || userData.name || 'Eu',
          permissions: userData.permissions || {},
          allowedPersons: userData.allowedPersons || null,
        };
        setSession(newSession);
      } else {
        // Não deveria acontecer em uso normal: a criação de usuário é feita
        // pela tela de Usuários (admin), nunca no primeiro login "às cegas"
        // como no app antigo (isso era um risco: qualquer login virava admin
        // se a base estivesse vazia).
        await signOut(auth);
        setSession(null);
      }
    } catch (e) {
      console.error('Erro ao sincronizar sessão:', e);
      setSession(null);
    }
  }, []);

  /**
   * Login por username, e-mail ou CPF.
   *
   * FIX DE SEGURANÇA: a versão antiga fazia `db.collection('users').get()`
   * (lia TODOS os usuários) só para achar o e-mail correspondente ao
   * identificador digitado. Isso exigia que a coleção 'users' fosse legível
   * publicamente, expondo nome/e-mail/CPF/cargo de todo mundo.
   *
   * Agora usamos uma coleção separada e minimalista `user_lookup`, onde cada
   * documento tem como ID o identificador normalizado (username, e-mail ou
   * CPF só com dígitos) e como conteúdo APENAS `{ email }`. As regras do
   * Firestore permitem `get` (leitura de um doc específico, cujo ID você já
   * precisa saber) mas proíbem `list` nessa coleção — então não dá para
   * "varrer" todos os usuários, só resolver um identificador que a pessoa
   * já digitou.
   */
  const login = useCallback(async (identifier, password) => {
    const cleanInput = identifier.trim();
    const lookupKey = normalize(cleanInput).replace(/\s+/g, '');
    const cleanCpf = cleanInput.replace(/\D/g, '');

    let authEmail = null;

    // 1. Se já parece um e-mail, tenta usar direto
    if (cleanInput.includes('@')) {
      authEmail = cleanInput.toLowerCase();
    }

    // 2. Tenta resolver por username (lookupKey) ou CPF via user_lookup
    if (!authEmail) {
      const tryIds = [lookupKey];
      if (cleanCpf.length >= 11) tryIds.push(cleanCpf);

      for (const id of tryIds) {
        if (!id) continue;
        const lookupSnap = await getDoc(doc(db, 'user_lookup', id));
        if (lookupSnap.exists() && lookupSnap.data().email) {
          authEmail = lookupSnap.data().email;
          break;
        }
      }
    }

    if (!authEmail) {
      throw { code: 'auth/user-not-found' };
    }

    const cred = await signInWithEmailAndPassword(auth, authEmail, password);
    await syncSessionFromFirestore(cred.user.uid, authEmail);
    return cred.user;
  }, [syncSessionFromFirestore]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setSession(null);
  }, []);

  const hasPermission = useCallback((module, action = 'view') => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (module === 'admin') return session.role === 'admin';
    if (module === 'gerente') return ['admin', 'gerente'].includes(session.role);
    if (module === 'config_system') {
      return session.role === 'admin' || (session.permissions?.settings || []).includes('edit');
    }
    if (module === 'manage_users') {
      return session.role === 'admin' || (session.permissions?.users || []).includes('view');
    }
    const modPerms = session.permissions?.[module] || [];
    return modPerms.includes(action);
  }, [session]);

  const canAccessPerson = useCallback((personName, tx = null) => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (tx && tx.userId && String(tx.userId) === String(session.id)) return true;
    if (!personName) return true;

    const target = normalize(personName);
    if (!target) return true;
    const targetPersons = target.split(',').map((p) => p.trim());

    for (const t of targetPersons) {
      if (session.person && normalize(session.person) === t) return true;
      if (session.name && normalize(session.name) === t) return true;
      if (session.username && normalize(session.username) === t) return true;
      if (session.email && normalize(session.email.split('@')[0]) === t) return true;

      if (session.role === 'gerente') {
        if (Array.isArray(session.allowedPersons)) {
          if (session.allowedPersons.some((p) => normalize(p) === t)) return true;
        } else if (typeof session.allowedPersons === 'string' && session.allowedPersons.trim()) {
          const list = session.allowedPersons.split(',').map(normalize);
          if (list.includes(t)) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  }, [session]);

  const value = { session, loading, login, logout, hasPermission, canAccessPerson };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Helper usado pela tela de Usuários ao criar/editar um usuário: mantém a
 * coleção user_lookup em dia (username, e-mail e CPF -> email de login).
 * Só deve ser chamado por quem tem permissão de manage_users (a regra do
 * Firestore também deve exigir isso do lado do servidor).
 */
export async function upsertUserLookup(userRecord) {
  const email = (userRecord.email || '').toLowerCase();
  if (!email) return;

  const ids = new Set();
  if (userRecord.username) ids.add(normalize(userRecord.username).replace(/\s+/g, ''));
  if (email) ids.add(normalize(email));
  if (userRecord.cpf) {
    const digits = userRecord.cpf.replace(/\D/g, '');
    if (digits.length >= 11) ids.add(digits);
  }

  await Promise.all(
    [...ids].map((id) => setDoc(doc(db, 'user_lookup', id), { email }, { merge: true }))
  );
}
