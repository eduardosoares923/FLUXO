import React from 'react';

export function RouteLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-12 text-[#8fa39a] gap-4">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/5 rounded-full" />
        <div className="absolute w-12 h-12 border-4 border-[#e3b04b] border-t-transparent rounded-full animate-spin" />
      </div>
      <span className="text-[0.95rem] font-bold tracking-wide animate-pulse">Carregando módulo...</span>
    </div>
  );
}
export default RouteLoading;

