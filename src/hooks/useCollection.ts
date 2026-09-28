import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../firebase';
import { generateId } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export function useCollection<T = any>(collectionName: string) {
  const queryClient = useQueryClient();
  const pendingDeletes = useRef<Set<string>>(new Set());
  const { session } = useAuth();

  const { data = [] } = useQuery<T[]>({
    queryKey: [collectionName],
    queryFn: () => queryClient.getQueryData<T[]>([collectionName]) ?? [],
    initialData: () => queryClient.getQueryData<T[]>([collectionName]) ?? [],
    staleTime: Infinity,
  });

  const [loading, setLoading] = useState(() => !queryClient.getQueryData([collectionName]));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        const items: T[] = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() } as unknown as T));
        
        const filtered = pendingDeletes.current.size
          ? items.filter((it: any) => !pendingDeletes.current.has(String(it.id)))
          : items;

        queryClient.setQueryData([collectionName], filtered);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Erro de sincronização em ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [collectionName, queryClient]);

  // MOTOR DA OTIMIZAÇÃO 1: Recalcula e salva o saldo final da conta no Firebase
  const syncAccountBalance = async (paymentMethod: string) => {
    if (!paymentMethod || !paymentMethod.startsWith('acc_')) return;
    const accId = paymentMethod.replace('acc_', '');
    
    try {
      // Puxa transações da conta
      const q = query(collection(db, 'transactions'), where('paymentMethod', '==', paymentMethod));
      const snap = await getDocs(q);
      
      let income = 0; let expense = 0;
      snap.forEach(d => {
        const tx = d.data();
        const amt = Number(tx.amount) || 0;
        // transfer_in soma pro saldo da conta igual receita; transfer_out soma igual despesa.
        // Os totais de Receita/Despesa da família (Dashboard/Relatórios) tratam esses tipos à parte.
        if (tx.type === 'income' || tx.type === 'transfer_in') income += amt;
        else if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'invoice_payment') expense += amt;
      });

      // Salva o saldo computado na conta
      const computedBalance = income - expense;
      await setDoc(doc(db, 'accounts', accId), { computedBalance }, { merge: true });
    } catch (e) {
      console.error('Erro ao sincronizar saldo da conta:', e);
    }
  };

  const saveRecord = useCallback(
    async (record: Partial<T> & { id?: string, paymentMethod?: string }) => {
      const rec: any = { ...record };
      const previous: any = rec.id ? data.find((it: any) => String(it.id) === String(rec.id)) : undefined;
      const isNew = !previous;
      if (!rec.id) rec.id = generateId();

      const actor = session?.name || (session as any)?.username || 'Desconhecido';
      const now = new Date().toISOString();
      rec.updatedBy = actor;
      rec.updatedByUid = session?.id || null;
      rec.updatedAt = now;
      if (isNew) {
        rec.createdBy = actor;
        rec.createdByUid = session?.id || null;
        rec.createdAt = now;
      }

      queryClient.setQueryData<T[]>([collectionName], (prev = []) => {
        const idx = prev.findIndex((it: any) => String(it.id) === String(rec.id));
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = rec as unknown as T;
          return copy;
        }
        return [...prev, rec as unknown as T];
      });

      try {
        await setDoc(doc(db, collectionName, String(rec.id)), rec, { merge: true });
        
        // Gatilho da Otimização 1
        if (collectionName === 'transactions') {
          // Se a transação mudou de conta numa edição, a conta antiga também precisa ser recalculada,
          // senão o saldo dela continua contando uma transação que já não é mais dela.
          const accountsToSync = new Set<string>();
          if (rec.paymentMethod) accountsToSync.add(rec.paymentMethod);
          if (previous?.paymentMethod) accountsToSync.add(previous.paymentMethod);
          for (const pm of accountsToSync) await syncAccountBalance(pm);
        }
      } catch (e) {
        console.error(`Erro ao salvar em ${collectionName}:`, e);
        throw e;
      }
      return rec as T;
    },
    [collectionName, queryClient, data, session]
  );

  const deleteRecord = useCallback(
    async (id: string | number, paymentMethodToSync?: string) => {
      const strId = String(id);
      // Quem chama nem sempre informa a conta (parcela avulsa, assinatura). Sem ela o saldo ficava
      // desatualizado, então busca a conta da própria transação antes de apagar.
      const pmToSync = paymentMethodToSync || (data.find((it: any) => String(it.id) === strId) as any)?.paymentMethod;
      pendingDeletes.current.add(strId);

      queryClient.setQueryData<T[]>([collectionName], (prev = []) =>
        prev.filter((it: any) => String(it.id) !== strId)
      );

      try {
        await deleteDoc(doc(db, collectionName, strId));
        
        // Gatilho da Otimização 1
        if (collectionName === 'transactions' && pmToSync) {
          await syncAccountBalance(pmToSync);
        }
      } catch (e) {
        console.error(`Erro ao excluir em ${collectionName}:`, e);
        throw e;
      } finally {
        setTimeout(() => pendingDeletes.current.delete(strId), 3000);
      }
    },
    [collectionName, queryClient, data]
  );

  const deleteRecords = useCallback(
    async (ids: (string | number)[]) => {
      const strIds = ids.map(String);
      const idSet = new Set(strIds);
      const accountsToSync = new Set<string>(
        data.filter((it: any) => idSet.has(String(it.id))).map((it: any) => it.paymentMethod).filter(Boolean)
      );
      strIds.forEach((id) => pendingDeletes.current.add(id));

      queryClient.setQueryData<T[]>([collectionName], (prev = []) =>
        prev.filter((it: any) => !idSet.has(String(it.id)))
      );

      const chunkSize = 400;
      const chunks = [];
      for (let i = 0; i < strIds.length; i += chunkSize) {
        chunks.push(strIds.slice(i, i + chunkSize));
      }

      try {
        await Promise.all(
          chunks.map((chunk) => {
            const batch = writeBatch(db);
            chunk.forEach((id) => batch.delete(doc(db, collectionName, id)));
            return batch.commit();
          })
        );
        // O saldo das contas envolvidas não se recalcula sozinho ao recarregar a tela,
        // então recalcula aqui, uma vez por conta afetada.
        if (collectionName === 'transactions') {
          for (const pm of accountsToSync) await syncAccountBalance(pm);
        }
      } finally {
        setTimeout(() => strIds.forEach((id) => pendingDeletes.current.delete(id)), 3000);
      }
    },
    [collectionName, queryClient, data]
  );

  return { data, loading, error, saveRecord, deleteRecord, deleteRecords };
}
