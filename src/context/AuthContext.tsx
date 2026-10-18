import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalize } from '../utils/format';
import { resolvePermissions } from '../utils/permissions';
import { User } from '../types';

interface AuthContextType {
  session: User | null;
  loading: boolean;
  login: (identifier: string, pass: string) => Promise<FirebaseUser>;
  loginWithGoogle: () => Promise<FirebaseUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (module: string, action?: string) => boolean;
  canAccessPerson: (personName?: string | null, tx?: any) => boolean;
  canAccessTransaction: (tx: any) => boolean;
  canAccessAccount: (acc: any) => boolean;
  canAccessCard: (card: any) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const syncSessionFromFirestore = useCallback(async (uid: string, authEmail: string | null) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      let userData = snap.exists() ? snap.data() : null;
      let userDocId = uid;

      if (!userData && authEmail) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', authEmail.toLowerCase()));
          const qs = await getDocs(q);
          if (!qs.empty) {
            userDocId = qs.docs[0].id;
            userData = qs.docs[0].data();
          }
        } catch {
          // Sob as regras v2, list em 'users' sem familyId/users/<uid> é bloqueado;
          // segue normalmente para deslogar logo abaixo.
        }
      }

      if (userData) {
        if (userData.status === 'pendente') {
          await signOut(auth);
          setSession(null);
          return 'pendente';
        }
        if (userData.status === 'inativo') {
          await signOut(auth);
          setSession(null);
          return 'inativo';
        }
        const newSession: User = {
          id: userDocId,
          name: userData.name || 'Usuário',
          username: userData.username || (userData.email ? userData.email.split('@')[0] : 'usuario'),
          email: userData.email || authEmail || '',
          avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}`,
          role: userData.role || 'viewer',
          person: userData.person || userData.name || 'Eu',
          familyId: typeof userData.familyId === 'string' ? userData.familyId : '',
          superAdmin: userData.superAdmin === true,
          photo: typeof userData.photo === 'string' ? userData.photo : undefined,
          inviteCode: typeof userData.inviteCode === 'string' ? userData.inviteCode : undefined,
          termsVersion: typeof userData.termsVersion === 'string' ? userData.termsVersion : undefined,
          privacyVersion: typeof userData.privacyVersion === 'string' ? userData.privacyVersion : undefined,
          acceptedAt: userData.acceptedAt || undefined,
        };
        // Propriedades dinâmicas de permissões que não ficam no User base:
        (newSession as any).permissions = resolvePermissions(newSession.role, userData.permissions);
        (newSession as any).allowedPersons = userData.allowedPersons || null;
        
        setSession(newSession);
        return 'ativo';
      } else {
        await signOut(auth);
        setSession(null);
        return 'missing';
      }
    } catch (e) {
      console.error('Erro ao sincronizar sessão:', e);
      setSession(null);
      return 'error';
    }
  }, []);

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
  }, [syncSessionFromFirestore]);

  const login = useCallback(async (identifier: string, password: string) => {
    const cleanInput = identifier.trim();
    const lookupKey = normalize(cleanInput).replace(/\s+/g, '');
    const cleanCpf = cleanInput.replace(/\D/g, '');

    let authEmail: string | null = null;

    if (cleanInput.includes('@')) {
      authEmail = cleanInput.toLowerCase();
    }

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

    if (!authEmail) throw { code: 'auth/user-not-found' };

    const cred = await signInWithEmailAndPassword(auth, authEmail, password);
    const status = await syncSessionFromFirestore(cred.user.uid, authEmail);
    if (status === 'pendente') throw { code: 'auth/account-pending' };
    if (status === 'inativo') throw { code: 'auth/account-blocked' };
    if (status === 'missing') throw { code: 'auth/user-not-found' };
    return cred.user;
  }, [syncSessionFromFirestore]);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const status = await syncSessionFromFirestore(cred.user.uid, cred.user.email);
    if (status === 'pendente') throw { code: 'auth/account-pending' };
    if (status === 'inativo') throw { code: 'auth/account-blocked' };
    if (status === 'missing') throw { code: 'auth/user-not-found' };
    return cred.user;
  }, [syncSessionFromFirestore]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    await syncSessionFromFirestore(current.uid, current.email);
  }, [syncSessionFromFirestore]);

  const hasPermission = useCallback((module: string, action = 'view') => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (module === 'admin') return session.role === 'admin';
    if (module === 'gerente') return ['admin', 'gerente'].includes(session.role);
    
    const sessAny = session as any;
    if (module === 'config_system') return session.role === 'admin' || (sessAny.permissions?.settings || []).includes('edit');
    if (module === 'manage_users') return session.role === 'admin' || (sessAny.permissions?.users || []).includes('view');
    
    return (sessAny.permissions?.[module] || []).includes(action);
  }, [session]);

  const canAccessPerson = useCallback((personName?: string | null, tx: any = null) => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (tx && tx.userId && String(tx.userId) === String(session.id)) return true;
    if (!personName) return true;

    const target = normalize(personName);
    if (!target) return true;
    const targetPersons = target.split(',').map((p) => p.trim());
    const sessAny = session as any;

    for (const t of targetPersons) {
      if (session.person && normalize(session.person) === t) return true;
      if (session.name && normalize(session.name) === t) return true;
      if (session.username && normalize(session.username) === t) return true;
      if (session.email && normalize(session.email.split('@')[0]) === t) return true;

      if (session.role === 'gerente') {
        if (Array.isArray(sessAny.allowedPersons)) {
          if (sessAny.allowedPersons.some((p: string) => normalize(p) === t)) return true;
        } else if (typeof sessAny.allowedPersons === 'string' && sessAny.allowedPersons.trim()) {
          if (sessAny.allowedPersons.split(',').map(normalize).includes(t)) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  }, [session]);

  const canAccessTransaction = useCallback(
    (tx: any) => {
      if (!tx) return false;
      return canAccessPerson(tx.person, tx);
    },
    [canAccessPerson]
  );

  const canAccessAccount = useCallback(
    (acc: any) => {
      if (!acc) return false;
      return canAccessPerson(acc.owner, acc);
    },
    [canAccessPerson]
  );

  const canAccessCard = useCallback(
    (card: any) => {
      if (!card) return false;
      return canAccessPerson(card.owner, card);
    },
    [canAccessPerson]
  );

  const value = {
    session,
    loading,
    login,
    loginWithGoogle,
    logout,
    refreshSession,
    hasPermission,
    canAccessPerson,
    canAccessTransaction,
    canAccessAccount,
    canAccessCard,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export async function upsertUserLookup(userRecord: any) {
  const email = (userRecord.email || '').toLowerCase();
  if (!email) return;

  const ids = new Set<string>();
  if (userRecord.username) ids.add(normalize(userRecord.username).replace(/\s+/g, ''));
  if (email) ids.add(normalize(email));
  if (userRecord.cpf) {
    const digits = userRecord.cpf.replace(/\D/g, '');
    if (digits.length >= 11) ids.add(digits);
  }

  await Promise.all(
    [...ids].map(async (id) => {
      const ref = doc(db, 'user_lookup', id);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const existingEmail = String(existing.data()?.email || '').trim().toLowerCase();
        if (existingEmail && existingEmail !== email) return;
      }
      await setDoc(ref, { email }, { merge: true });
    })
  );
}
