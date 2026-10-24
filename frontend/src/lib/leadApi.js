import { API_BASE_URL } from './apiConfig';

const BASE_URL = `${API_BASE_URL}/api/v1/admin/tenants`;

async function handleResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'The request could not be completed.');
    error.code = payload?.error?.code || 'API_ERROR';
    throw error;
  }
  return payload.data;
}

function request(tenantId, path = '', options = {}) {
  return fetch(`${BASE_URL}/${tenantId}/leads${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }).then(handleResponse);
}

export function fetchLeads(tenantId, { page = 1, limit = 10, status = '', search = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status && status !== 'all') params.set('status', status);
  if (search && search.trim()) params.set('search', search.trim());
  return request(tenantId, `?${params}`);
}

export function fetchLeadById(tenantId, leadId) {
  return request(tenantId, `/${leadId}`);
}

export function updateLead(tenantId, leadId, payload) {
  return request(tenantId, `/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateLeadStatus(tenantId, leadId, status) {
  return request(tenantId, `/${leadId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
