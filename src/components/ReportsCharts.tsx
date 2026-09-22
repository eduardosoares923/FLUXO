import React from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency } from '../utils/format';

const PIE_COLORS = ['#e3b04b', '#3b82f6', '#8b5cf6', '#10b981', '#f87171', '#06b6d4', '#f59e0b', '#ec4899'];

interface Stat { name: string; value: number; pct: number; }
interface TrendPoint { month: string; Receitas: number; Despesas: number; }

export default function ReportsCharts({
  categoryStats,
  personStats,
  selectedPerson,
  last6MonthsTrend,
}: {
  categoryStats: Stat[];
  personStats: Stat[];
  selectedPerson: string;
  last6MonthsTrend: TrendPoint[];
}) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl">
          <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-chart-pie text-[#8b5cf6]" /> Despesas por Categoria</h3>
          {categoryStats.length === 0 ? (
            <p className="text-[#8fa39a] text-center py-6">Nenhuma despesa registrada.</p>
          ) : (
            <>
            <div style={{ width: '100%', height: 220 }} className="mb-4">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categoryStats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {categoryStats.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#141d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-5">
              {categoryStats.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-sm mb-2"><span className="font-medium text-[#f2f0ea]">{cat.name}</span><span className="text-[#f2f0ea] font-mono">{formatCurrency(cat.value)} <span className="text-[#8fa39a] ml-1">({cat.pct.toFixed(1)}%)</span></span></div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] rounded-full" style={{ width: `${cat.pct}%` }} /></div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

        {selectedPerson === 'todos' && (
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl">
            <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-users text-[#10b981]" /> Distribuição por Pessoa</h3>
            {personStats.length === 0 ? (
              <p className="text-[#8fa39a] text-center py-6">Nenhuma despesa para rateio.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {personStats.map((p) => (
                  <div key={p.name}>
                    <div className="flex justify-between text-sm mb-2"><span className="font-medium text-[#f2f0ea]">{p.name}</span><span className="text-[#f2f0ea] font-mono">{formatCurrency(p.value)} <span className="text-[#8fa39a] ml-1">({p.pct.toFixed(1)}%)</span></span></div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#10b981] to-[#06b6d4] rounded-full" style={{ width: `${p.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-xl mb-8">
        <h3 className="text-xl font-bold text-[#f2f0ea] mb-6 flex items-center gap-3"><i className="fa-solid fa-chart-line text-[#e3b04b]" /> Evolução dos Últimos 6 Meses</h3>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={last6MonthsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="month" stroke="#8fa39a" fontSize={12} />
              <YAxis stroke="#8fa39a" fontSize={12} tickFormatter={(v) => formatCurrency(v).replace('R$', '')} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#141d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="Receitas" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Despesas" stroke="#f87171" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
