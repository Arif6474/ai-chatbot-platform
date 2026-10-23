import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ContentModal({ isOpen, content, loading, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: '', body: '', status: 'draft' });
  const [errors, setErrors] = useState({});
  const submitting = useRef(false);

  useEffect(() => {
    setForm({ title: content?.title || '', body: content?.body || '', status: content?.status || 'draft' });
    setErrors({});
  }, [content, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;
  const change = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: null })); };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || loading) return;
    const nextErrors = {};
    if (form.title.trim().length < 2 || form.title.trim().length > 150) nextErrors.title = 'Title must be 2–150 characters.';
    if (form.body.trim().length < 5 || form.body.trim().length > 10000) nextErrors.body = 'Body must be 5–10,000 characters.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);
    submitting.current = true;
    try {
      await onSubmit({ title: form.title.trim(), body: form.body.trim(), status: form.status });
    } finally {
      submitting.current = false;
    }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="content-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <form onSubmit={submit} className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-5">
      <div className="flex items-start justify-between gap-4"><div><h2 id="content-modal-title" className="flex items-center gap-2 text-lg font-semibold text-white"><FileText className="h-5 w-5 text-blue-400" />{content ? 'Edit content' : 'Create content'}</h2><p className="mt-1 text-xs text-slate-400">Drafts remain unavailable until published.</p></div><button type="button" aria-label="Close dialog" disabled={loading} onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"><X className="h-4 w-4" /></button></div>
      <div className="space-y-1.5"><Label htmlFor="content-title" className="text-slate-200">Title</Label><Input id="content-title" value={form.title} disabled={loading} onChange={(event) => change('title', event.target.value)} className="border-slate-700 bg-slate-900 text-white" autoFocus />{errors.title && <p className="text-xs text-red-400">{errors.title}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="content-body" className="text-slate-200">Content</Label><textarea id="content-body" value={form.body} disabled={loading} onChange={(event) => change('body', event.target.value)} rows={10} className="flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />{errors.body && <p className="text-xs text-red-400">{errors.body}</p>}</div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-200">Publication status</legend><div className="flex gap-4 text-sm text-slate-300"><label><input type="radio" checked={form.status === 'draft'} onChange={() => change('status', 'draft')} disabled={loading} className="mr-2 accent-blue-500" />Draft</label><label><input type="radio" checked={form.status === 'published'} onChange={() => change('status', 'published')} disabled={loading} className="mr-2 accent-emerald-500" />Published</label></div></fieldset>
      <div className="flex justify-end gap-3 border-t border-slate-700 pt-4"><Button type="button" variant="outline" disabled={loading} onClick={onClose} className="border-slate-700 text-slate-300">Cancel</Button><Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{content ? 'Save changes' : 'Create draft'}</Button></div>
    </form>
  </div>;
}
