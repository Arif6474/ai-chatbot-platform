import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Check, Loader2, Power, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchTenants } from '@/lib/tenantApi';
import { createChatbotConfiguration, fetchChatbotConfiguration, updateChatbotConfiguration, updateChatbotEnabled } from '@/lib/chatbotConfigurationApi';

const defaults = { displayName: 'Assistant', welcomeMessage: 'Hello! How can I help you today?', primaryColor: '#2563eb', position: 'bottom-right', enabled: true, fallbackMessage: '' };

export default function ChatbotConfiguration() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [form, setForm] = useState(defaults);
  const [hasConfiguration, setHasConfiguration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);
  const activeTenantId = useRef('');
  const submitInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    fetchTenants({ limit: 100 }).then((data) => {
      if (!active) return;
      setTenants(data.tenants || []);
      const firstTenantId = data.tenants?.[0]?.id || '';
      activeTenantId.current = firstTenantId;
      setTenantId(firstTenantId);
    }).catch((err) => active && setError(err.message || 'Could not load tenants.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const loadConfiguration = useCallback(async (targetTenantId = tenantId) => {
    if (!targetTenantId) return;
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const data = await fetchChatbotConfiguration(targetTenantId);
      if (id === requestId.current && activeTenantId.current === targetTenantId) {
        setForm({ ...data.configuration, fallbackMessage: data.configuration.fallbackMessage || '' });
        setHasConfiguration(true);
      }
    } catch (err) {
      if (id === requestId.current && activeTenantId.current === targetTenantId) {
        if (err.code === 'CONFIG_NOT_FOUND') { setForm(defaults); setHasConfiguration(false); }
        else setError(err.message || 'Could not load chatbot configuration.');
      }
    } finally { if (id === requestId.current && activeTenantId.current === targetTenantId) setLoading(false); }
  }, [tenantId]);

  useEffect(() => { if (tenantId) loadConfiguration(tenantId); }, [tenantId, loadConfiguration]);
  const flash = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 4000); };
  const changeTenant = (nextTenantId) => {
    requestId.current += 1;
    activeTenantId.current = nextTenantId;
    setTenantId(nextTenantId); setForm(defaults); setHasConfiguration(false); setError(''); setLoading(Boolean(nextTenantId));
  };
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const validate = () => {
    if (form.displayName.trim().length < 2 || form.displayName.trim().length > 80) return 'Display name must be 2–80 characters.';
    if (form.welcomeMessage.trim().length < 2 || form.welcomeMessage.trim().length > 500) return 'Welcome message must be 2–500 characters.';
    if (!/^#[0-9a-fA-F]{6}$/.test(form.primaryColor.trim())) return 'Primary color must be a six-digit hex value, such as #2563eb.';
    if (form.fallbackMessage.trim() && (form.fallbackMessage.trim().length < 2 || form.fallbackMessage.trim().length > 500)) return 'Fallback message must be 2–500 characters when provided.';
    return null;
  };
  const save = async (event) => {
    event.preventDefault();
    if (submitInFlight.current || saving || !tenantId) return;
    const validationError = validate();
    if (validationError) return setError(validationError);
    const targetTenantId = tenantId;
    const payload = { ...form, displayName: form.displayName.trim(), welcomeMessage: form.welcomeMessage.trim(), primaryColor: form.primaryColor.trim(), fallbackMessage: form.fallbackMessage.trim() || null };
    submitInFlight.current = true; setSaving(true); setError('');
    try {
      const data = hasConfiguration ? await updateChatbotConfiguration(targetTenantId, payload) : await createChatbotConfiguration(targetTenantId, payload);
      if (activeTenantId.current === targetTenantId) { setForm({ ...data.configuration, fallbackMessage: data.configuration.fallbackMessage || '' }); setHasConfiguration(true); flash('Chatbot configuration saved.'); }
    } catch (err) { if (activeTenantId.current === targetTenantId) setError(err.message || 'Could not save chatbot configuration.'); }
    finally { submitInFlight.current = false; setSaving(false); }
  };
  const toggleEnabled = async () => {
    if (saving) return;
    if (!hasConfiguration) return updateField('enabled', !form.enabled);
    const targetTenantId = tenantId;
    setSaving(true); setError('');
    try {
      const data = await updateChatbotEnabled(targetTenantId, !form.enabled);
      if (activeTenantId.current === targetTenantId) { updateField('enabled', data.configuration.enabled); flash(`Chatbot ${data.configuration.enabled ? 'enabled' : 'disabled'}.`); }
    } catch (err) { if (activeTenantId.current === targetTenantId) setError(err.message || 'Could not change chatbot status.'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    {notice && <div className="flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-300"><Check className="h-4 w-4" />{notice}</div>}
    {error && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300"><span className="flex gap-2"><AlertCircle className="h-4 w-4" />{error}</span>{tenantId && <Button size="sm" variant="outline" onClick={() => loadConfiguration(tenantId)} className="border-red-500/40 text-red-300">Retry</Button>}</div>}
    <Card className="border-slate-700 bg-slate-800 shadow-xl"><CardHeader className="border-b border-slate-700/60 p-6"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><CardTitle className="flex items-center gap-2 text-xl text-white"><Bot className="h-5 w-5 text-blue-400" />Chatbot configuration</CardTitle><CardDescription className="mt-1 text-slate-400">Manage the tenant’s visible chatbot settings.</CardDescription></div><div><Label htmlFor="configuration-tenant" className="sr-only">Tenant</Label><select id="configuration-tenant" value={tenantId} disabled={loading} onChange={(event) => changeTenant(event.target.value)} className="h-9 max-w-64 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:ring-2 focus:ring-blue-500"><option value="">Select a tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div></div></CardHeader>
      <CardContent className="p-6">{!tenantId ? <p className="py-8 text-center text-sm text-slate-400">Create a tenant before configuring its chatbot.</p> : loading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : <form onSubmit={save} className="space-y-5"><div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 sm:flex-row sm:items-center"><div><p className="font-medium text-white">Chatbot status</p><p className="text-sm text-slate-400">{hasConfiguration ? (form.enabled ? 'Enabled and ready to appear when the widget is introduced.' : 'Disabled for this tenant.') : 'Saved configuration defaults to enabled.'}</p></div><Button type="button" disabled={saving} onClick={toggleEnabled} className={form.enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-700'}><Power className="mr-2 h-4 w-4" />{form.enabled ? 'Enabled' : 'Disabled'}</Button></div><div className="grid gap-5 md:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="chatbot-name" className="text-slate-200">Display name</Label><Input id="chatbot-name" value={form.displayName} disabled={saving} onChange={(event) => updateField('displayName', event.target.value)} className="border-slate-700 bg-slate-900 text-white" /></div><div className="space-y-1.5"><Label htmlFor="chatbot-color" className="text-slate-200">Primary color</Label><div className="flex gap-2"><input id="chatbot-color-picker" aria-label="Choose primary color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : '#2563eb'} disabled={saving} onChange={(event) => updateField('primaryColor', event.target.value)} className="h-9 w-11 rounded border border-slate-700 bg-slate-900 p-1" /><Input id="chatbot-color" value={form.primaryColor} disabled={saving} onChange={(event) => updateField('primaryColor', event.target.value)} className="border-slate-700 bg-slate-900 text-white" /></div></div></div><div className="space-y-1.5"><Label htmlFor="chatbot-welcome" className="text-slate-200">Welcome message</Label><textarea id="chatbot-welcome" value={form.welcomeMessage} disabled={saving} onChange={(event) => updateField('welcomeMessage', event.target.value)} rows={3} className="flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500" /></div><div className="space-y-1.5"><Label htmlFor="chatbot-fallback" className="text-slate-200">Fallback message <span className="text-slate-500">(optional)</span></Label><textarea id="chatbot-fallback" value={form.fallbackMessage} disabled={saving} onChange={(event) => updateField('fallbackMessage', event.target.value)} rows={3} className="flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500" /></div><fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-200">Widget position</legend><div className="flex flex-wrap gap-4 text-sm text-slate-300"><label><input type="radio" name="position" checked={form.position === 'bottom-right'} onChange={() => updateField('position', 'bottom-right')} disabled={saving} className="mr-2 accent-blue-500" />Bottom right</label><label><input type="radio" name="position" checked={form.position === 'bottom-left'} onChange={() => updateField('position', 'bottom-left')} disabled={saving} className="mr-2 accent-blue-500" />Bottom left</label></div></fieldset><div className="flex justify-end border-t border-slate-700 pt-4"><Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{hasConfiguration ? 'Save changes' : 'Create configuration'}</Button></div></form>}</CardContent></Card>
  </div>;
}
