import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { formatCurrency, formatDate } from '../utils/format';
import { Transaction, User } from '../types';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const { canAccessPerson } = useAuth() as { canAccessPerson: any };
  const { data: transactions } = useCollection<Transaction>('transactions');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return transactions
      .filter((tx) => canAccessPerson(tx.person, tx))
      .filter(
        (tx) =>
          tx.description?.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q) ||
          tx.person?.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [query, transactions, canAccessPerson]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#141d1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <i className="fa-solid fa-magnifying-glass text-[#8fa39a]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar transação por descrição, categoria ou pessoa..."
            className="flex-1 bg-transparent outline-none text-white placeholder:text-[#5c6b66]"
          />
          <button onClick={onClose} className="text-[#8fa39a] hover:text-white">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="p-6 text-center text-sm text-[#5c6b66]">Digite pelo menos 2 letras pra buscar.</p>
          )}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="p-6 text-center text-sm text-[#5c6b66]">Nenhuma transação encontrada pra "{query}".</p>
          )}
          {results.map((tx) => (
            <button
              key={tx.id}
              onClick={() => {
                onClose();
                navigate('/transactions');
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 text-left border-b border-white/5 last:border-0"
            >
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{tx.description}</div>
                <div className="text-xs text-[#8fa39a]">
                  {formatDate(tx.date)} &bull; {tx.category} &bull; {tx.person}
                </div>
              </div>
              <div className={`font-mono font-bold shrink-0 ${tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-white/10 text-[10px] text-[#5c6b66] flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-white/5 rounded">Esc</kbd> pra fechar
        </div>
      </div>
    </div>
  );
}

export default GlobalSearch;
