import React, { useState } from 'react';
import { ShieldCheck, LogOut, KeyRound, Clock, UserCheck, Building2, CheckCircle2, FileText, Bot } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import InfoCard from '@/components/InfoCard';
import TenantManagement from '@/components/tenants/TenantManagement';
import ContentManagement from '@/components/content/ContentManagement';
import ChatbotConfiguration from '@/components/chatbot/ChatbotConfiguration';

export default function AdminDashboard() {
  const { admin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('tenants');

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto my-8 px-4 sm:px-6 space-y-6">
      {/* Top Header Card */}
      <Card className="bg-slate-800 border-slate-700 shadow-xl shadow-black/20">
        <CardHeader className="p-6 sm:p-8 pb-4 border-b border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Session Active
                </span>
              </div>
              <CardTitle className="text-2xl font-bold text-white">
                Admin Console
              </CardTitle>
              <CardDescription className="text-slate-300 text-sm mt-1">
                Authenticated as <span className="font-medium text-blue-400">{admin?.email}</span>
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white self-start sm:self-auto cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 pt-4 border-t border-slate-700/50 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('chatbot')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'chatbot'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Chatbot Configuration</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('content')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'content'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Content Management</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tenants')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'tenants'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Tenant Management</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'system'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>System & Security</span>
            </button>
          </div>
        </CardHeader>
      </Card>

      {/* Tab Content */}
      {activeTab === 'tenants' ? <TenantManagement /> : activeTab === 'content' ? <ContentManagement /> : activeTab === 'chatbot' ? <ChatbotConfiguration /> : (
        <Card className="bg-slate-800 border-slate-700 shadow-xl shadow-black/20">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 p-5 rounded-lg border border-slate-700/80 space-y-2">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <span>Account Details</span>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <p><span className="text-slate-500">Admin ID:</span> {admin?.id}</p>
                  <p><span className="text-slate-500">Role:</span> {admin?.role}</p>
                  <p><span className="text-slate-500">Status:</span> {admin?.status}</p>
                </div>
              </div>

              <div className="bg-slate-900/60 p-5 rounded-lg border border-slate-700/80 space-y-2">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>Security State</span>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <p><span className="text-slate-500">Session Mode:</span> HTTP-Only Secure Cookie (HS256)</p>
                  <p><span className="text-slate-500">Password Encryption:</span> bcrypt (salt factor 12)</p>
                  <p><span className="text-slate-500">API Protection:</span> requireAdminAuth middleware active</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <InfoCard
                icon={CheckCircle2}
                title="Step 3 Complete"
                description="Business Tenant Management is implemented with strict authentication, slug validation, auditable status toggles, and mass assignment protection."
              />
              <InfoCard
                icon={Clock}
                title="Content Management"
                description="Step 4 provides tenant-scoped drafts and published business knowledge records."
              />
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
