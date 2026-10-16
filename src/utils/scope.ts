import { and, or, query, where, collection, Query, QueryFieldFilterConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

export const SCOPED_COLLECTIONS = new Set([
  'transactions',
  'accounts',
  'cards',
  'subscriptions',
  'paidInvoices',
  'reminders',
  'goals',
  'settlements',
  'tags',
]);

export function scopedQuery(
  name: string,
  session: User | null,
  extra: QueryFieldFilterConstraint[] = []
): Query {
  const col = collection(db, name);

  if (name === 'users') {
    if (session?.familyId && !session.superAdmin) {
      return query(col, where('familyId', '==', session.familyId), ...extra);
    }
    return extra.length > 0 ? query(col, ...extra) : col;
  }

  if (!session || !session.familyId || !SCOPED_COLLECTIONS.has(name)) {
    return extra.length > 0 ? query(col, ...extra) : col;
  }

  if (session.id === session.familyId) {
    return query(col, where('familyId', '==', session.familyId), ...extra);
  }

  return query(
    col,
    and(
      where('familyId', '==', session.familyId),
      or(
        where('ownerUid', '==', session.id),
        where('sharedWith', 'array-contains', session.id)
      ),
      ...extra
    )
  );
}
