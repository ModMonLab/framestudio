import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AppBar, AssetRow, Breadcrumb, Button, Chip, ChipGroup, EmptyState, FloatingControl, IconButton, JobRow, MenuBar, MenuList,
  NumberField, Panel, PauseFilled, PlayFilled, PortalRoot, Progress, RadioList, Rail, SearchField, Section, Segmented, Select,
  Skeleton, SliderRow, StatusBadge, Switch, SwatchGrid, Tabs, TextArea, TextField, ThemeProvider, TileGrid, ToastProvider,
  ToggleRow, Toolbar, ToolbarSeparator, Tree, VSep, type MenuEntry, type TreeNode,
} from '@frame/ui';
import {
  Box, Camera, Copy, Download, Film, Folder, Image as ImageIcon, Layers, LayoutGrid, Lock, Moon, Music, Redo2, Sparkles, Trash2, Type, Undo2,
  User, Users, Eye, Mic, Plus, ChevronsDownUp, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import './fonts.css';

const params = new URLSearchParams(location.search);
const theme = (params.get('theme') === 'light' ? 'light' : 'dark') as 'dark' | 'light';
const story = params.get('story') ?? 'all';

function Card({ title, children, width }: { title: string; children: ReactNode; width?: number }) {
  return (
    <section style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, width, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={title}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 500, color: 'var(--color-text3)' }}>{title}</h3>
      {children}
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>;

/* ------------------------------------------------------------------ stories */

function Buttons() {
  return (
    <>
      <Card title="Primary · secondary · ghost · danger">
        <Row>
          <Button variant="primary">Export</Button>
          <Button variant="primary" className="is-hover" style={{ background: 'var(--color-accent-fill-hover)' }}>Export (hover)</Button>
          <Button variant="primary" loading>Exporting</Button>
          <Button variant="primary" disabled disabledReason="Fix 2 problems first">Export</Button>
        </Row>
        <Row>
          <Button>Preview</Button>
          <Button style={{ background: 'var(--color-hover)' }}>Preview (hover)</Button>
          <Button icon={<Plus size={14} />}>Add take</Button>
          <Button disabled disabledReason="Voice worker offline">Generate takes</Button>
          <Button variant="danger" icon={<Trash2 size={14} />}>Delete</Button>
        </Row>
        <Row>
          <Button variant="ghost">Snap</Button>
          <Button variant="ghost" aria-pressed="true">Ripple (on)</Button>
          <IconButton label="Undo" shortcut="Ctrl Z" icon={<Undo2 size={16} />} />
          <IconButton label="Redo" shortcut="Ctrl Shift Z" icon={<Redo2 size={16} />} />
          <IconButton label="Duplicate" shortcut="Ctrl D" icon={<Copy size={15} />} />
          <IconButton label="Lock" icon={<Lock size={14} />} size="xs" pressed />
          <IconButton label="Delete" icon={<Trash2 size={15} />} disabled disabledReason="Nothing selected" />
        </Row>
        <Row>
          <button type="button" aria-label="Play" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--color-accent-fill)', color: 'var(--color-on-accent)', display: 'grid', placeItems: 'center' }}><PlayFilled /></button>
          <button type="button" aria-label="Pause" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--color-accent-fill)', color: 'var(--color-on-accent)', display: 'grid', placeItems: 'center' }}><PauseFilled /></button>
          <Button autoFocus>Focus visible</Button>
        </Row>
      </Card>
    </>
  );
}

function Fields() {
  const [text, setText] = useState('Maya Bennett');
  const [q, setQ] = useState('glasses');
  const [x, setX] = useState(612);
  const [notes, setNotes] = useState('Cold open: Maya realises the recording never started.');
  const [look, setLook] = useState('on-air');
  return (
    <Card title="Text, search, number, select, text area" width={320}>
      <TextField value={text} onChange={setText} label="Name" clearable />
      <SearchField value={q} onChange={setQ} placeholder="Search parts and settings" />
      <SearchField value="" onChange={() => {}} placeholder="Search layers" />
      <TextField value="12 x" onChange={() => {}} label="Invalid" invalid />
      <TextField value="Read only" onChange={() => {}} label="Disabled" disabled />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <NumberField prefix="X" label="Position X" value={x} onChange={(v) => setX(v)} />
        <NumberField prefix="Y" label="Position Y" value={760} onChange={() => {}} />
        <NumberField prefix="↻" label="Rotation" value={0} unit="°" onChange={() => {}} />
        <NumberField prefix="W" label="Width" value={330} onChange={() => {}} disabled />
      </div>
      <div className="fr-label-row">
        <span className="fr-label">Look</span>
        <Select label="Look" value={look} onChange={setLook} options={[{ value: 'on-air', label: 'On-air' }, { value: 'everyday', label: 'Everyday' }, { value: 'evening', label: 'Evening', disabled: true, disabledReason: 'Needs a gown in this family' }]} />
      </div>
      <div className="fr-label-row">
        <span className="fr-label">Depth plane</span>
        <Select label="Depth plane" value={undefined} placeholder="Choose…" onChange={() => {}} options={[{ value: 'mid', label: 'Mid' }]} disabled disabledReason="Locked object" />
      </div>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </Card>
  );
}

