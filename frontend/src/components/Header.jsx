import React from 'react';

export default function Header() {
  return (
    <header className="app-header">
      <div className="brand-wrapper">
        <h1 className="brand-title">AI Chatbot Platform</h1>
        <span className="badge">Admin Shell</span>
      </div>
      <div className="header-status">
        <span className="status-indicator"></span>
        <span>Foundation v1.0.0</span>
      </div>
    </header>
  );
}
