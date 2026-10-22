import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalRoot, ThemeProvider, ToastProvider } from '@frame/ui';
import './fonts.css';
import './studio.css';
import { Home } from './components/Home.js';
import { Workspace } from './components/Workspace.js';

/** Routes: #/ (home) · #/p/<project id> (workspace) · #/p/<project id>/builder/<scene>/<instance> (character builder). */
function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const h = () => setRoute(read());
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  return route;
}

function App() {
  const route = useRoute();
  if (route[0] === 'p' && route[1]) return <Workspace key={route[1]} pid={route[1]} builder={route[2] === 'builder' && route[3] && route[4] ? { scene: route[3], instance: route[4] } : undefined} />;
  return <Home />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PortalRoot>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PortalRoot>
    </ThemeProvider>
  </StrictMode>,
);
