import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, FileText, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchTenants } from '@/lib/tenantApi';
import { createContent, fetchContent, updateContent, updateContentStatus } from '@/lib/contentApi';
import ContentModal from './ContentModal';

export default function ContentManagement() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [contents, setContents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('all');
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalContent, setModalContent] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const requestId = useRef(0);
  const selectedTenantId = useRef('');

  useEffect(() => {
    let active = true;
    fetchTenants({ limit: 100 }).then((data) => {
      if (!active) return;
      setTenants(data.tenants || []);
      if (data.tenants?.length) {
        selectedTenantId.current = data.tenants[0].id;
        setTenantId(data.tenants[0].id);
      }
    }).catch((err) => active && setError(err.message || 'Could not load tenants.')).finally(() => active && setLoadingTenants(false));
    return () => { active = false; };
  }, []);

  const loadContent = useCallback(async (requestedPage = pagination.page, targetTenantId = tenantId) => {
    if (!targetTenantId) return;
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const data = await fetchContent(targetTenantId, { page: requestedPage, limit: 10, status });
      if (id === requestId.current && selectedTenantId.current === targetTenantId) { setContents(data.contents || []); setPagination(data.pagination); }
    } catch (err) { if (id === requestId.current && selectedTenantId.current === targetTenantId) setError(err.message || 'Could not load content.'); }
    finally { if (id === requestId.current && selectedTenantId.current === targetTenantId) setLoading(false); }
  }, [tenantId, status, pagination.page]);

  useEffect(() => { if (tenantId) loadContent(1); }, [tenantId, status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!confirming) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && !saving && setConfirming(null);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirming, saving]);
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId);
  const changeTenant = (nextTenantId) => {
    requestId.current += 1;
    selectedTenantId.current = nextTenantId;
    setTenantId(nextTenantId);
    setContents([]);
    setPagination({ page: 1, pages: 1, total: 0 });
    setError('');
    setLoading(Boolean(nextTenantId));
  };
  const flash = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 4000); };
  const save = async (payload) => {
    const targetTenantId = tenantId;
    setSaving(true);
    try {
      const result = modalContent ? await updateContent(targetTenantId, modalContent.id, payload) : await createContent(targetTenantId, payload);
      setModalContent(undefined); flash(`“${result.content.title}” saved.`);
      if (selectedTenantId.current === targetTenantId) await loadContent(undefined, targetTenantId);
    } catch (err) { setError(err.message || 'Could not save content.'); }
    finally { setSaving(false); }
  };
  const updateStatus = async () => {
    if (!confirming) return;
    const targetTenantId = tenantId;
    setSaving(true);
    try { await updateContentStatus(targetTenantId, confirming.id, confirming.targetStatus); setConfirming(null); flash(`Content ${confirming.targetStatus}.`); if (selectedTenantId.current === targetTenantId) await loadContent(undefined, targetTenantId); }
    catch (err) { setError(err.message || 'Could not update publication status.'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    {notice && <div className="flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-300"><Check className="h-4 w-4" />{notice}</div>}
    {error && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300"><span className="flex gap-2"><AlertCircle className="h-4 w-4" />{error}</span><Button size="sm" variant="outline" onClick={() => loadContent()} className="border-red-500/40 text-red-300">Retry</Button></div>}
    <Card className="border-slate-700 bg-slate-800 shadow-xl"><CardHeader className="border-b border-slate-700/60 p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><CardTitle className="flex items-center gap-2 text-xl text-white"><FileText className="h-5 w-5 text-blue-400" />Business knowledge</CardTitle><CardDescription className="mt-1 text-slate-400">Create tenant-specific facts for future chatbot retrieval.</CardDescription></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="content-tenant">Tenant</label><select id="content-tenant" value={tenantId} disabled={loadingTenants} onChange={(event) => changeTenant(event.target.value)} className="h-9 max-w-64 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:ring-2 focus:ring-blue-500"><option value="">{loadingTenants ? 'Loading tenants…' : 'Select a tenant'}</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select><Button disabled={!tenantId} onClick={() => setModalContent(null)} className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />Create content</Button></div></div></CardHeader>
      <CardContent className="p-0">{!tenantId && !loadingTenants ? <div className="p-12 text-center text-sm text-slate-400">Create a tenant before adding business knowledge.</div> : loading ? <div className="flex flex-col items-center gap-3 p-12 text-slate-400"><Loader2 className="h-8 w-8 animate-spin text-blue-500" />Loading content…</div> : contents.length === 0 ? <div className="p-12 text-center"><FileText className="mx-auto h-10 w-10 text-slate-500" /><h3 className="mt-3 font-semibold text-white">No content for {selectedTenant?.name || 'this tenant'}</h3><p className="mt-1 text-sm text-slate-400">Add a draft when business information is ready.</p></div> : <><div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-3"><div className="flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">{['all', 'draft', 'published'].map((value) => <button key={value} onClick={() => setStatus(value)} className={`rounded px-2.5 py-1 capitalize ${status === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{value}</button>)}</div><Button size="icon" variant="outline" disabled={loading} onClick={() => loadContent()} aria-label="Refresh content" className="h-8 w-8 border-slate-700 text-slate-300"><RefreshCw className="h-3.5 w-3.5" /></Button></div><div className="divide-y divide-slate-700/50">{contents.map((content) => <article key={content.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-white">{content.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${content.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{content.status}</span></div><p className="mt-1 line-clamp-2 text-sm text-slate-400">{content.body}</p><p className="mt-2 text-xs text-slate-500">Updated {new Date(content.updatedAt).toLocaleDateString()}</p></div><div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => setModalContent(content)} className="border-slate-700 text-slate-300"><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button size="sm" onClick={() => setConfirming({ ...content, targetStatus: content.status === 'published' ? 'draft' : 'published' })} className={content.status === 'published' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}>{content.status === 'published' ? 'Unpublish' : 'Publish'}</Button></div></article>)}</div><div className="flex items-center justify-end gap-3 px-6 py-4 text-sm text-slate-400"><span>{pagination.total} total</span><Button size="icon" variant="outline" disabled={pagination.page <= 1} onClick={() => loadContent(pagination.page - 1)} className="h-8 w-8 border-slate-700"><ChevronLeft className="h-4 w-4" /></Button><span>{pagination.page} / {pagination.pages}</span><Button size="icon" variant="outline" disabled={pagination.page >= pagination.pages} onClick={() => loadContent(pagination.page + 1)} className="h-8 w-8 border-slate-700"><ChevronRight className="h-4 w-4" /></Button></div></>}</CardContent></Card>
    <ContentModal isOpen={modalContent !== undefined} content={modalContent} loading={saving} onClose={() => !saving && setModalContent(undefined)} onSubmit={save} />
    {confirming && <div role="dialog" aria-modal="true" aria-labelledby="publication-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md space-y-5 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"><h2 id="publication-confirm-title" className="text-lg font-semibold text-white">{confirming.targetStatus === 'published' ? 'Publish content?' : 'Unpublish content?'}</h2><p className="text-sm text-slate-300">{confirming.targetStatus === 'published' ? 'Publishing makes this record available to the future knowledge pipeline.' : 'Unpublishing returns this record to draft.'}</p><div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setConfirming(null)} className="border-slate-700 text-slate-300">Cancel</Button><Button disabled={saving} onClick={updateStatus} className="bg-blue-600 hover:bg-blue-700">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm</Button></div></div></div>}
  </div>;
}
