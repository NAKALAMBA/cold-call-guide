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

const EXT_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac' };
const guessAudioType = (name = '') => EXT_TYPES[name.split('.').pop().toLowerCase()] || 'application/octet-stream';

export const api = {
  health: () => request('GET', '/health'),
  startCall: (fields) => request('POST', '/api/calls', fields),
  saveStage: (id, stage, result) => request('PUT', `/api/calls/${id}/stages/${stage}`, result),
  check: (id, body) => request('POST', `/api/calls/${id}/check`, body),
  closeCall: (id, body) => request('POST', `/api/calls/${id}/close`, body),
  uploadRecording: async (id, file) => {
    const type = file.type || guessAudioType(file.name);
    let res;
    try {
      res = await fetch(`${BASE}/api/calls/${id}/recording`, { method: 'POST', headers: { 'Content-Type': type }, body: file });
    } catch {
      throw new Error('Could not reach the server. Check your connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
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
