/** Help (FR-ONB-02): topics linked from every panel and the command palette. */
import { ArrowLeft } from 'lucide-react';
import { AppBar, Button, Panel } from '@frame/ui';
import { HELP_TOPICS } from '../help/topics.js';
import { NotesView } from './NotesEditor.js';

export function HelpScreen({ topic }: { topic?: string }) {
  const current = HELP_TOPICS.find((t) => t.id === topic) ?? HELP_TOPICS[0]!;
  return (
    <div className="fr-root st-app">
      <AppBar left={<Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => history.length > 1 ? history.back() : (location.hash = '#/')}>Back</Button>} />
      <main className="st-help">
        <h1 className="fr-sr">Help</h1>
        <nav aria-label="Help topics" className="st-help-nav">
          <ul>
            {HELP_TOPICS.map((t) => <li key={t.id}><a href={`#/help/${t.id}`} aria-current={t.id === current.id ? 'page' : undefined}>{t.title}</a></li>)}
          </ul>
        </nav>
        <Panel title={current.title} label={current.title} className="st-help-body">
          <div style={{ padding: 16 }}><NotesView value={current.body} offset={0} /></div>
        </Panel>
      </main>
    </div>
  );
}
