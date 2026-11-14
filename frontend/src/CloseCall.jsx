import { useMemo, useState } from 'react';
import { api } from './api.js';
import { STAGES, OUTCOMES, NEXT_STEP_CHANNELS, suggestOutcome, tapLabel, stageByN } from '../../shared/stages.js';
import { TopBar, Timer, ProspectLine, StagePills, Label } from './ui.jsx';
import { MaySay } from './CallGuide.jsx';
import { go } from './App.jsx';

const CHANNEL_FROM_TAP = {
  report_whatsapp: 'WhatsApp',
  report_email: 'Email',
  call_time: 'Call',
  meeting: 'Meeting',
  referral_number: 'Referral',
  referral_no_number: 'Referral',
};

const outcomeLabel = (k) => OUTCOMES.find((o) => o.key === k)?.label ?? k;

export default function CloseCall({ active, setActive }) {
  const { call, results } = active;
  const close = stageByN(8);
  const recorded = STAGES.filter((s) => s.n < 8 && (results[s.n]?.tap || results[s.n]?.words?.trim()));
  const reached = recorded.length ? Math.max(...recorded.map((s) => s.n)) : 1;
  const suggested = useMemo(() => suggestOutcome(results), [results]);

  const [outcome, setOutcome] = useState(suggested);
  const [channel, setChannel] = useState(CHANNEL_FROM_TAP[results[7]?.tap] ?? (results[7] ? null : 'None'));
  const [when, setWhen] = useState(active.when ?? '');
  const [summary, setSummary] = useState('');
  const [check, setCheck] = useState(null); // { ...result, for: outcome }
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [rec, setRec] = useState({ status: 'idle' }); // idle | uploading | done | error

  const need = results[5]?.words?.trim();

  // Re-send every stage (the server upserts, so this is safe) so nothing
  // recorded offline is lost before the LLM reads the call.
  async function syncStages() {
    for (const s of recorded) {
      const r = results[s.n];
      await api.saveStage(call.id, s.n, { tap: r.tap || null, words: r.words?.trim() || null });
    }
  }

  async function runCheck() {
    setBusy('check');
    setError('');
    try {
      await syncStages();
      const res = await api.check(call.id, { outcome, next_step_channel: channel, next_step_when: when.trim() || null });
      setCheck({ ...res, for: outcome });
      if (!summary && res.summary) setSummary(res.summary);
      // The result renders below the outcome grid; bring it into view.
      setTimeout(() => document.querySelector('.check')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function save(force = false) {
    // The log is checked before it is saved. If the check disagrees, the caller decides.
    let c = check?.for === outcome ? check : null;
    if (!c) {
      c = await runCheck();
      if (!c) return;
      if (!c.agrees && !force) return;
    } else if (!c.agrees && !force) {
      return;
    }
    setBusy('save');
    setError('');
    try {
      const { for: _ignored, ...ai_check } = c;
      await api.closeCall(call.id, {
        outcome,
        next_step_channel: channel,
        next_step_when: when.trim() || null,
        summary: summary.trim() || c.summary || null,
        ai_check,
      });
      setActive(null);
      go(`/calls?saved=${call.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function uploadRecording(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setRec({ status: 'error', error: 'That file is over 12 MB. Export the call as mp3 (a 10-minute call is about 5 MB).' });
      return;
    }
    setRec({ status: 'uploading', name: file.name });
    try {
      const result = await api.uploadRecording(call.id, file);
      setRec({ status: 'done', name: file.name, result });
    } catch (err) {
      setRec({ status: 'error', error: err.message });
    }
  }

  // Merge the recording's suggestions into what the caller recorded.
  // "gaps" only fills empty taps and empty word boxes; "all" lets the recording win.
  function applyRecording(mode) {
    const next = { ...results };
    for (const s of rec.result.stages) {
      const cur = results[s.stage] ?? {};
      next[s.stage] =
        mode === 'all'
          ? { tap: s.tap ?? cur.tap ?? null, words: s.words ?? cur.words ?? '' }
          : { tap: cur.tap || s.tap || null, words: cur.words?.trim() ? cur.words : s.words ?? '' };
    }
    setActive((a) => ({ ...a, results: next, when }));
    setOutcome(suggestOutcome(next));
    if (CHANNEL_FROM_TAP[next[7]?.tap] && (mode === 'all' || !channel || channel === 'None')) setChannel(CHANNEL_FROM_TAP[next[7].tap]);
    setCheck(null);
    setRec((r) => ({ ...r, applied: mode }));
  }

  const backTo = (n) => {
    setActive((a) => ({ ...a, stage: Math.min(n, 7), when }));
    go('/call');
  };

  const stale = check && check.for !== outcome;

  return (
    <div className="page page-call">
      <TopBar onBrand={() => go('/')} right={<Timer startedAt={call.started_at} />} />
      <ProspectLine call={call} />
      <StagePills current={8} results={results} onPick={backTo} />

      <main className="body">
        <div className="eyebrow">Stage 8 of 8</div>
        <h1 className="h1">Close</h1>
        <p className="goal">{close.goal}</p>
        <div className="ended">
          <p className="ended-insight">{close.insight}</p>
        </div>
        <MaySay stage={close} />

        <Label>Fill from a recording</Label>
        <div className="rec">
          <p className="rec-note">
            Only if the prospect was told the call is recorded. Upload the call (mp3, m4a or wav, up to 12 MB) and Gemini suggests a tap and their words for each
            stage. Nothing changes until you choose.
          </p>
          <label className={`btn btn-small file-btn ${rec.status === 'uploading' ? 'is-busy' : ''}`}>
            <input
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm"
              onChange={(e) => uploadRecording(e.target.files?.[0])}
              disabled={rec.status === 'uploading'}
            />
            {rec.status === 'uploading' ? `Transcribing ${rec.name}…` : rec.status === 'done' ? 'Upload another recording' : 'Choose recording'}
          </label>
          {rec.status === 'uploading' && <p className="rec-note">Usually under 15 seconds. Longer calls take longer.</p>}
          {rec.status === 'error' && <p className="error">{rec.error}</p>}
          {rec.status === 'done' && (
            <>
              {rec.result.stages.length === 0 ? (
                <p className="rec-note">The transcript is below, but no stages could be matched. Fill them by hand.</p>
              ) : (
                <ol className="record sugg">
                  {rec.result.stages.map((s) => {
                    const cur = results[s.stage] ?? {};
                    const has = cur.tap || cur.words?.trim();
                    const same = has && cur.tap === s.tap;
                    return (
                      <li key={s.stage}>
                        <span className="record-stage">
                          {s.stage} {stageByN(s.stage).name}
                          <span className={`sugg-tag ${!has ? 'new' : same ? 'same' : 'diff'}`}>{!has ? 'new' : same ? 'same' : 'differs'}</span>
                        </span>
                        <div>
                          {s.tap && <div className="record-tap">{tapLabel(s.stage, s.tap)}</div>}
                          {s.words && <div className="record-words">&ldquo;{s.words}&rdquo;</div>}
                          {has && !same && cur.tap && <div className="sugg-yours">You tapped: {tapLabel(s.stage, cur.tap)}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {rec.result.stages.length > 0 && (
                <div className="row">
                  <button className="btn btn-small" onClick={() => applyRecording('gaps')}>Fill the gaps</button>
                  <button className="btn btn-small btn-ghost" onClick={() => applyRecording('all')}>Use the recording for all</button>
                  {rec.applied && <span className="sugg-done">{rec.applied === 'all' ? 'Recording applied to every stage it heard.' : 'Empty fields filled from the recording.'}</span>}
                </div>
              )}
              <details className="transcript">
                <summary>
                  Transcript · {rec.result.transcript.length} turns{rec.result.language ? ` · ${rec.result.language}` : ''} · {rec.result.model}
                </summary>
                <ol>
                  {rec.result.transcript.map((t, i) => (
                    <li key={i}><b>{t.speaker}</b> {t.text}</li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </div>

        <Label>What you recorded · reached stage {reached}, {stageByN(reached).name}</Label>
        {recorded.length === 0 ? (
          <p className="muted">Nothing recorded. That is fine for a call that ended at the opening.</p>
        ) : (
          <ol className="record">
            {recorded.map((s) => (
              <li key={s.n}>
                <button type="button" className="record-stage" onClick={() => backTo(s.n)} title="Edit this stage">
                  {s.n} {s.name}
                </button>
                <div>
                  {results[s.n].tap && <div className="record-tap">{tapLabel(s.n, results[s.n].tap)}</div>}
                  {results[s.n].words?.trim() && <div className="record-words">&ldquo;{results[s.n].words.trim()}&rdquo;</div>}
                </div>
              </li>
            ))}
          </ol>
        )}

        <Label>Their need, in their words</Label>
        {need ? (
          <blockquote className="need">{need}</blockquote>
        ) : (
          <p className="need need-missing">Not heard on this call. Ask for it on the next one.</p>
        )}

        <Label>Outcome</Label>
        <div className="taps taps-3">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              title={o.meaning}
              className={`tap ${outcome === o.key ? 'tap-on' : ''}`}
              onClick={() => setOutcome(o.key)}
              aria-pressed={outcome === o.key}
            >
              {o.label}
              {o.key === suggested && <span className="tap-hint">from your taps</span>}
            </button>
          ))}
        </div>

        <Label>Next step</Label>
        <div className="taps taps-3">
          {NEXT_STEP_CHANNELS.map((c) => (
            <button key={c} type="button" className={`tap tap-short ${channel === c ? 'tap-on' : ''}`} onClick={() => setChannel(c)} aria-pressed={channel === c}>
              {c}
            </button>
          ))}
        </div>
        {channel && channel !== 'None' && (
          <input className="mt" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="When: Thursday 4 PM · official email" maxLength={120} />
        )}

        {check && (
          <div className={`check ${check.agrees && !stale ? 'check-ok' : 'check-warn'}`} role="status">
            <div className="check-head">
              <span className="check-icon" aria-hidden="true">{check.agrees && !stale ? '✓' : '!'}</span>
              {stale
                ? 'You changed the outcome. Check again before saving.'
                : check.agrees
                  ? 'The log matches the call.'
                  : `The call reads as: ${outcomeLabel(check.suggested_outcome)}`}
            </div>
            {!stale && <p className="check-reason">{check.reason}</p>}
            {!stale && !check.agrees && (
              <div className="row">
                <button className="btn btn-small" onClick={() => setOutcome(check.suggested_outcome)}>
                  Use {outcomeLabel(check.suggested_outcome)}
                </button>
                <button className="btn btn-small btn-ghost" onClick={() => save(true)} disabled={!!busy}>
                  Save mine: {outcomeLabel(outcome)}
                </button>
              </div>
            )}
            <div className="check-src">{check.source === 'llm' ? `Checked by ${check.model}` : 'Checked by rules (no LLM key set)'}</div>
          </div>
        )}

        <label className="field">
          <Label>Line for the past-calls list</Label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Call Thursday 4 PM" maxLength={200} />
        </label>

        {error && <p className="error">{error}</p>}
      </main>

      <div className="footer footer-sticky">
        <button className="btn btn-primary" onClick={() => save(false)} disabled={!!busy}>
          {busy === 'check' ? 'Checking the log…' : busy === 'save' ? 'Saving…' : 'Check and save'}
        </button>
        <button className="btn btn-ghost" onClick={() => backTo(reached)} disabled={!!busy}>
          Back to call
        </button>
      </div>
    </div>
  );
}
