import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../firebase';
import { generateId } from '../utils/format';

export function useCollection<T = any>(collectionName: string) {
  const queryClient = useQueryClient();
  const pendingDeletes = useRef<Set<string>>(new Set());

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
        if (tx.type === 'income') income += amt;
        else expense += amt;
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
      const rec = { ...record };
      if (!rec.id) rec.id = generateId();

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
        if (collectionName === 'transactions' && rec.paymentMethod) {
          await syncAccountBalance(rec.paymentMethod);
        }
      } catch (e) {
        console.error(`Erro ao salvar em ${collectionName}:`, e);
        throw e;
      }
      return rec as T;
    },
    [collectionName, queryClient]
  );

  const deleteRecord = useCallback(
    async (id: string | number, paymentMethodToSync?: string) => {
      const strId = String(id);
      pendingDeletes.current.add(strId);

      queryClient.setQueryData<T[]>([collectionName], (prev = []) =>
        prev.filter((it: any) => String(it.id) !== strId)
      );

      try {
        await deleteDoc(doc(db, collectionName, strId));
        
        // Gatilho da Otimização 1
        if (collectionName === 'transactions' && paymentMethodToSync) {
          await syncAccountBalance(paymentMethodToSync);
        }
      } catch (e) {
        console.error(`Erro ao excluir em ${collectionName}:`, e);
        throw e;
      } finally {
        setTimeout(() => pendingDeletes.current.delete(strId), 3000);
      }
    },
    [collectionName, queryClient]
  );

  const deleteRecords = useCallback(
    async (ids: (string | number)[]) => {
      const strIds = ids.map(String);
      const idSet = new Set(strIds);
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
        // Nota: Como o delete em lote exclui várias transações (ex: parcelamentos), 
        // a sincronização será disparada na recarga da tela por segurança.
      } finally {
        setTimeout(() => strIds.forEach((id) => pendingDeletes.current.delete(id)), 3000);
      }
    },
    [collectionName, queryClient]
  );

  return { data, loading, error, saveRecord, deleteRecord, deleteRecords };
}
