import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchTenants } from '@/lib/tenantApi';
import { fetchPlatformUsage, fetchTenantUsage } from '@/lib/usageApi';

function getUtcToday() {
  return new Date().toISOString().slice(0, 10);
}

function getUtcThirtyDaysAgo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 29);
  return d.toISOString().slice(0, 10);
}

export default function UsageDashboard() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('all');
  const [filterMode, setFilterMode] = useState('preset'); // 'preset' | 'custom'
  const [period, setPeriod] = useState('30d');
  const [customStartDate, setCustomStartDate] = useState(getUtcThirtyDaysAgo());
  const [customEndDate, setCustomEndDate] = useState(getUtcToday());
  const [appliedCustomRange, setAppliedCustomRange] = useState(null);
  const [dateValidationWarning, setDateValidationWarning] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [error, setError] = useState('');
  const [usageData, setUsageData] = useState(null);

  const requestId = useRef(0);
  const abortControllerRef = useRef(null);

  // Load tenants for dropdown selection
  useEffect(() => {
    let active = true;
    fetchTenants({ limit: 100 })
      .then((data) => {
        if (!active) return;
        setTenants(data.tenants || []);
      })
      .catch((err) => active && setError(err.message || 'Could not load tenants.'))
      .finally(() => active && setLoadingTenants(false));
    return () => {
      active = false;
    };
  }, []);

  const loadUsage = useCallback(async () => {
    // Abort previous in-flight request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const id = ++requestId.current;
    setLoading(true);
    setError('');

    try {
      const queryOptions = { signal: controller.signal };
      if (filterMode === 'custom' && appliedCustomRange) {
        queryOptions.startDate = appliedCustomRange.startDate;
        queryOptions.endDate = appliedCustomRange.endDate;
      } else {
        queryOptions.period = period;
      }

      let data;
      if (selectedTenantId === 'all') {
        data = await fetchPlatformUsage(queryOptions);
      } else {
        data = await fetchTenantUsage(selectedTenantId, queryOptions);
      }

      if (id === requestId.current) {
        setUsageData(data);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Request was intentionally cancelled due to new filter selection; ignore
        return;
      }
      if (id === requestId.current) {
        setError(err.message || 'Could not load usage metrics.');
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [selectedTenantId, filterMode, period, appliedCustomRange]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reload whenever active filters change
  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const handleTenantChange = (nextTenantId) => {
    setSelectedTenantId(nextTenantId);
  };

  const handlePeriodChange = (nextPeriod) => {
    setFilterMode('preset');
    setPeriod(nextPeriod);
    setAppliedCustomRange(null);
    setDateValidationWarning('');
  };

  const handleApplyCustomDates = (e) => {
    e.preventDefault();
    if (!customStartDate || !customEndDate) {
      setDateValidationWarning('Both start date and end date are required.');
      return;
    }
    if (customStartDate > customEndDate) {
      setDateValidationWarning('Start date cannot be after end date.');
      return;
    }
    setDateValidationWarning('');
    setFilterMode('custom');
    setAppliedCustomRange({
      startDate: customStartDate,
      endDate: customEndDate,
    });
  };

  const totals = usageData?.totals || {
    successfulResponses: 0,
    fallbackResponses: 0,
    totalResponses: 0,
    periodSessions: 0,
    lifetimeSessions: 0,
    totalLifetimeSessions: 0,
    fallbackRate: 0,
  };

  const dailyTrends = usageData?.dailyTrends || [];
  const tenantBreakdown = usageData?.tenantBreakdown || [];

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300">
          <span className="flex gap-2 items-center">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadUsage()}
            className="border-red-500/40 text-red-300 hover:bg-red-950/60"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Main Container Card */}
      <Card className="border-slate-700 bg-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-700/60 p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <BarChart3 className="h-5 w-5 text-blue-400" />
                Usage & Operational Analytics
              </CardTitle>
              <CardDescription className="mt-1 text-slate-400">
                Track assistant response volumes, model fallback events, active chat sessions, and service reliability.
              </CardDescription>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Tenant selector */}
              <label className="sr-only" htmlFor="usage-tenant">
                Tenant Filter
              </label>
              <select
                id="usage-tenant"
                value={selectedTenantId}
                disabled={loadingTenants}
                onChange={(e) => handleTenantChange(e.target.value)}
                className="h-9 max-w-64 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">Platform-Wide (All Tenants)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* Period Selector Pills */}
              <div className="flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
                {[
                  { label: '7D', value: '7d' },
                  { label: '30D', value: '30d' },
                  { label: '90D', value: '90d' },
                  { label: 'All', value: 'all' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handlePeriodChange(item.value)}
                    className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                      filterMode === 'preset' && period === item.value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFilterMode('custom')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    filterMode === 'custom'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Refresh button */}
              <Button
                size="icon"
                variant="outline"
                disabled={loading}
                onClick={() => loadUsage()}
                aria-label="Refresh metrics"
                className="h-9 w-9 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Custom Date Range Toolbar */}
          {filterMode === 'custom' && (
            <form
              onSubmit={handleApplyCustomDates}
              className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t border-slate-700/40 text-xs text-slate-300"
            >
              <div className="flex items-center gap-1.5 text-slate-400">
                <Filter className="h-3.5 w-3.5 text-blue-400" />
                <span>Date Range:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  max={getUtcToday()}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-white"
                  aria-label="Start date"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  max={getUtcToday()}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-white"
                  aria-label="End date"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="h-8 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500 cursor-pointer"
              >
                Apply Range
              </Button>
              {dateValidationWarning && (
                <span className="text-xs text-amber-400">{dateValidationWarning}</span>
              )}
            </form>
          )}
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {loading && !usageData ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span>Loading usage metrics…</span>
            </div>
          ) : (
            <>
              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Successful Responses */}
                <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Successful Responses</span>
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {(totals.successfulResponses ?? 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Successful model generations counted by the server
                  </p>
                </div>

                {/* 2. Model Fallbacks */}
                <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Fallback Responses</span>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-amber-300">
                    {(totals.fallbackResponses ?? 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Fallback responses handled by the server following a ModelAdapterError
                  </p>
                </div>

                {/* 3. Fallback Rate */}
                <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Fallback Rate</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {totals.fallbackRate ?? 0}%
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Fallback responses divided by total counted responses ({totals.fallbackRate ?? 0}%)
                  </p>
                </div>

                {/* 4. Chat Sessions */}
                <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <span>New Sessions (Period)</span>
                    <Users className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {(totals.periodSessions ?? 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {selectedTenantId === 'all'
                      ? `${(totals.totalLifetimeSessions ?? totals.lifetimeSessions ?? 0).toLocaleString()} currently stored sessions across all tenants`
                      : `${(totals.lifetimeSessions ?? 0).toLocaleString()} currently stored sessions for this business`}
                  </p>
                </div>
              </div>

              {/* Per-Tenant Breakdown (Shown on Platform-Wide View) */}
              {selectedTenantId === 'all' && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    Business Tenant Usage Breakdown
                  </h3>

                  {tenantBreakdown.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-slate-700/60 rounded-lg bg-slate-900/40">
                      No business tenants registered on the platform.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-700/80">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold border-b border-slate-700/80">
                          <tr>
                            <th className="px-4 py-3">Business Tenant</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Successful</th>
                            <th className="px-4 py-3 text-right">Fallbacks</th>
                            <th className="px-4 py-3 text-right">Total Responses</th>
                            <th className="px-4 py-3 text-right">Fallback Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 bg-slate-900/40 text-slate-300">
                          {tenantBreakdown.map((item) => (
                            <tr key={item.tenantId} className="hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-3 font-medium text-white">
                                {item.tenantName}
                                <span className="block text-[11px] text-slate-500 font-mono">
                                  {item.tenantSlug}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider ${
                                    item.status === 'active'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-500/15 text-slate-400'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-200">
                                {item.successfulResponses.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-amber-300">
                                {item.fallbackResponses.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-white font-semibold">
                                {item.totalResponses.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-300">
                                {item.fallbackRate}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Daily Activity Timeline */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  Daily Response Activity
                </h3>

                {dailyTrends.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-slate-700/60 rounded-lg bg-slate-900/40">
                    No daily chat response events recorded in this period. As users chat with widgets, daily aggregates will appear here.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-700/80">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold border-b border-slate-700/80">
                        <tr>
                          <th className="px-4 py-3">Date (UTC)</th>
                          <th className="px-4 py-3 text-right">Successful Responses</th>
                          <th className="px-4 py-3 text-right">Fallback Responses</th>
                          <th className="px-4 py-3 text-right">Total Responses</th>
                          <th className="px-4 py-3 text-right">New Sessions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50 bg-slate-900/40 text-slate-300">
                        {dailyTrends.map((day) => (
                          <tr key={day.date} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-slate-300">{day.date}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-400">
                              {day.successfulResponses.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-amber-400">
                              {day.fallbackResponses.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                              {day.totalResponses.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-purple-300">
                              {day.newSessions.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
