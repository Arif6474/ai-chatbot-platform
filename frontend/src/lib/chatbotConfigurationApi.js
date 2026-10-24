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
  return fetch(`${BASE_URL}/${tenantId}/chatbot-configuration${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  }).then(handleResponse);
}

export const fetchChatbotConfiguration = (tenantId) => request(tenantId);
export const createChatbotConfiguration = (tenantId, payload = {}) => request(tenantId, '', { method: 'POST', body: JSON.stringify(payload) });
export const updateChatbotConfiguration = (tenantId, payload) => request(tenantId, '', { method: 'PATCH', body: JSON.stringify(payload) });
export const updateChatbotEnabled = (tenantId, enabled) => request(tenantId, '/enabled', { method: 'PATCH', body: JSON.stringify({ enabled }) });
