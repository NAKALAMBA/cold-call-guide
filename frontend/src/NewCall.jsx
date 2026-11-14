import { useState } from 'react';
import { api, local } from './api.js';
import { COMPANY_KINDS } from '../../shared/stages.js';
import { TopBar, Label } from './ui.jsx';
import { go } from './App.jsx';

export default function NewCall({ active, setActive }) {
  const [form, setForm] = useState({
    prospect_name: '',
    prospect_role: '',
    company: '',
    company_kind: '',
    call_type: 'first',
    caller_name: local.get('callerName', ''),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function start(e) {
    e.preventDefault();
    if (!form.prospect_name.trim() || !form.company.trim()) {
      setError('Prospect name and company are needed to start.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      local.set('callerName', form.caller_name);
      const call = await api.startCall({ ...form, company_kind: form.company_kind || null });
      setActive({ call, stage: 1, results: {}, when: '', saved: {} });
      go('/call');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <TopBar onBrand={() => go('/')} right={<a href="#/calls" className="toplink">Past calls</a>} />

      {active && (
        <div className="resume">
          <div>
            <strong>{active.call.prospect_name}</strong> is still open, at stage {active.stage}.
          </div>
          <div className="row">
            <button className="btn btn-small" onClick={() => go('/call')}>Resume</button>
            <button className="btn btn-small btn-ghost" onClick={() => go('/close')}>Close it</button>
          </div>
        </div>
      )}

      <form className="body" onSubmit={start}>
        <h1 className="h1">New call</h1>
        <p className="muted">Fill this in while it rings. The guide opens at stage 1.</p>

        <label className="field">
          <Label>Prospect</Label>
          <input value={form.prospect_name} onChange={set('prospect_name')} placeholder="Ayesha Kapoor" autoFocus maxLength={120} />
        </label>
        <label className="field">
          <Label>Role</Label>
          <input value={form.prospect_role} onChange={set('prospect_role')} placeholder="Director, Operations" maxLength={120} />
        </label>
        <label className="field">
          <Label>Company</Label>
          <input value={form.company} onChange={set('company')} placeholder="Vijay Writing Instruments" maxLength={160} />
        </label>
        <label className="field">
          <Label>Kind of company</Label>
          <select value={form.company_kind} onChange={set('company_kind')}>
            <option value="">Not sure</option>
            {COMPANY_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>

        <div className="field">
          <Label>This is a</Label>
          <div className="seg">
            {[
              ['first', 'First call'],
              ['follow_up', 'Follow-up'],
            ].map(([v, l]) => (
              <button type="button" key={v} className={form.call_type === v ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, call_type: v }))}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <Label>Your name</Label>
          <input value={form.caller_name} onChange={set('caller_name')} placeholder="Arjun" maxLength={80} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="footer">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Starting…' : 'Start call'}</button>
        </div>
      </form>
    </div>
  );
}
