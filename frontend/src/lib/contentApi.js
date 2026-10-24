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
  return fetch(`${BASE_URL}/${tenantId}/content${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }).then(handleResponse);
}

export function fetchContent(tenantId, { page = 1, limit = 10, status = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status && status !== 'all') params.set('status', status);
  return request(tenantId, `?${params}`);
}

export function createContent(tenantId, payload) {
  return request(tenantId, '', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateContent(tenantId, contentId, payload) {
  return request(tenantId, `/${contentId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function updateContentStatus(tenantId, contentId, status) {
  return request(tenantId, `/${contentId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
