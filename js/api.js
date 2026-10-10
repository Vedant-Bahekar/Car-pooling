/* ================================================
   API client — all fetch calls to the serverless API
   ================================================ */

const TOKEN_KEY = 'srt_session_token';

// ── Token helpers ──

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Quick client-side JWT expiry check (doesn't validate signature). */
export function isTokenExpired() {
  const token = getToken();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}

// ── API calls ──

/** Fetch all data (public, no auth). */
export async function fetchData() {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

/** Verify PIN — returns { token } or throws with error message. */
export async function verifyPin(pin) {
  const res = await fetch('/api/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'PIN verification failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Send a write action to the server.
 * Automatically attaches the session token.
 * Returns the response JSON or throws.
 */
export async function writeAction(action, params = {}) {
  const token = getToken();
  const res = await fetch('/api/write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...params })
  });

  if (res.status === 401) {
    clearToken();
    const err = new Error('Session expired');
    err.status = 401;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Write failed');
  }
  return data;
}
