/** Layers (Design System §7.1): Episode → Scenes → Cast, Set, Cameras; selection shared with canvas and timeline. */
import { useMemo, useState } from 'react';
import { Box, Camera, Clapperboard, Film, Plus, User } from 'lucide-react';
import { IconButton, Panel, SearchField, Tree, type TreeNode } from '@frame/ui';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';
import { instanceMenu, useContextMenu } from './ContextMenu.js';

export function LayersPanel() {
  const { studio, assets } = useCtx();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const selection = useStudio(studio, (s) => s.selection);
  const openMenu = useContextMenu();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['ep:' + project.project.episodes[0], 'grp:cast', 'grp:set', 'grp:cameras', ...(sceneId ? [`scn:${sceneId}`] : [])]));

  const nodes = useMemo(() => {
    const out: TreeNode[] = [];
    for (const epId of project.project.episodes) {
      const ep = project.episodes[epId];
      if (!ep) continue;
      out.push({ id: `ep:${epId}`, label: ep.name, icon: <Film size={14} />, emphasis: 'group', renamable: true, meta: `${ep.scenes.length} scene${ep.scenes.length === 1 ? '' : 's'}` });
      for (const sid of ep.scenes) {
        const sc = project.scenes[sid];
        if (!sc) continue;
        out.push({ id: `scn:${sid}`, parent: `ep:${epId}`, label: sc.name, icon: <Clapperboard size={14} />, emphasis: 'group', renamable: true, meta: `${(sc.duration / 48000).toFixed(1)} s`, hasChildren: sid === sceneId });
        if (sid !== sceneId) continue;
        const chars = sc.instances.filter((i) => i.kind === 'character');
        const set = sc.instances.filter((i) => i.kind === 'set-piece' || i.kind === 'prop' || i.kind === 'group' || i.kind === 'text');
        out.push({ id: 'grp:cast', parent: `scn:${sid}`, label: 'Cast', emphasis: 'group', meta: String(chars.length), hasChildren: chars.length > 0 });
        for (const c of chars) {
          out.push({ id: `ins:${c.id}`, parent: 'grp:cast', label: c.name, icon: <User size={14} />, renamable: true, meta: c.character?.posture === 'seated' ? 'Seated' : c.character?.posture ? c.character.posture[0]!.toUpperCase() + c.character.posture.slice(1) : undefined, searchText: c.asset });
          const man = c.asset ? assets.manifest(c.asset) : undefined;
          const looks = (man?.data as { looks?: { id: string; name: string }[] } | undefined)?.looks;
          const look = looks?.find((l) => l.id === c.character?.look)?.name ?? c.character?.look;
          const voice = c.character?.voice ? (project.assets[c.character.voice]?.name ?? assets.manifest(c.character.voice)?.name ?? 'Voice') : 'No voice';
          out.push({ id: `ins:${c.id}:look`, parent: `ins:${c.id}`, label: 'Look', meta: look, emphasis: 'detail' });
          out.push({ id: `ins:${c.id}:voice`, parent: `ins:${c.id}`, label: 'Voice', meta: voice, emphasis: 'detail' });
          out.push({ id: `ins:${c.id}:view`, parent: `ins:${c.id}`, label: 'View', meta: { front: 'Front', three: '¾', side: 'Side', back: 'Back' }[c.character?.view ?? 'front'], emphasis: 'detail' });
        }
        out.push({ id: 'grp:set', parent: `scn:${sid}`, label: 'Set', emphasis: 'group', meta: String(set.length), hasChildren: set.length > 0 });
        const planeName = new Map(sc.stage.depthPlanes.map((p) => [p.id, p.name]));
        for (const p of set) out.push({ id: `ins:${p.id}`, parent: 'grp:set', label: p.name, icon: <Box size={14} />, renamable: true, meta: planeName.get(p.depthPlane) ?? p.depthPlane, searchText: p.asset });
        out.push({ id: 'grp:cameras', parent: `scn:${sid}`, label: 'Cameras', emphasis: 'group', meta: String(sc.cameras.length), hasChildren: true });
        for (const cam of sc.cameras) out.push({ id: `cam:${cam.id}`, parent: 'grp:cameras', label: cam.name, icon: <Camera size={14} />, meta: cam.lens });
      }
    }
    return out;
  }, [project, sceneId, assets]);

  const selected = new Set(selection.map((s) => (s.kind === 'instance' ? `ins:${s.id}` : s.kind === 'camera' ? `cam:${s.id}` : `${s.kind}:${s.id}`)));
  const onSelect = (id: string, e: { shift: boolean; meta: boolean }) => {
    const [kind, rawId] = id.split(':') as [string, string];
    if (kind === 'scn') {
      studio.set({ scene: rawId, selection: [], time: 0, playing: false });
      setExpanded((x) => new Set([...x, id]));
      return;
    }
    if (kind === 'ins' || kind === 'cam') {
      const sel = { kind: kind === 'ins' ? 'instance' as const : 'camera' as const, id: rawId };
      const cur = studio.state.selection;
      studio.set({ selection: e.shift || e.meta ? (cur.some((c) => c.id === sel.id) ? cur.filter((c) => c.id !== sel.id) : [...cur, sel]) : [sel] });
    }
  };

  const addScene = async () => {
    const ep = sceneId ? project.sceneEpisode[sceneId] : project.project.episodes[0];
    if (!ep) return;
    const r = await studio.exec([{ name: 'scene.add', params: { episode: ep, name: `Scene ${(project.episodes[ep]?.scenes.length ?? 0) + 1}` } }]);
    const id = (r?.commands[0]?.params as { id?: string } | undefined)?.id;
    if (id) studio.set({ scene: id, selection: [], time: 0 });
  };

  return (
    <Panel title="Layers" label="Layers" actions={<IconButton size="sm" label="Add scene" icon={<Plus size={14} />} onClick={() => void addScene()} />} search={<SearchField label="Search layers" placeholder="Search layers" value={q} onChange={setQ} />} className="st-left">
      <Tree
        label="Layers"
        nodes={nodes}
        expanded={expanded}
        onExpandedChange={setExpanded}
        selected={selected}
        onSelect={onSelect}
        onRename={(id, label) => {
          const [kind, rawId] = id.split(':');
          if (kind === 'scn') void studio.exec([{ name: 'scene.rename', params: { id: rawId, name: label } }]);
          else if (kind === 'ins' && id.split(':').length === 2) void studio.exec([{ name: 'instance.update', params: { scene: sceneId, id: rawId, set: { name: label } } }]);
          else if (kind === 'ep') void studio.exec([{ name: 'episode.rename', params: { id: rawId, name: label } }]);
        }}
        query={q}
        emptyText="No matches"
        onContextMenu={(id, at) => {
          const [kind, rawId] = id.split(':');
          if (kind === 'ins' && id.split(':').length === 2) openMenu({ ...at, items: instanceMenu(studio, rawId!), label: 'Object actions' });
        }}
      />
    </Panel>
  );
}