const skin = ['#F7DCC9', '#F1D2B6', '#E9C3A0', '#E0B48F', '#D5A27A', '#C68E64', '#B97E58', '#A86D49', '#93603F', '#7E5034', '#6A422B', '#563522', '#45291B', '#3A2217', '#2E1B13', '#24150F'].map((v, i) => ({ value: v, label: `Tone ${i + 1}` }));

function Controls() {
  const [v, setV] = useState(62);
  const [c, setC] = useState('#C68E64');
  const [t1, setT1] = useState(true);
  const [sw, setSw] = useState(true);
  return (
    <Card title="Slider rows · swatches · toggles · switch" width={300}>
      <SliderRow label="Jaw width" value={v} onChange={(n) => setV(n)} defaultValue={50} endLabels={['Soft', 'Defined']} />
      <SliderRow label="Intensity" value={70} onChange={() => {}} format={(n) => `${n} %`} inline />
      <SliderRow label="Pace" value={1} min={0.5} max={2} step={0.05} onChange={() => {}} format={(n) => `${n.toFixed(2)}×`} disabled inline />
      <div className="fr-label-row"><span className="fr-label">Skin</span><span className="fr-faint fr-mono" style={{ textAlign: 'right' }}>{c}</span></div>
      <SwatchGrid label="Skin tone" value={c} swatches={skin.slice(0, 15)} onChange={(n) => setC(n)} />
      <ToggleRow label="Freckles" description="Cheeks and nose" checked={t1} onChange={setT1} />
      <ToggleRow label="Heterochromia" checked={false} onChange={() => {}} />
      <ToggleRow label="Talking gestures" checked={false} onChange={() => {}} disabled disabledReason="Needs a standing or seated posture" />
      <Row><Switch label="Auto idle" checked={sw} onChange={setSw} /><span>Auto idle</span><Switch label="Off" checked={false} onChange={() => {}} /></Row>
    </Card>
  );
}

function Choices() {
  const [mode, setMode] = useState('direct');
  const [fam, setFam] = useState('flat');
  const [show, setShow] = useState('all');
  const [expr, setExpr] = useState('embarrassed');
  return (
    <Card title="Tabs · segmented · chips · status badges" width={420}>
      <Tabs label="Workspace mode" value={mode} onChange={setMode} tabs={[{ value: 'stage', label: 'Stage', shortcut: '1' }, { value: 'direct', label: 'Direct', shortcut: '2' }, { value: 'edit', label: 'Edit', shortcut: '3' }]} style={{ height: 36 }} />
      <Row>
        <Segmented label="Style" value={fam} onChange={setFam} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'picture', label: 'Picture' }, { value: 'audio', label: 'Audio', disabled: true, reason: 'No audio tracks' }]} />
      </Row>
      <ChipGroup label="Expression" value={expr} onChange={setExpr} options={[{ value: 'neutral', label: 'Neutral' }, { value: 'smile', label: 'Smile' }, { value: 'surprise', label: 'Surprise' }, { value: 'sad', label: 'Sad' }, { value: 'skeptical', label: 'Skeptical' }, { value: 'embarrassed', label: 'Embarrassed' }, { value: 'angry', label: 'Angry', disabled: true, reason: 'Not available in back view' }]} />
      <Row>
        <Chip>Default chip</Chip>
        <Chip selected>Selected chip</Chip>
      </Row>
      <Row>
        <StatusBadge tone="success">Saved</StatusBadge>
        <StatusBadge>Saving…</StatusBadge>
        <StatusBadge tone="warning">Unsaved</StatusBadge>
        <StatusBadge tone="danger">Not saved</StatusBadge>
        <StatusBadge tone="info">Fixture voice</StatusBadge>
        <StatusBadge tone="warning">Outdated</StatusBadge>
      </Row>
    </Card>
  );
}

