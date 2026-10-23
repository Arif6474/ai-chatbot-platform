import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  RotateCw,
  Edit2,
  Power,
  Globe,
  Mail,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import TenantModal from './TenantModal';
import StatusConfirmModal from './StatusConfirmModal';
import {
  fetchTenants,
  createTenant,
  updateTenant,
  updateTenantStatus,
} from '@/lib/tenantApi';

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Active request ref to prevent stale response race conditions
  const activeRequestId = React.useRef(0);

  // Modals state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Confirm modal state
  const [confirmModalData, setConfirmModalData] = useState(null); // { tenant, targetStatus } | null
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Debounce search input (300ms) to avoid request thrashing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load tenants
  const loadTenants = useCallback(async () => {
    const currentId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTenants({
        page,
        limit: 10,
        search: debouncedSearch,
        status: statusFilter,
      });
      if (currentId === activeRequestId.current) {
        setTenants(data.tenants || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 10, pages: 1 });
      }
    } catch (err) {
      if (currentId === activeRequestId.current) {
        setError(err.message || 'Failed to load business tenants');
      }
    } finally {
      if (currentId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Flash message helper
  function flashSuccess(msg) {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  }

  // Handle Search input change
  function handleSearchChange(e) {
    setSearchInput(e.target.value);
  }

  // Handle Status filter change with page reset
  function handleStatusChange(status) {
    setStatusFilter(status);
    setPage(1);
  }

  // Open Create Modal
  function handleOpenCreate() {
    setSelectedTenant(null);
    setModalMode('create');
  }

  // Open Edit Modal
  function handleOpenEdit(tenant) {
    setSelectedTenant(tenant);
    setModalMode('edit');
  }

  // Handle Create or Edit Submit
  async function handleModalSubmit(payload) {
    setModalLoading(true);
    try {
      if (modalMode === 'create') {
        const res = await createTenant(payload);
        flashSuccess(`Tenant "${res.tenant.name}" created successfully.`);
      } else if (modalMode === 'edit' && selectedTenant) {
        const res = await updateTenant(selectedTenant.id, payload);
        flashSuccess(`Tenant "${res.tenant.name}" updated successfully.`);
      }
      setModalMode(null);
      setSelectedTenant(null);
      await loadTenants();
    } finally {
      setModalLoading(false);
    }
  }

  // Open Status Confirm Modal
  function handleOpenStatusConfirm(tenant) {
    const targetStatus = tenant.status === 'active' ? 'inactive' : 'active';
    setConfirmModalData({ tenant, targetStatus });
  }

  // Confirm Status change
  async function handleConfirmStatusChange() {
    if (!confirmModalData) return;
    const { tenant, targetStatus } = confirmModalData;
    setConfirmLoading(true);
    try {
      await updateTenantStatus(tenant.id, targetStatus);
      flashSuccess(
        `Tenant "${tenant.name}" ${targetStatus === 'active' ? 'activated' : 'deactivated'} successfully.`
      );
      setConfirmModalData(null);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to update tenant status');
    } finally {
      setConfirmLoading(false);
    }
  }

  // Quick stats computed from current view
  const activeCount = useMemo(
    () => tenants.filter((t) => t.status === 'active').length,
    [tenants]
  );
  const inactiveCount = useMemo(
    () => tenants.filter((t) => t.status === 'inactive').length,
    [tenants]
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Flash Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-emerald-300 text-sm animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3.5 bg-red-950/40 border border-red-500/40 rounded-lg text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadTenants}
            className="border-red-500/40 hover:bg-red-900/30 text-red-300 text-xs h-7 px-2.5"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Overview Stat Cards & Create Action */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-800/80 border-slate-700/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Tenants</p>
              <h4 className="text-2xl font-bold text-white mt-1">{pagination.total}</h4>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 border-slate-700/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Active (Current Page)</p>
              <h4 className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</h4>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 border-slate-700/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Inactive (Current Page)</p>
              <h4 className="text-2xl font-bold text-slate-400 mt-1">{inactiveCount}</h4>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-700/30 text-slate-400 border border-slate-700">
              <PauseCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center">
          <Button
            onClick={handleOpenCreate}
            className="w-full h-full min-h-[76px] bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Create New Tenant</span>
          </Button>
        </div>
      </div>

      {/* Main Tenant Management Card */}
      <Card className="bg-slate-800 border-slate-700 shadow-xl">
        <CardHeader className="p-6 pb-4 border-b border-slate-700/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <span>Business Tenants</span>
                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
                  {pagination.total} registered
                </span>
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-1">
                Manage business accounts, URL slug identifiers, status, and metadata.
              </CardDescription>
            </div>

            {/* Search and Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder="Search by name or slug..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="pl-9 h-9 text-xs bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              {/* Status filter buttons */}
              <div className="inline-flex rounded-md p-0.5 bg-slate-900/70 border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => handleStatusChange('all')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('active')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    statusFilter === 'active'
                      ? 'bg-emerald-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('inactive')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    statusFilter === 'inactive'
                      ? 'bg-slate-700 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Inactive
                </button>
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={loadTenants}
                disabled={loading}
                className="h-9 w-9 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                title="Refresh tenant list"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Loading state */}
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-400">Loading business tenants...</p>
            </div>
          ) : tenants.length === 0 ? (
            /* Empty State */
            <div className="p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto text-slate-400 border border-slate-700">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-white">No tenants found</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchInput || statusFilter !== 'all'
                    ? 'No tenants match your active search and status filter criteria.'
                    : 'Get started by creating your first service-business tenant.'}
                </p>
              </div>
              <div>
                {searchInput || statusFilter !== 'all' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchInput('');
                      setDebouncedSearch('');
                      setStatusFilter('all');
                      setPage(1);
                    }}
                    className="border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
                  >
                    Clear Filters
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleOpenCreate}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create Tenant
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Tenant Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/60 bg-slate-900/40 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-6">Business / Slug</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Contact & Website</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40 text-slate-300">
                  {tenants.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="hover:bg-slate-750/30 transition-colors"
                    >
                      {/* Name & Slug */}
                      <td className="py-3.5 px-6">
                        <div className="font-semibold text-sm text-white">
                          {tenant.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-800/30">
                            {tenant.slug}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 text-slate-300">
                        {tenant.businessType ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-700/50 text-slate-300 border border-slate-700">
                            {tenant.businessType}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Uncategorized</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {tenant.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Contact & Website */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {tenant.contactEmail ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-300">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{tenant.contactEmail}</span>
                            </div>
                          ) : (
                            <div className="text-slate-500 text-[11px] italic">No email</div>
                          )}

                          {tenant.websiteUrl ? (
                            <a
                              href={tenant.websiteUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              <Globe className="w-3 h-3" />
                              <span className="truncate max-w-[150px]">
                                {tenant.websiteUrl.replace(/^https?:\/\//, '')}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : null}
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(tenant.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(tenant)}
                            className="h-8 px-2.5 text-slate-300 hover:text-white hover:bg-slate-700/60 text-xs"
                            title="Edit Tenant"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            <span>Edit</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenStatusConfirm(tenant)}
                            className={`h-8 px-2.5 text-xs ${
                              tenant.status === 'active'
                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/30'
                                : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30'
                            }`}
                            title={
                              tenant.status === 'active'
                                ? 'Deactivate Tenant'
                                : 'Activate Tenant'
                            }
                          >
                            <Power className="w-3.5 h-3.5 mr-1" />
                            <span>{tenant.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-700/60 bg-slate-900/30 text-xs text-slate-400">
              <div>
                Showing{' '}
                <span className="font-medium text-slate-200">
                  {(pagination.page - 1) * pagination.limit + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium text-slate-200">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{' '}
                of <span className="font-medium text-slate-200">{pagination.total}</span> tenants
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1 || loading}
                  className="h-7 px-2 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Previous
                </Button>

                <span className="px-2 font-medium text-slate-300">
                  Page {pagination.page} of {pagination.pages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={pagination.page >= pagination.pages || loading}
                  className="h-7 px-2 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tenant Create / Edit Modal */}
      <TenantModal
        isOpen={modalMode !== null}
        mode={modalMode || 'create'}
        tenant={selectedTenant}
        onClose={() => {
          setModalMode(null);
          setSelectedTenant(null);
        }}
        onSubmit={handleModalSubmit}
        loading={modalLoading}
      />

      {/* Status Confirm Modal */}
      <StatusConfirmModal
        isOpen={confirmModalData !== null}
        tenant={confirmModalData?.tenant}
        targetStatus={confirmModalData?.targetStatus}
        onClose={() => setConfirmModalData(null)}
        onConfirm={handleConfirmStatusChange}
        loading={confirmLoading}
      />
    </div>
  );
}
