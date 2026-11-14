import { useEffect, useState } from 'react';
import { api } from './api.js';
import { STAGES, OUTCOMES, stageByN } from '../../shared/stages.js';
import { TopBar, fmtWhen, Label } from './ui.jsx';
import { go } from './App.jsx';

const outcomeLabel = (k) => OUTCOMES.find((o) => o.key === k)?.label ?? k;

// One series: how many of your calls reached each stage and stopped there.
// The thin tick on each column is the share from the 100 transcripts, for comparison.
function WhereCallsEnd({ calls, stage, setStage }) {
  const counts = STAGES.map((s) => calls.filter((c) => c.stage_reached === s.n).length);
  const total = calls.length || 1;
  const max = Math.max(...counts.map((c) => c / total), ...STAGES.map((s) => (s.endedHere ?? 0) / 100), 0.01);

  return (
    <section className="ends" aria-label="Where your calls end">
      <div className="ends-head">
        <Label>Where your calls end</Label>
        <span className="ends-legend"><i className="ends-tick-key" /> share in the 100 transcripts</span>
      </div>
      <div className="ends-cols">
        {STAGES.map((s, i) => {
          const share = counts[i] / total;
          const base = (s.endedHere ?? 0) / 100;
          const on = stage === s.n;
          return (
            <button
              key={s.n}
              type="button"
              className={`ends-col ${on ? 'on' : ''} ${stage && !on ? 'dim' : ''}`}
              onClick={() => setStage(on ? null : s.n)}
              title={`${s.name}: ${counts[i]} of your calls (${Math.round(share * 100)}%) · transcripts ${s.endedHere ?? 0}%`}
              aria-pressed={on}
            >
              <span className="ends-count">{counts[i]}</span>
              <span className="ends-plot">
                <span className="ends-bar" style={{ height: `${(share / max) * 100}%` }} />
                {base > 0 && <span className="ends-tick" style={{ bottom: `${(base / max) * 100}%` }} />}
              </span>
              <span className="ends-name">{s.n}</span>
            </button>
          );
        })}
      </div>
      <div className="ends-caption">
        {stage ? (
          <>
            Showing calls that ended at <strong>{stageByN(stage).name}</strong>.{' '}
            <button className="linkbtn" onClick={() => setStage(null)}>Show all</button>
          </>
        ) : (
          'Tap a stage to see the calls that ended there.'
        )}
      </div>
    </section>
  );
}

export default function PastCalls({ highlight }) {
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(null);

  useEffect(() => {
    api
      .listCalls({ limit: 200 })
      .then(setCalls)
      .catch((e) => setError(e.message));
  }, []);

  const shown = (calls ?? []).filter((c) => !stage || c.stage_reached === stage);

  return (
    <div className="page">
      <TopBar onBrand={() => go('/')} right={<a href="#/" className="toplink">New call</a>} />
      <main className="body">
        <h1 className="h1">Past calls</h1>
        {error && <p className="error">{error}</p>}
        {!calls && !error && <p className="muted">Loading calls…</p>}
        {calls && calls.length === 0 && (
          <div className="empty">
            <p>No calls yet.</p>
            <button className="btn btn-primary" onClick={() => go('/')}>Start the first call</button>
          </div>
        )}
        {calls && calls.length > 0 && (
          <>
            <WhereCallsEnd calls={calls} stage={stage} setStage={setStage} />
            <ul className="list">
              {shown.map((c) => (
                <li key={c.id} className={c.id === highlight ? 'just-saved' : ''}>
                  <button type="button" className="list-row" onClick={() => go(`/calls/${c.id}`)}>
                    <div className="list-main">
                      <div className="list-name">
                        {c.prospect_name}, {c.company}
                      </div>
                      <div className="list-sub">
                        {c.status === 'in_progress'
                          ? 'Not logged: the call was never closed'
                          : c.summary || [c.next_step_channel, c.next_step_when].filter(Boolean).join(' ') || outcomeLabel(c.outcome)}
                      </div>
                    </div>
                    <div className="list-side">
                      <span className="badge">{stageByN(c.stage_reached).name}</span>
                      <span className="list-when">{fmtWhen(c.started_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
