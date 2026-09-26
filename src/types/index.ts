export type TransactionType = 'income' | 'expense' | 'transfer_out' | 'transfer_in' | 'invoice_payment';

export interface SplitDetail {
  person: string;
  amount: number;
}

export interface Transaction {
  id?: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  paymentMethod: string;
  person: string;
  personKeys?: string[];
  isSplit?: boolean;
  splitDetails?: SplitDetail[];
  paidBy?: string;
  userId?: string;
  groupId?: string;
  transferId?: string;
  transferAccountId?: string;
  paidCardId?: string;
  installmentIndex?: number;
  totalInstallments?: number;
  installmentAmount?: number;
  totalPurchaseAmount?: number;
  invoiceMonth?: string;
  subscriptionId?: string;
  isSubscription?: boolean;
  createdBy?: string;
  createdByUid?: string | null;
  createdAt?: string;
  updatedBy?: string;
  updatedByUid?: string | null;
  updatedAt?: string;
}

export interface Account {
  id?: string;
  name: string;
  balance: number;
  computedBalance?: number;
  color?: string;
  type?: string;
  bank?: string;
  owner?: string;
  ownerKey?: string;
}

export interface User {
  id?: string;
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'gerente' | 'viewer' | 'usuario' | string;
  person?: string;
  avatar?: string;
}

export interface Card {
  id?: string;
  name: string;
  limit: number;
  closeDay: number;
  dueDay: number;
  owner?: string;
  ownerKey?: string;
}

export interface Person {
  id?: string;
  name: string;
  personKey?: string;
}
