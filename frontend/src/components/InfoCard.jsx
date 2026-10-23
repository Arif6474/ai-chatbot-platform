import React from 'react';

export default function InfoCard({ title, description }) {
  return (
    <div className="bg-slate-900/60 p-5 rounded-lg border border-slate-700/80">
      <h3 className="text-base font-semibold text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed m-0">{description}</p>
    </div>
  );
}
