import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../firebase';
import { generateId } from '../utils/format';

/**
 * Substitui a camada de sincronização de storage.js com suporte a cache global
 * do TanStack Query:
 *  - escuta a coleção em tempo real (onSnapshot)
 *  - atualiza o cache do Query com queryClient.setQueryData([collectionName], items)
 *  - salva/exclui de forma otimista no cache e no Firestore
 *  - ignora temporariamente itens excluídos para evitar ressuscitação no snapshot
 */
export function useCollection(collectionName) {
  const queryClient = useQueryClient();
  const pendingDeletes = useRef(new Set());

  // Inscrição no cache do TanStack Query
  const { data = [] } = useQuery({
    queryKey: [collectionName],
    queryFn: () => queryClient.getQueryData([collectionName]) ?? [],
    initialData: () => queryClient.getQueryData([collectionName]) ?? [],
    staleTime: Infinity,
  });

  const [loading, setLoading] = useState(() => !queryClient.getQueryData([collectionName]));
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        const filtered = pendingDeletes.current.size
          ? items.filter((it) => !pendingDeletes.current.has(String(it.id)))
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

  const saveRecord = useCallback(
    async (record) => {
      const rec = { ...record };
      if (!rec.id) rec.id = generateId();

      queryClient.setQueryData([collectionName], (prev = []) => {
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
    async (id) => {
      const strId = String(id);
      pendingDeletes.current.add(strId);

      queryClient.setQueryData([collectionName], (prev = []) =>
        prev.filter((it) => String(it.id) !== strId)
      );

      try {
        await deleteDoc(doc(db, collectionName, strId));
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
    async (ids) => {
      const strIds = ids.map(String);
      const idSet = new Set(strIds);
      strIds.forEach((id) => pendingDeletes.current.add(id));

      queryClient.setQueryData([collectionName], (prev = []) =>
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
