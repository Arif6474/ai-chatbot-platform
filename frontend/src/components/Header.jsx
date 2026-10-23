import React from 'react';
import { Bot } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
          <Bot className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">AI Chatbot Platform</h1>
        <span className="bg-blue-500/15 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-500/30">
          Admin Shell
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span>Foundation v1.0.0</span>
      </div>
    </header>
  );
}