const menuItems: MenuEntry[] = [
  { id: 'new', label: 'New project…', shortcut: 'Ctrl N' },
  { id: 'open', label: 'Open…', shortcut: 'Ctrl O' },
  { id: 'recent', label: 'Open recent', submenu: [{ id: 'r1', label: 'The Backup Recording' }] },
  { kind: 'separator', id: 's1' },
  { id: 'version', label: 'Save version', shortcut: 'Ctrl S' },
  { id: 'export', label: 'Export package…', disabled: true, disabledReason: 'Fix missing media first' },
  { kind: 'separator', id: 's2' },
  { kind: 'label', id: 'l', label: 'View' },
  { id: 'grid', label: 'Safe-area guides', checked: true },
  { id: 'snap', label: 'Snapping', checked: false },
];

function Menus() {
  return (
    <Card title="Text menus · menu (open)" width={300}>
      <MenuBar menus={[{ id: 'file', label: 'File', items: menuItems }, { id: 'edit', label: 'Edit', items: menuItems }, { id: 'view', label: 'View', items: menuItems }]} />
      <div className="fr-popover" style={{ position: 'static' }}>
        <MenuList items={menuItems} onClose={() => {}} label="File" autoFocus={false} />
      </div>
    </Card>
  );
}

const treeNodes: TreeNode[] = [
  { id: 'ep', label: 'The Backup Recording', icon: <Film size={15} />, meta: 'Episode 01' },
  { id: 's1', parent: 'ep', label: 'Scene 1 · Cold open', icon: <Film size={15} />, meta: '0:30', renamable: true },
  { id: 'cast', parent: 's1', label: 'Cast', icon: <Folder size={15} />, meta: '2' },
  { id: 'maya', parent: 'cast', label: 'Maya Bennett', icon: <User size={15} />, meta: 'Seated', changed: true, actions: <><IconButton size="xs" label="Hide Maya Bennett" icon={<Eye size={13} />} /><IconButton size="xs" label="Lock Maya Bennett" icon={<Lock size={13} />} /></> },
  { id: 'maya-look', parent: 'maya', label: 'Look · On-air', emphasis: 'detail' },
  { id: 'maya-voice', parent: 'maya', label: 'Voice · Warm host v2', icon: <Mic size={14} />, emphasis: 'detail' },
  { id: 'leo', parent: 'cast', label: 'Leo Park', icon: <User size={15} />, meta: 'Seated' },
  { id: 'set', parent: 's1', label: 'Set · Podcast studio', icon: <Folder size={15} />, meta: 'Kit' },
  { id: 'table', parent: 'set', label: 'Round table', icon: <Box size={15} />, meta: 'Fore' },
  { id: 'mug', parent: 'set', label: 'Mug', icon: <Box size={15} />, meta: 'Fore' },
  { id: 'cams', parent: 's1', label: 'Cameras', icon: <Folder size={15} />, meta: '3' },
  { id: 'wide', parent: 'cams', label: 'Wide', icon: <Camera size={15} />, meta: '35mm' },
  { id: 's2', parent: 'ep', label: 'Scene 2 · The search', icon: <Film size={15} />, meta: '0:42', hasChildren: true },
];

function Trees() {
  const [exp, setExp] = useState(new Set(['ep', 's1', 'cast', 'maya', 'set', 'cams']));
  const [sel, setSel] = useState('maya');
  const [q, setQ] = useState('');
  return (
    <>
      <Panel title="Layers" style={{ width: 272, border: '1px solid var(--color-border)', borderRadius: 8 }} actions={<><IconButton size="sm" label="Collapse all" icon={<ChevronsDownUp size={15} />} /><IconButton size="sm" label="Add" icon={<Plus size={15} />} /></>} search={<SearchField value={q} onChange={setQ} placeholder="Search layers" />}>
        <Tree label="Layers" nodes={treeNodes} expanded={exp} onExpandedChange={setExp} selected={sel} onSelect={setSel} query={q} onRename={() => {}} />
      </Panel>
      <Panel title="Search with ancestors" style={{ width: 272, border: '1px solid var(--color-border)', borderRadius: 8 }} search={<SearchField value="mug" onChange={() => {}} placeholder="Search layers" />}>
        <Tree label="Layers filtered" nodes={treeNodes} expanded={new Set()} onExpandedChange={() => {}} selected="mug" query="mug" />
        <Tree label="No results" nodes={treeNodes} expanded={new Set()} onExpandedChange={() => {}} query="zebra" />
      </Panel>
    </>
  );
}

