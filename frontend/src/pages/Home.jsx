import React from 'react';
import { Layers, ShieldCheck } from 'lucide-react';
import InfoCard from '@/components/InfoCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="flex-1 max-w-4xl w-full mx-auto my-8 px-6">
      <Card className="bg-slate-800 border-slate-700 shadow-lg shadow-black/20">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="text-2xl font-bold text-slate-100">AI Chatbot Platform Administration</CardTitle>
          <CardDescription className="text-slate-300 text-base leading-relaxed mt-2">
            Welcome to the AI Chatbot Platform admin shell. The UI design system has been configured with Tailwind CSS v4 and shadcn/ui components in preparation for Step 2.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InfoCard
              icon={Layers}
              title="Design System Status"
              description="shadcn/ui component primitives (Button, Input, Label, Card) configured with Tailwind CSS v4 and Lucide React icons. Path alias @/ operational."
            />
            <InfoCard
              icon={ShieldCheck}
              title="Security & Isolation"
              description="Decoupled client-server design. Zero hardcoded secrets. Strict tenant isolation architecture prepared for Step 2 authentication."
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
