import React from 'react';
import InfoCard from '../components/InfoCard';

export default function Home() {
  return (
    <main className="flex-1 max-w-4xl w-full mx-auto my-8 px-6">
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 shadow-lg shadow-black/20">
        <h2 className="text-2xl font-bold text-slate-100 mb-3">AI Chatbot Platform Administration</h2>
        <p className="text-slate-300 text-base leading-relaxed mb-6">
          Welcome to the AI Chatbot Platform admin shell. The project foundation has been established in accordance with Step 1 of the technical roadmap.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InfoCard
            title="Architecture Status"
            description="React + Vite frontend shell configured with Tailwind CSS. Express API foundation operational. Future administrative modules will integrate here following roadmap approvals."
          />
          <InfoCard
            title="Environment & Security"
            description="Decoupled client-server design. Zero hardcoded secrets. Strict tenant isolation architecture prepared for subsequent steps."
          />
        </div>
      </section>
    </main>
  );
}