function Sections() {
  const [open, setOpen] = useState<Record<string, boolean>>({ t: true, l: false, e: true });
  return (
    <Panel title="Properties" style={{ width: 300, border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <Section title="Transform" open={open.t!} onToggle={(o) => setOpen({ ...open, t: o })}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <NumberField prefix="X" label="X" value={612} onChange={() => {}} />
          <NumberField prefix="Y" label="Y" value={760} onChange={() => {}} />
        </div>
      </Section>
      <Section title="Layer and depth" summary="Midground" open={open.l!} onToggle={(o) => setOpen({ ...open, l: o })}><span /></Section>
      <Section title="Expression" summary="Embarrassed" open={open.e!} onToggle={(o) => setOpen({ ...open, e: o })}>
        <SliderRow label="Intensity" value={70} onChange={() => {}} inline format={(n) => `${n} %`} />
        <p className="fr-hint">Applying a recipe adds normal clips you can edit or delete.</p>
      </Section>
    </Panel>
  );
}

const thumb = (c: string) => <span style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${c}, var(--color-subtle))` }} />;

function Lists() {
  const [take, setTake] = useState('2');
  const [tile, setTile] = useState('bun');
  return (
    <Card title="Radio list · asset rows · tile grid" width={300}>
      <RadioList label="Takes" value={take} onChange={setTake} items={[{ value: '1', label: 'Take 1', meta: '3.9 s' }, { value: '2', label: 'Take 2', meta: '4.1 s · chosen' }, { value: '3', label: 'Take 3', meta: 'For previous text', disabled: true, reason: 'For previous text' }]} />
      <div>
        <AssetRow name="Skeptical" meta="Thinking · 1.0 s" thumbnail={thumb('#C8865F')} />
        <AssetRow name="Shrug" meta="Emblem · 1.2 s" thumbnail={thumb('#7B74C0')} selected />
        <AssetRow name="Drink from mug" disabledReason="Needs a prop with a grip anchor" thumbnail={thumb('#8A8F9A')} />
      </div>
      <TileGrid label="Hairstyle" value={tile} onChange={setTile} tiles={[{ value: 'bun', label: 'High bun', preview: thumb('#3A2A22') }, { value: 'bob', label: 'Bob', preview: thumb('#5B3A24') }, { value: 'locs', label: 'Locs', preview: thumb('#2F221C') }, { value: 'afro', label: 'Afro', preview: thumb('#1E1612') }, { value: 'hijab', label: 'Hijab', preview: thumb('#4F8F87') }, { value: 'x', label: 'Mohawk', preview: thumb('#888'), disabled: true, reason: 'Not drawn for side view' }]} />
    </Card>
  );
}

function Feedback() {
  return (
    <>
      <Card title="Jobs · progress" width={320}>
        <JobRow name="Export · 1080p MP4" state="Rendering frame 412 of 720 · 31 fps" progress={412 / 720} elapsedS={14} remainingS={10} onCancel={() => {}} />
        <JobRow name="Generate takes · Maya" state="Generating take 2 of 3…" onCancel={() => {}} />
        <JobRow name="Align take 3" state="Failed: the voice worker stopped" progress={0.4} failed action={<Button variant="ghost">Retry</Button>} />
        <Progress value={1} label="Done" />
      </Card>
      <Card title="Toasts (static)" width={440}>
        {([['success', 'Saved version 3', CheckCircle2], ['warning', 'Take 2 was made for previous text', AlertTriangle], ['error', 'Export failed: disk is full', XCircle]] as const).map(([tone, msg, Icon]) => (
          <div key={tone} className="fr-toast" role="status">
            <span className={`fr-toast__icon fr-toast__icon--${tone}`}><Icon size={16} aria-hidden /></span>
            <span className="fr-toast__msg">{msg}</span>
            {tone !== 'success' && <button type="button" className="fr-btn fr-btn--ghost" style={{ color: 'var(--color-accent-text)', fontWeight: 600 }}>{tone === 'error' ? 'Retry' : 'Undo'}</button>}
          </div>
        ))}
        <div className="fr-tooltip" style={{ position: 'static', alignSelf: 'flex-start' }}>Duplicate<span className="fr-kbd">Ctrl D</span></div>
      </Card>
      <Card title="Empty state · skeleton" width={280}>
        <EmptyState icon={<Sparkles size={28} />} title="No effects yet" action={<Button variant="primary">Add effect</Button>}>Effects appear here when you add them to a character, a prop or the screen.</EmptyState>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Skeleton width={30} height={30} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}><Skeleton width="70%" /><Skeleton width="40%" height={10} /></div></div>
      </Card>
      <Card title="Dialog (static)" width={480}>
        <div className="fr-dialog" role="dialog" aria-label="Delete project" style={{ maxWidth: 'none' }}>
          <div className="fr-dialog__head"><h2 className="fr-dialog__title">Delete “The Backup Recording”?</h2></div>
          <div className="fr-dialog__body">The project folder moves to the system trash. 3 episodes, 14 scenes and 212 takes go with it.</div>
          <div className="fr-dialog__foot"><Button>Cancel</Button><Button variant="danger">Delete project</Button></div>
        </div>
      </Card>
    </>
  );
}

function Shell() {
  const [rail, setRail] = useState('layers');
  const [mode, setMode] = useState('direct');
  return (
    <div style={{ border: '1px solid var(--color-border)', width: '100%', maxWidth: 1180 }}>
      <AppBar
        left={<>
          <MenuBar menus={['File', 'Edit', 'View', 'Insert', 'Scene', 'Help'].map((m) => ({ id: m, label: m, items: menuItems }))} />
          <VSep />
          <Breadcrumb items={[{ label: 'Episodes' }, { label: 'The Backup Recording' }]} />
          <StatusBadge tone="success">Saved</StatusBadge>
        </>}
        center={<Tabs label="Workspace mode" value={mode} onChange={setMode} tabs={[{ value: 'stage', label: 'Stage' }, { value: 'direct', label: 'Direct' }, { value: 'edit', label: 'Edit' }]} />}
        right={<>
          <StatusBadge tone="success">Voice worker</StatusBadge>
          <IconButton label="Switch to light theme" icon={<Moon size={16} />} />
          <IconButton label="Undo" icon={<Undo2 size={16} />} />
          <IconButton label="Redo" icon={<Redo2 size={16} />} />
          <Button>Preview</Button>
          <Button variant="primary" icon={<Download size={14} />}>Export</Button>
        </>}
      />
      <div style={{ display: 'flex', height: 300 }}>
        <Rail value={rail} onChange={setRail} items={[{ id: 'layers', label: 'Layers', icon: <Layers size={18} /> }, { id: 'assets', label: 'Assets', icon: <LayoutGrid size={18} /> }, { id: 'cast', label: 'Cast', icon: <Users size={18} /> }, { id: 'text', label: 'Text', icon: <Type size={18} /> }, { id: 'effects', label: 'Effects', icon: <Sparkles size={18} /> }, { id: 'audio', label: 'Audio', icon: <Music size={18} /> }, { id: 'templates', label: 'Templates', icon: <ImageIcon size={18} /> }]} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-canvas)', position: 'relative' }}>
          <Toolbar label="Selection">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c8653f' }} />Maya Bennett</span>
            <ToolbarSeparator />
            <Button variant="ghost"><span className="fr-faint">Expression</span> <b>Embarrassed</b></Button>
            <Button variant="ghost"><span className="fr-faint">Gesture</span> <b>Talking</b></Button>
            <span className="fr-spacer" />
            <IconButton label="Duplicate" icon={<Copy size={15} />} />
            <IconButton label="Delete" icon={<Trash2 size={15} />} />
          </Toolbar>
          <FloatingControl label="Zoom" style={{ position: 'absolute', right: 14, bottom: 12 }}>
            <IconButton size="sm" label="Zoom out" icon={<span style={{ fontWeight: 700 }}>−</span>} />
            <span style={{ width: 44, textAlign: 'center', fontWeight: 500 }}>100%</span>
            <IconButton size="sm" label="Zoom in" icon={<Plus size={14} />} />
          </FloatingControl>
          <FloatingControl label="Style" style={{ position: 'absolute', left: 14, bottom: 12 }}>
            <span className="fr-faint" style={{ padding: '0 6px' }}>Style</span>
            <Segmented label="Style family" value="flat" onChange={() => {}} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
          </FloatingControl>
        </div>
      </div>
    </div>
  );
}

const stories: Record<string, () => ReactNode> = { buttons: Buttons, fields: Fields, controls: Controls, choices: Choices, menus: Menus, trees: Trees, sections: Sections, lists: Lists, feedback: Feedback, shell: Shell };

function App() {
  const list = story === 'all' ? Object.entries(stories) : Object.entries(stories).filter(([k]) => k === story);
  return (
    <div className="fr-root" style={{ minHeight: '100%', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }} data-story={story}>
      {list.map(([k, S]) => (
        <div key={k} data-testid={`story-${k}`} style={{ display: 'contents' }}>
          <S />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider initial={theme}>
      <PortalRoot>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PortalRoot>
    </ThemeProvider>
  </StrictMode>,
);
