// In dev, default to the local backend to avoid a missing `.env` hiding features.
// In prod, keep the existing `/api` default for environments that provide a reverse proxy.
export const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '/api');
