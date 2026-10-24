import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchTenants } from '@/lib/tenantApi';
import { fetchLeads, updateLead } from '@/lib/leadApi';
import LeadDetailsModal from './LeadDetailsModal';

const STATUS_BADGES = {
  new: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  contacted: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  qualified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function LeadManagement() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [saving, setSaving] = useState(false);

  const requestId = useRef(0);
  const selectedTenantId = useRef('');

  useEffect(() => {
    let active = true;
    fetchTenants({ limit: 100 })
      .then((data) => {
        if (!active) return;
        setTenants(data.tenants || []);
        if (data.tenants?.length) {
          selectedTenantId.current = data.tenants[0].id;
          setTenantId(data.tenants[0].id);
        }
      })
      .catch((err) => active && setError(err.message || 'Could not load tenants.'))
      .finally(() => active && setLoadingTenants(false));
    return () => {
      active = false;
    };
  }, []);

  const loadLeads = useCallback(
    async (requestedPage = pagination.page, targetTenantId = tenantId) => {
      if (!targetTenantId) return;
      const id = ++requestId.current;
      setLoading(true);
      setError('');
      try {
        const data = await fetchLeads(targetTenantId, {
          page: requestedPage,
          limit: 10,
          status,
          search: searchTerm,
        });
        if (id === requestId.current && selectedTenantId.current === targetTenantId) {
          setLeads(data.leads || []);
          setPagination(data.pagination);
        }
      } catch (err) {
        if (id === requestId.current && selectedTenantId.current === targetTenantId) {
          setError(err.message || 'Could not load leads.');
        }
      } finally {
        if (id === requestId.current && selectedTenantId.current === targetTenantId) {
          setLoading(false);
        }
      }
    },
    [tenantId, status, searchTerm, pagination.page]
  );

  useEffect(() => {
    if (tenantId) loadLeads(1);
  }, [tenantId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId);

  const changeTenant = (nextTenantId) => {
    requestId.current += 1;
    selectedTenantId.current = nextTenantId;
    setTenantId(nextTenantId);
    setSelectedLead(null);
    setLeads([]);
    setPagination({ page: 1, pages: 1, total: 0 });
    setError('');
    setLoading(Boolean(nextTenantId));
  };

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (tenantId) loadLeads(1);
  };

  const handleSaveLead = async (leadId, payload) => {
    const targetTenantId = selectedLead?.tenantId || tenantId;
    setSaving(true);
    try {
      const result = await updateLead(targetTenantId, leadId, payload);
      setSelectedLead(null);
      flash(`Lead for “${result.lead.name}” updated.`);
      if (selectedTenantId.current === targetTenantId) {
        await loadLeads(pagination.page, targetTenantId);
      }
    } catch (err) {
      setError(err.message || 'Could not update lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300">
          <span className="flex gap-2 items-center">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadLeads()}
            className="border-red-500/40 text-red-300 hover:bg-red-950/60"
          >
            Retry
          </Button>
        </div>
      )}

      <Card className="border-slate-700 bg-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-700/60 p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <Inbox className="h-5 w-5 text-blue-400" />
                Customer Leads & Enquiries
              </CardTitle>
              <CardDescription className="mt-1 text-slate-400">
                Track, qualify, and manage prospect enquiries routed from the chat widget and API.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <label className="sr-only" htmlFor="leads-tenant">
                Tenant
              </label>
              <select
                id="leads-tenant"
                value={tenantId}
                disabled={loadingTenants}
                onChange={(event) => changeTenant(event.target.value)}
                className="h-9 max-w-64 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">{loadingTenants ? 'Loading tenants…' : 'Select a tenant'}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>

              <Button
                size="icon"
                variant="outline"
                disabled={loading || !tenantId}
                onClick={() => loadLeads()}
                aria-label="Refresh leads"
                className="h-9 w-9 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!tenantId && !loadingTenants ? (
            <div className="p-12 text-center text-sm text-slate-400">
              Select a tenant above to view customer leads and enquiries.
            </div>
          ) : loading && leads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span>Loading leads…</span>
            </div>
          ) : (
            <>
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-700/60 px-6 py-3 bg-slate-800/60">
                <div className="flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs w-full sm:w-auto">
                  {['all', 'new', 'contacted', 'qualified', 'closed'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatus(value)}
                      className={`rounded px-2.5 py-1 capitalize cursor-pointer transition-colors ${
                        status === value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-60">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="Search name, email, phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9 pl-9 border-slate-700 bg-slate-900 text-xs text-white"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Filter
                  </Button>
                </form>
              </div>

              {/* Leads List */}
              {leads.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox className="mx-auto h-10 w-10 text-slate-500" />
                  <h3 className="mt-3 font-semibold text-white">
                    No leads found for {selectedTenant?.name || 'this tenant'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Prospective customer enquiries submitted via the chatbot or lead API will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {leads.map((lead) => (
                    <article
                      key={lead.id}
                      className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between hover:bg-slate-750/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-white text-base">{lead.name}</h3>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                              STATUS_BADGES[lead.status] || STATUS_BADGES.new
                            }`}
                          >
                            {lead.status}
                          </span>
                          <span className="text-xs text-slate-500 capitalize">via {lead.source}</span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          {lead.email && (
                            <span className="flex items-center gap-1.5 text-blue-400">
                              <Mail className="w-3.5 h-3.5" />
                              {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <Phone className="w-3.5 h-3.5" />
                              {lead.phone}
                            </span>
                          )}
                        </div>

                        {lead.message && (
                          <p className="line-clamp-2 text-sm text-slate-300 mt-1 italic">
                            &ldquo;{lead.message}&rdquo;
                          </p>
                        )}

                        <p className="text-[11px] text-slate-500 pt-1">
                          Received {new Date(lead.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedLead(lead)}
                          className="border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          View & Follow Up
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              {leads.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-700/60 px-6 py-4 text-xs text-slate-400">
                  <span>
                    Showing {leads.length} of {pagination.total} total leads
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={pagination.page <= 1 || loading}
                      onClick={() => loadLeads(pagination.page - 1)}
                      className="h-8 w-8 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span>
                      Page {pagination.page} of {pagination.pages}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={pagination.page >= pagination.pages || loading}
                      onClick={() => loadLeads(pagination.page + 1)}
                      className="h-8 w-8 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <LeadDetailsModal
        isOpen={selectedLead !== null}
        lead={selectedLead}
        loading={saving}
        onClose={() => !saving && setSelectedLead(null)}
        onSave={handleSaveLead}
      />
    </div>
  );
}
