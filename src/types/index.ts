export type TransactionType = 'income' | 'expense';

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
  userId?: string;
  groupId?: string;
  installmentIndex?: number;
  totalInstallments?: number;
  installmentAmount?: number;
  totalPurchaseAmount?: number;
  invoiceMonth?: string;
  subscriptionId?: string;
  isSubscription?: boolean;
}

export interface Account {
  id?: string;
  name: string;
  balance: number;
  color: string;
  type: string;
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
