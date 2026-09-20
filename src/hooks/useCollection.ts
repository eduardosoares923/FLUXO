import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../firebase';
import { generateId } from '../utils/format';

export function useCollection<T extends { id?: string }>(collectionName: string) {
  const queryClient = useQueryClient();
  const pendingDeletes = useRef<Set<string>>(new Set());

  const { data = [] } = useQuery<T[]>({
    queryKey: [collectionName],
    queryFn: () => queryClient.getQueryData<T[]>([collectionName]) ?? [],
    initialData: () => queryClient.getQueryData<T[]>([collectionName]) ?? [],
    staleTime: Infinity,
  });

  const [loading, setLoading] = useState<boolean>(() => !queryClient.getQueryData([collectionName]));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        const items: T[] = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() } as T));
        const filtered = pendingDeletes.current.size
          ? items.filter((it) => !pendingDeletes.current.has(String(it.id)))
          : items;

        queryClient.setQueryData([collectionName], filtered);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Erro de sincronização em ${collectionName}:`, err);
        setError(err as Error);
        setLoading(false);
      }
    );
    return unsub;
  }, [collectionName, queryClient]);

  const saveRecord = useCallback(
    async (record: T): Promise<T> => {
      const rec = { ...record };
      if (!rec.id) rec.id = generateId();

      queryClient.setQueryData<T[]>([collectionName], (prev = []) => {
        const idx = prev.findIndex((it) => String(it.id) === String(rec.id));
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = rec;
          return copy;
        }
        return [...prev, rec];
      });

      try {
        await setDoc(doc(db, collectionName, String(rec.id)), rec, { merge: true });
      } catch (e) {
        console.error(`Erro ao salvar em ${collectionName}:`, e);
        throw e;
      }
      return rec;
    },
    [collectionName, queryClient]
  );

  const deleteRecord = useCallback(
    async (id: string | number) => {
      const strId = String(id);
      pendingDeletes.current.add(strId);

      queryClient.setQueryData<T[]>([collectionName], (prev = []) =>
        prev.filter((it) => String(it.id) !== strId)
      );

      try {
        await deleteDoc(doc(db, collectionName, strId));
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
        prev.filter((it) => !idSet.has(String(it.id)))
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
      } finally {
        setTimeout(() => strIds.forEach((id) => pendingDeletes.current.delete(id)), 3000);
      }
    },
    [collectionName, queryClient]
  );

  return { data, loading, error, saveRecord, deleteRecord, deleteRecords };
}
