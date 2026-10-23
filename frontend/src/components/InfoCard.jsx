import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function InfoCard({ icon: Icon, title, description }) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/80 transition-all hover:border-slate-600">
      <CardHeader className="p-5 pb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-blue-400 shrink-0" />}
          <CardTitle className="text-base font-semibold text-slate-100">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <p className="text-sm text-slate-400 leading-relaxed m-0">{description}</p>
      </CardContent>
    </Card>
  );
}
