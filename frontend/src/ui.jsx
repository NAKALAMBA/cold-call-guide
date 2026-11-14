import { useEffect, useRef, useState } from 'react';
import { STAGES } from '../../shared/stages.js';

export function TopBar({ right, onBrand }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onBrand} type="button">
        Meridian <span>·</span> Call guide
      </button>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Timer({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="timer">{fmtDuration(Math.max(0, (now - new Date(startedAt)) / 1000))}</span>;
}

export function fmtDuration(sec) {
  if (sec == null) return '';
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtWhen(iso) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export function ProspectLine({ call }) {
  return (
    <div className="prospect">
      <div className="prospect-name">{call.prospect_name}</div>
      <div className="prospect-sub">
        {[call.prospect_role, call.company].filter(Boolean).join(', ')} · {call.call_type === 'follow_up' ? 'follow-up call' : 'first call'}
      </div>
    </div>
  );
}

// The eight stage pills. `results` marks which stages have something recorded.
export function StagePills({ current, results, onPick }) {
  return (
    <nav className="pills" aria-label="Stages">
      {STAGES.map((s) => {
        const done = results?.[s.n]?.tap || results?.[s.n]?.words;
        const cls = ['pill', s.n === current && 'pill-current', done && s.n !== current && 'pill-done'].filter(Boolean).join(' ');
        return (
          <button
            key={s.n}
            type="button"
            className={cls}
            onClick={() => onPick?.(s.n)}
            aria-current={s.n === current ? 'step' : undefined}
            title={s.name}
          >
            {s.n}
          </button>
        );
      })}
    </nav>
  );
}

export function Label({ children }) {
  return <div className="label">{children}</div>;
}

// ---- Dictation: the caller says the prospect's line, the browser types it.
// Uses the browser's own speech recognition (Chrome, Edge, Safari). No key,
// no server. Hidden where the browser does not support it (Firefox).
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const dictationSupported = Boolean(Recognition);

const LANGS = [
  ['en-IN', 'EN'],
  ['hi-IN', 'हिं'],
];

export function Dictate({ value, onChange, lang, setLang }) {
  const [state, setState] = useState('idle'); // idle | listening | error
  const [message, setMessage] = useState('');
  const recRef = useRef(null);
  const baseRef = useRef('');

  useEffect(() => () => recRef.current?.abort(), []);

  if (!dictationSupported) return null;

  function start() {
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value ? value.replace(/\s*$/, ' ') : '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange((baseRef.current + text.trim()).slice(0, 2000));
    };
    rec.onerror = (e) => {
      setState('error');
      setMessage(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone blocked. Allow it from the icon in the address bar.'
          : e.error === 'no-speech'
            ? 'Did not hear anything. Tap the mic and speak.'
            : e.error === 'network'
              ? 'Dictation needs an internet connection.'
              : 'Dictation stopped. Type instead, or try again.',
      );
    };
    rec.onend = () => setState((s) => (s === 'error' ? s : 'idle'));
    recRef.current = rec;
    setMessage('');
    setState('listening');
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
  }

  return (
    <div className="dictate">
      <button
        type="button"
        className={`mic ${state === 'listening' ? 'mic-on' : ''}`}
        onClick={state === 'listening' ? stop : start}
        aria-pressed={state === 'listening'}
        title={state === 'listening' ? 'Stop dictating' : 'Dictate their words'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {state === 'listening' ? 'Listening… tap to stop' : 'Dictate'}
      </button>
      <div className="seg seg-mini" role="group" aria-label="Dictation language">
        {LANGS.map(([code, label]) => (
          <button key={code} type="button" className={lang === code ? 'on' : ''} onClick={() => setLang(code)} disabled={state === 'listening'}>
            {label}
          </button>
        ))}
      </div>
      {message && <span className="dictate-msg">{message}</span>}
    </div>
  );
}
