import { useEffect, useRef, useState } from 'react';
import { api, local } from './api.js';
import { STAGES, stageByN, OUTCOMES } from '../../shared/stages.js';
import { TopBar, Timer, ProspectLine, StagePills, Label, Dictate } from './ui.jsx';
import { go } from './App.jsx';

export function EndedHere({ stage }) {
  if (stage.endedHere == null) return null;
  return (
    <div className="ended">
      <div className="ended-row">
        <span className="ended-num">{stage.endedHere}</span>
        <span className="ended-text">of 100 transcribed calls ended here</span>
      </div>
      <div className="ended-track" aria-hidden="true">
        <div className="ended-fill" style={{ width: `${stage.endedHere}%` }} />
      </div>
      <p className="ended-insight">{stage.insight}</p>
    </div>
  );
}

export function MaySay({ stage }) {
  return (
    <>
      <Label>They may say</Label>
      <ul className="quotes">
        {stage.maySay.map((q) => (
          <li key={q}>{q.startsWith('(') ? <em>{q}</em> : <>&ldquo;{q}&rdquo;</>}</li>
        ))}
      </ul>
    </>
  );
}

export default function CallGuide({ active, setActive }) {
  const { call, stage: n, results } = active;
  const stage = stageByN(n);
  const current = results[n] ?? {};
  const [saveState, setSaveState] = useState({}); // n -> 'saving' | 'saved' | 'error'
  const lastSaved = useRef({}); // n -> JSON of what the server has
  const [lang, setLangState] = useState(() => local.get('dictateLang', 'en-IN'));
  const setLang = (l) => {
    setLangState(l);
    local.set('dictateLang', l);
  };

  const update = (patch) =>
    setActive((a) => ({ ...a, results: { ...a.results, [a.stage]: { ...(a.results[a.stage] ?? {}), ...patch } } }));

  const toggleTap = (key) => update({ tap: current.tap === key ? null : key });

  // Save the current stage if it changed. Fire-and-forget: a failed save is shown,
  // and every stage is re-sent (idempotently) when the call is closed.
  function saveStage(stageN) {
    const r = active.results[stageN];
    if (!r || (!r.tap && !r.words?.trim())) return;
    const payload = { tap: r.tap || null, words: r.words?.trim() || null };
    const key = JSON.stringify(payload);
    if (lastSaved.current[stageN] === key) return;
    setSaveState((s) => ({ ...s, [stageN]: 'saving' }));
    api
      .saveStage(call.id, stageN, payload)
      .then(() => {
        lastSaved.current[stageN] = key;
        setSaveState((s) => ({ ...s, [stageN]: 'saved' }));
      })
      .catch(() => setSaveState((s) => ({ ...s, [stageN]: 'error' })));
  }

  function goToStage(next) {
    saveStage(n);
    if (next >= 8) {
      go('/close');
      return;
    }
    setActive((a) => ({ ...a, stage: next }));
    window.scrollTo({ top: 0 });
  }

  function endCall() {
    saveStage(n);
    go('/close');
  }

  // Number keys pick taps when the caller is not typing.
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < stage.taps.length) toggleTap(stage.taps[i].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickedTap = stage.taps.find((t) => t.key === current.tap);
  const endsWith = pickedTap?.ends ? OUTCOMES.find((o) => o.key === pickedTap.ends) : null;
  const nextStage = STAGES[n]; // n is 1-based, so this is stage n+1
  const status = saveState[n];

  return (
    <div className="page page-call">
      <TopBar onBrand={() => go('/')} right={<Timer startedAt={call.started_at} />} />
      <ProspectLine call={call} />
      <StagePills current={n} results={results} onPick={goToStage} />

      <main className="body">
        <div className="eyebrow">
          Stage {n} of 8
          {status && <span className={`save save-${status}`}>{status === 'saving' ? 'saving' : status === 'saved' ? 'saved' : 'not saved, will retry at close'}</span>}
        </div>
        <h1 className="h1">{stage.name}</h1>
        <p className="goal">{stage.goal}</p>
        <p className="lead">{stage.lead}</p>

        <EndedHere stage={stage} />
        <MaySay stage={stage} />

        <Label>What happened</Label>
        <div className="taps">
          {stage.taps.map((t, i) => (
            <button
              key={t.key}
              type="button"
              className={`tap ${current.tap === t.key ? 'tap-on' : ''} ${t.ends ? 'tap-ends' : ''}`}
              onClick={() => toggleTap(t.key)}
              aria-pressed={current.tap === t.key}
            >
              <span className="tap-key" aria-hidden="true">{i + 1}</span>
              {t.label}
            </button>
          ))}
        </div>

        {stage.hasWhen && (
          <label className="field">
            <Label>When, and where to send</Label>
            <input
              value={active.when ?? ''}
              onChange={(e) => setActive((a) => ({ ...a, when: e.target.value }))}
              placeholder="Tue after 2 PM · official email"
              maxLength={120}
            />
          </label>
        )}

        <div className="field">
          <div className="words-head">
            <Label>{stage.wordsRequired ? 'Their words, exactly' : 'Their words'}</Label>
            {/* key={n}: switching stage unmounts it, which stops any dictation in progress */}
            <Dictate key={n} value={current.words ?? ''} onChange={(words) => update({ words })} lang={lang} setLang={setLang} />
          </div>
          <textarea
            aria-label="Their words"
            className={stage.wordsRequired ? 'words-key' : ''}
            value={current.words ?? ''}
            onChange={(e) => update({ words: e.target.value })}
            placeholder={stage.wordsRequired ? 'Type what they say, as they say it. This line is the record.' : 'What they said, in their words'}
            rows={stage.wordsRequired ? 4 : 3}
            maxLength={2000}
          />
        </div>
      </main>

      <div className="footer footer-sticky">
        {endsWith ? (
          <button className="btn btn-primary btn-end" onClick={endCall}>
            End call: {endsWith.label}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => goToStage(n + 1)}>
            {n === 7 ? 'Close the call' : `Next: ${nextStage.name}`}
          </button>
        )}
        <button className="btn btn-ghost" onClick={endsWith ? () => goToStage(n + 1) : endCall}>
          {endsWith ? 'Keep going' : 'End call'}
        </button>
      </div>
    </div>
  );
}
