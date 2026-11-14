import { useEffect, useState } from 'react';
import { api, local } from './api.js';
import NewCall from './NewCall.jsx';
import CallGuide from './CallGuide.jsx';
import CloseCall from './CloseCall.jsx';
import PastCalls from './PastCalls.jsx';
import CallDetail from './CallDetail.jsx';

// Hash routes: #/ new call, #/call live call, #/close, #/calls list, #/calls/:id detail
function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = path;
};

// Render's free tier sleeps when idle. Ping on load and tell the caller if it is waking.
function useServerWake() {
  const [state, setState] = useState('checking');
  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setState('waking'), 1500);
    api
      .health()
      .then(() => setState('up'))
      .catch(() => setState('down'))
      .finally(() => {
        done = true;
        clearTimeout(slow);
      });
    return () => clearTimeout(slow);
  }, []);
  return state;
}

export default function App() {
  const route = useHashRoute();
  const server = useServerWake();
  const [active, setActiveState] = useState(() => local.get('activeCall'));

  const setActive = (next) => {
    setActiveState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      local.set('activeCall', value);
      return value;
    });
  };

  let screen;
  if (route === '/call' && active) {
    screen = <CallGuide active={active} setActive={setActive} />;
  } else if (route === '/close' && active) {
    screen = <CloseCall active={active} setActive={setActive} />;
  } else if (route.startsWith('/calls/')) {
    screen = <CallDetail id={route.slice('/calls/'.length)} />;
  } else if (route.startsWith('/calls')) {
    screen = <PastCalls highlight={new URLSearchParams(route.split('?')[1]).get('saved')} />;
  } else {
    screen = <NewCall active={active} setActive={setActive} />;
  }

  return (
    <>
      {server === 'waking' && (
        <div className="banner" role="status">
          Waking the server. The free tier sleeps when idle; this takes up to a minute the first time.
        </div>
      )}
      {server === 'down' && (
        <div className="banner banner-bad" role="alert">
          The server is not answering. You can still read the guide; calls will save when it is back.
        </div>
      )}
      {screen}
    </>
  );
}
