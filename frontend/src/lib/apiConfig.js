/**
 * Resolves the backend API base URL for frontend admin requests.
 * In development, defaults to empty string so requests use the Vite development proxy (/api -> http://localhost:5050).
 * In production, if VITE_API_BASE_URL is set at build time (e.g. https://api.myplatform.com),
 * all admin fetch calls target the production backend API.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
