import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Home from '@/pages/Home';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans antialiased">
      <Header />
      <Home />
      <Footer />
    </div>
  );
}
