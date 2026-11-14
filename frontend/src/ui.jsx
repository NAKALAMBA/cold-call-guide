import { useEffect, useState } from 'react';
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
