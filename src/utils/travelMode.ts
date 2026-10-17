import { useState, useEffect, useCallback } from 'react';

export interface TripCurrency {
  code: 'USD' | 'EUR' | 'ARS' | 'GBP' | 'JPY';
  symbol: string;
  label: string;
  country: string;
  defaultRate: number;
}

export const TRIP_CURRENCIES: TripCurrency[] = [
  { code: 'USD', symbol: 'US$', label: 'Dólar (US$)', country: 'Estados Unidos', defaultRate: 5.40 },
  { code: 'EUR', symbol: '€', label: 'Euro (€)', country: 'Zona do euro', defaultRate: 6.30 },
  { code: 'ARS', symbol: 'ARS', label: 'Peso argentino (ARS)', country: 'Argentina', defaultRate: 0.005 },
  { code: 'GBP', symbol: '£', label: 'Libra (£)', country: 'Reino Unido', defaultRate: 7.20 },
  { code: 'JPY', symbol: '¥', label: 'Iene (¥)', country: 'Japão', defaultRate: 0.036 },
];

export interface TripState {
  enabled: boolean;
  destination: string;
  code: 'USD' | 'EUR' | 'ARS' | 'GBP' | 'JPY';
  rate: number;
  start: string;
  end: string;
  pauseFixed: boolean;
  tagOn: boolean;
  updatedAt?: string;
}

const STORAGE_KEY = 'wynd_trip';
const EVENT_NAME = 'wynd_trip_change';

export const DEFAULT_TRIP_STATE: TripState = {
  enabled: false,
  destination: '',
  code: 'USD',
  rate: 5.40,
  start: '',
  end: '',
  pauseFixed: true,
  tagOn: true,
  updatedAt: '',
};

export function readTripState(): TripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TRIP_STATE };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      destination: typeof parsed.destination === 'string' ? parsed.destination : '',
      code: TRIP_CURRENCIES.some((c) => c.code === parsed.code) ? parsed.code : 'USD',
      rate: Number(parsed.rate) > 0 ? Number(parsed.rate) : 5.40,
      start: typeof parsed.start === 'string' ? parsed.start : '',
      end: typeof parsed.end === 'string' ? parsed.end : '',
      pauseFixed: parsed.pauseFixed !== undefined ? Boolean(parsed.pauseFixed) : true,
      tagOn: parsed.tagOn !== undefined ? Boolean(parsed.tagOn) : true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { ...DEFAULT_TRIP_STATE };
  }
}

export function saveTripState(next: TripState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    }
  } catch {
    // Ignora falha de localStorage em modo privado restrito
  }
}

export function isTripActive(trip: TripState, dateStr?: string): boolean {
  if (!trip.enabled) return false;
  const today = dateStr || new Date().toISOString().slice(0, 10);
  if (trip.start && today < trip.start) return false;
  if (trip.end && today > trip.end) return false;
  return true;
}

export function formatTripRate(rate: number): string {
  const num = Number(rate) || 0;
  const decimals = num > 0 && num < 0.1 ? 4 : 2;
  return `R$ ${num.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function getTripCurrencySymbol(code?: string): string {
  const found = TRIP_CURRENCIES.find((c) => c.code === code);
  return found ? found.symbol : code || 'US$';
}

export async function fetchExchangeRateToBRL(code: string): Promise<number> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(code)}`);
  if (!res.ok) {
    throw new Error('Não foi possível consultar a cotação agora.');
  }
  const data = await res.json();
  const brl = Number(data?.rates?.BRL);
  if (!Number.isFinite(brl) || brl <= 0) {
    throw new Error('Cotação inválida retornada pelo servidor.');
  }
  return brl < 0.1 ? Number(brl.toFixed(4)) : Number(brl.toFixed(2));
}

export function useTripState() {
  const [trip, setTrip] = useState<TripState>(() => readTripState());

  useEffect(() => {
    const handleUpdate = () => setTrip(readTripState());
    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updateTrip = useCallback((updater: Partial<TripState> | ((prev: TripState) => TripState)) => {
    const current = readTripState();
    const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    saveTripState(next);
    setTrip(next);
  }, []);

  return { trip, updateTrip, isActive: isTripActive(trip) };
}
