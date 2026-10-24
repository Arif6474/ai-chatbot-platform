import { API_BASE_URL } from './apiConfig';

const BASE_URL = `${API_BASE_URL}/api/v1/admin`;

async function handleResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'The request could not be completed.');
    error.code = payload?.error?.code || 'API_ERROR';
    throw error;
  }
  return payload.data;
}

export function fetchPlatformUsage({ period, startDate, endDate, signal } = {}) {
  const params = new URLSearchParams();
  if (startDate || endDate) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
  } else if (period) {
    params.set('period', period);
  } else {
    params.set('period', '30d');
  }

  return fetch(`${BASE_URL}/analytics/usage?${params.toString()}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal,
  }).then(handleResponse);
}

export function fetchTenantUsage(tenantId, { period, startDate, endDate, signal } = {}) {
  const params = new URLSearchParams();
  if (startDate || endDate) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
  } else if (period) {
    params.set('period', period);
  } else {
    params.set('period', '30d');
  }

  return fetch(`${BASE_URL}/tenants/${tenantId}/usage?${params.toString()}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal,
  }).then(handleResponse);
}

