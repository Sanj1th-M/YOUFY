function getDevBaseUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocalHost) {
    return 'http://localhost:3000';
  }

  // When the Vite dev server is opened from another device on the LAN,
  // route API requests back to the same machine using the browser-visible host.
  return `${protocol}//${hostname}:3000`;
}

// In dev, prefer the current browser host so mobile devices on the LAN can
// talk to the backend running on the same laptop. In prod, keep the `/api`
// default for environments that provide a reverse proxy.
export const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? getDevBaseUrl() : '/api');
