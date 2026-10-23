import React from 'react';
import { ShieldCheck, LogOut, KeyRound, Clock, UserCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import InfoCard from '@/components/InfoCard';

export default function AdminDashboard() {
  const { admin, logout } = useAuth();

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto my-8 px-6">
      <Card className="bg-slate-800 border-slate-700 shadow-xl shadow-black/20">
        <CardHeader className="p-8 pb-4 border-b border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
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
              className="border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white self-start sm:self-auto"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-8 pt-6 space-y-6">
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
                <p><span className="text-slate-500">Session Mode:</span> HTTP-Only Secure Cookie</p>
                <p><span className="text-slate-500">Password Encryption:</span> bcrypt (salt factor 12)</p>
                <p><span className="text-slate-500">API Protection:</span> requireAdminAuth middleware active</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            <InfoCard
              icon={ShieldCheck}
              title="Step 2 Complete"
              description="Admin authentication, password hashing, and session validation are verified and active."
            />
            <InfoCard
              icon={Clock}
              title="Next Roadmap Stage"
              description="Step 3 will introduce Tenant/Client Management for onboarding service businesses."
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
