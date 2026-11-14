const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details?.map((d) => d.message).join(', ');
    throw new Error(detail || data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request('GET', '/health'),
  startCall: (fields) => request('POST', '/api/calls', fields),
  saveStage: (id, stage, result) => request('PUT', `/api/calls/${id}/stages/${stage}`, result),
  check: (id, body) => request('POST', `/api/calls/${id}/check`, body),
  closeCall: (id, body) => request('POST', `/api/calls/${id}/close`, body),
  listCalls: (params = {}) => request('GET', `/api/calls?${new URLSearchParams(params)}`),
  getCall: (id) => request('GET', `/api/calls/${id}`),
};

// Per-viewer conveniences only (caller name, an unfinished call). Never required.
export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: fine */
    }
  },
};
