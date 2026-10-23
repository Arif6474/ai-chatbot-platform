import React from 'react';

export default function Home() {
  return (
    <main className="main-content">
      <section className="card">
        <h2>AI Chatbot Platform Administration</h2>
        <p>
          Welcome to the AI Chatbot Platform admin shell. The project foundation has been established in accordance with Step 1 of the technical roadmap.
        </p>

        <div className="grid-2">
          <div className="info-item">
            <h3>Architecture Status</h3>
            <p>
              React + Vite frontend shell configured. Express API foundation operational. Future administrative modules will integrate here following roadmap approvals.
            </p>
          </div>

          <div className="info-item">
            <h3>Environment & Security</h3>
            <p>
              Decoupled client-server design. Zero hardcoded secrets. Strict tenant isolation architecture prepared for subsequent steps.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
