import React from 'react';

export default function Header() {
  return (
    <header className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-white">AI Chatbot Platform</h1>
        <span className="bg-blue-500/15 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-500/30">
          Admin Shell
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span>Foundation v1.0.0</span>
      </div>
    </header>
  );
}
