import { z } from 'zod';

export const accountSchema = z.object({
  name: z.string().trim().min(1, 'Nome da conta é obrigatório'),
  bank: z.string().trim().optional().default(''),
  balance: z.coerce.number({ invalid_type_error: 'Saldo deve ser numérico' }).default(0),
  owner: z.string().trim().optional().default(''),
});

export const cardSchema = z.object({
  name: z.string().trim().min(1, 'Nome do cartão é obrigatório'),
  limit: z.coerce.number({ invalid_type_error: 'Limite deve ser numérico' }).min(0, 'Limite não pode ser negativo').default(0),
  closeDay: z.coerce.number({ invalid_type_error: 'Dia deve ser numérico' }).int().min(1, 'Dia entre 1 e 31').max(31, 'Dia entre 1 e 31').default(28),
  dueDay: z.coerce.number({ invalid_type_error: 'Dia deve ser numérico' }).int().min(1, 'Dia entre 1 e 31').max(31, 'Dia entre 1 e 31').default(10),
  owner: z.string().trim().optional().default(''),
});

export const transactionSchema = z.object({
  description: z.string().trim().min(1, 'Descrição é obrigatória'),
  amount: z.coerce.number({ invalid_type_error: 'Valor deve ser numérico' }).gt(0, 'Valor deve ser maior que zero'),
  type: z.enum(['expense', 'income', 'transfer']).default('expense'),
  category: z.string().trim().optional().default(''),
  date: z.string().min(1, 'Data é obrigatória'),
  paymentMethod: z.string().min(1, 'Forma de pagamento é obrigatória'),
  person: z.string().trim().optional().default(''),
});

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  username: z
    .string()
    .trim()
    .min(3, 'Nome de usuário deve ter pelo menos 3 caracteres')
    .regex(/^\S+$/, 'Nome de usuário não pode conter espaços'),
  email: z.string().trim().email('E-mail inválido'),
  cpf: z.string().trim().optional().default(''),
  password: z.string().optional().default(''),
  role: z.enum(['admin', 'gerente', 'usuario', 'visitante']).default('usuario'),
  person: z.string().trim().optional().default(''),
});

export const subscriptionSchema = z.object({
  name: z.string().trim().min(1, 'Nome da assinatura é obrigatório'),
  amount: z.coerce.number({ invalid_type_error: 'Valor deve ser numérico' }).gt(0, 'Valor deve ser maior que zero'),
  billingDay: z.coerce.number({ invalid_type_error: 'Dia deve ser numérico' }).int().min(1, 'Dia entre 1 e 31').max(31, 'Dia entre 1 e 31').default(10),
  category: z.string().trim().optional().default('Assinaturas'),
  paymentMethod: z.string().min(1, 'Forma de pagamento é obrigatória'),
  person: z.string().trim().optional().default(''),
});
