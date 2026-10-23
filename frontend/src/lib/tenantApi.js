/**
 * Tenant Management API Client
 */

const BASE_URL = '/api/v1/admin/tenants';

/**
 * Handle API response and error formatting
 */
async function handleResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error('The server returned an unparseable response.');
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || 'An error occurred while processing the request';
    const err = new Error(errorMsg);
    err.code = data?.error?.code || 'API_ERROR';
    err.status = response.status;
    throw err;
  }
  return data.data;
}

/**
 * Fetch paginated list of tenants with optional search and status filtering
 */
export async function fetchTenants({ page = 1, limit = 10, search = '', status = '' } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (search && search.trim()) params.set('search', search.trim());
  if (status && status !== 'all') params.set('status', status);

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  return handleResponse(res);
}

/**
 * Fetch single tenant details by ID
 */
export async function fetchTenantById(id) {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  return handleResponse(res);
}

/**
 * Create a new business tenant
 */
export async function createTenant(payload) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return handleResponse(res);
}

/**
 * Update permitted fields of an existing tenant
 */
export async function updateTenant(id, payload) {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return handleResponse(res);
}

/**
 * Update tenant status (activate / deactivate)
 */
export async function updateTenantStatus(id, status) {
  const res = await fetch(`${BASE_URL}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });

  return handleResponse(res);
}
