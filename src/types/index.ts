import { z } from 'zod';
import { accountSchema, cardSchema, transactionSchema, userSchema } from '../schemas/financialSchemas';

// Tipos inferidos diretamente dos schemas Zod
export type AccountInput = z.infer<typeof accountSchema>;
export type CardInput = z.infer<typeof cardSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type UserInput = z.infer<typeof userSchema>;

// Modelo de Conta
export interface Account {
  id: string;
  name: string;
  bank?: string;
  balance: number;
  owner?: string;
  color?: string;
  createdAt?: string;
}

// Modelo de Cartão de Crédito
export interface Card {
  id: string;
  name: string;
  limit: number;
  closeDay: number;
  dueDay: number;
  owner?: string;
  color?: string;
  createdAt?: string;
}

// Tipos de Transação
export type TransactionType = 'expense' | 'income' | 'transfer';

// Modelo de Transação
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // YYYY-MM-DD
  paymentMethod: string; // 'account' | `acc_${string}` | `card_${string}`
  person?: string;
  userId?: string;
  invoiceMonth?: string; // YYYY-MM para compras no cartão
  notes?: string;
  createdAt?: string;
}

// Modelo de Assinatura
export interface Subscription {
  id: string;
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly' | 'weekly';
  dueDay: number;
  paymentMethod: string;
  category?: string;
  person?: string;
  active: boolean;
  lastPaidMonth?: string;
}

// Modelo de Usuário e Sessão
export type UserRole = 'admin' | 'gerente' | 'usuario' | 'visitante';

export interface UserSession {
  id: string;
  name: string;
  username: string;
  cpf: string;
  email: string;
  avatar: string;
  role: UserRole;
  person: string;
  permissions: Record<string, string[]>;
  allowedPersons: string[] | string | null;
}
