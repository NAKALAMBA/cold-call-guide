import { useEffect, useState } from 'react';
import { api } from './api.js';
import { OUTCOMES, stageByN, tapLabel } from '../../shared/stages.js';
import { TopBar, Label, fmtWhen, fmtDuration } from './ui.jsx';
import { go } from './App.jsx';

const outcomeLabel = (k) => OUTCOMES.find((o) => o.key === k)?.label ?? k;

export default function CallDetail({ id }) {
  const [call, setCall] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCall(id).then(setCall).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="page">
      <TopBar onBrand={() => go('/')} right={<a href="#/calls" className="toplink">All calls</a>} />
      <main className="body">
        {error && <p className="error">{error}</p>}
        {!call && !error && <p className="muted">Loading…</p>}
        {call && (
          <>
            <div className="eyebrow">{fmtWhen(call.started_at)}{call.duration_seconds != null && ` · ${fmtDuration(call.duration_seconds)}`}</div>
            <h1 className="h1">{call.prospect_name}</h1>
            <p className="muted">
              {[call.prospect_role, call.company, call.company_kind].filter(Boolean).join(' · ')} · {call.call_type === 'follow_up' ? 'follow-up' : 'first call'}
              {call.caller_name && ` · called by ${call.caller_name}`}
            </p>

            <div className="facts">
              <div><Label>Reached</Label>{call.stage_reached} {stageByN(call.stage_reached).name}</div>
              <div><Label>Outcome</Label>{call.outcome ? outcomeLabel(call.outcome) : 'Not logged'}</div>
              <div><Label>Next step</Label>{[call.next_step_channel, call.next_step_when].filter(Boolean).join(', ') || 'None'}</div>
            </div>

            <Label>Their need, in their words</Label>
            {call.need_words ? <blockquote className="need">{call.need_words}</blockquote> : <p className="need need-missing">Not heard on this call.</p>}

            <Label>Stage by stage</Label>
            {call.stages.length === 0 ? (
              <p className="muted">Nothing recorded.</p>
            ) : (
              <ol className="record">
                {call.stages.map((s) => (
                  <li key={s.stage}>
                    <span className="record-stage">{s.stage} {stageByN(s.stage).name}</span>
                    <div>
                      {s.tap && <div className="record-tap">{tapLabel(s.stage, s.tap)}</div>}
                      {s.words && <div className="record-words">&ldquo;{s.words}&rdquo;</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {call.transcript && (
              <details className="transcript">
                <summary>Transcript from the recording</summary>
                <ol>
                  {call.transcript.split('\n').map((line, i) => {
                    const m = line.match(/^(CALLER|PROSPECT|RECEPTION|UNKNOWN): (.*)$/);
                    return <li key={i}>{m ? <><b>{m[1]}</b> {m[2]}</> : line}</li>;
                  })}
                </ol>
              </details>
            )}

            {call.ai_check && (
              <div className={`check ${call.ai_check.agrees ? 'check-ok' : 'check-warn'}`}>
                <div className="check-head">
                  <span className="check-icon" aria-hidden="true">{call.ai_check.agrees ? '✓' : '!'}</span>
                  {call.ai_check.agrees
                    ? 'Log check agreed with this outcome.'
                    : `Log check read it as ${outcomeLabel(call.ai_check.suggested_outcome)}; the caller kept ${outcomeLabel(call.outcome)}.`}
                </div>
                <p className="check-reason">{call.ai_check.reason}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
