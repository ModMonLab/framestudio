import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalRoot, ThemeProvider, ToastProvider } from '@frame/ui';
import './fonts.css';
import './studio.css';
import { Home } from './components/Home.js';
import { Workspace } from './components/Workspace.js';
import { HelpScreen } from './components/HelpScreen.js';
import { SettingsScreen } from './components/SettingsScreen.js';
import { PaletteHost } from './components/CommandPalette.js';
import { applyDensity } from './lib/prefs.js';

/** Routes: #/ (home) · #/settings · #/help[/<topic>] · #/p/<project id> (workspace) · #/p/<project id>/builder/<scene>/<instance> (character builder) · #/p/<project id>/part/<ref> (part editor) · #/p/<project id>/library (full-page library). */
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
  if (route[0] === 'settings') return <SettingsScreen />;
  if (route[0] === 'help') return <HelpScreen {...(route[1] ? { topic: route[1] } : {})} />;
  if (route[0] === 'p' && route[1]) return <Workspace key={route[1]} pid={route[1]} builder={route[2] === 'builder' && route[3] && route[4] ? { scene: route[3], instance: route[4] } : undefined} part={route[2] === 'part' && route[3] ? route[3] : undefined} screen={route[2] === 'library' ? 'library' : undefined} />;
  return <Home />;
}

applyDensity();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PortalRoot>
        <ToastProvider>
          <App />
          <PaletteHost />
        </ToastProvider>
      </PortalRoot>
    </ThemeProvider>
  </StrictMode>,
);
