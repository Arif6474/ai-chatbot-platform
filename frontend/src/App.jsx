import React from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Login from '@/pages/Login';
import AdminDashboard from '@/pages/AdminDashboard';

function AppContent() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm text-slate-400">Verifying session...</span>
      </div>
    );
  }

  return (
    <>
      <Header />
      {admin ? <AdminDashboard /> : <Login />}
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans antialiased">
        <AppContent />
      </div>
    </AuthProvider>
  );
}
