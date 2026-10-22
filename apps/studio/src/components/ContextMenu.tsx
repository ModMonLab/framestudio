/**
 * Context menus (Design System §8): canvas objects, layer rows and clips offer the same actions as the toolbar and
 * properties. One menu is open at a time; it opens at the pointer (or the focused element for Shift+F10).
 */
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { MenuList, Portal, useDismiss, type MenuEntry } from '@frame/ui';
import type { Studio } from '../lib/store.js';
import { deleteSelection, duplicateSelection } from './Workspace.js';
import { api } from '../lib/api.js';

interface MenuState {
  x: number;
  y: number;
  items: MenuEntry[];
  label: string;
}

const Ctx = createContext<(m: MenuState) => void>(() => {});
export const useContextMenu = () => useContext(Ctx);

export function ContextMenuHost({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [ref], []);
  const close = useMemo(() => () => setMenu(null), []);
  useDismiss(!!menu, close, refs);
  return (
    <Ctx.Provider value={setMenu}>
      {children}
      {menu && (
        <Portal>
          <div ref={ref} className="fr-popover st-context" style={{ position: 'fixed', left: Math.min(menu.x, innerWidth - 240), top: Math.min(menu.y, innerHeight - 40 - menu.items.length * 30), width: 230 }}>
            <MenuList items={menu.items} onClose={close} label={menu.label} />
          </div>
        </Portal>
      )}
    </Ctx.Provider>
  );
}

/** Actions for scene objects (shared by the canvas and the Layers tree). */
export function instanceMenu(studio: Studio, id: string): MenuEntry[] {
  const s = studio.state;
  const scene = s.scene ? s.project?.scenes[s.scene] : undefined;
  const inst = scene?.instances.find((i) => i.id === id);
  if (!scene || !inst) return [];
  const same = scene.instances.filter((i) => i.depthPlane === inst.depthPlane).sort((a, b) => a.order - b.order);
  const idx = same.findIndex((i) => i.id === id);
  const set = (patch: Record<string, unknown>, label: string) => void studio.exec([{ name: 'instance.update', params: { scene: scene.id, id, set: patch } }], label);
  return [
    ...(inst.kind === 'character' ? [{ id: 'builder', label: 'Open in builder', onSelect: () => (location.hash = `#/p/${encodeURIComponent(s.pid)}/builder/${scene.id}/${id}`) }, { kind: 'separator' as const, id: 's0' }] : []),
    { id: 'dup', label: 'Duplicate', shortcut: 'Ctrl D', onSelect: () => void duplicateSelection(studio) },
    { id: 'flip', label: 'Flip horizontally', onSelect: () => set({ transform: { ...inst.transform, flipX: !inst.transform.flipX } }, `Flip ${inst.name}`) },
    { id: 'fwd', label: 'Bring forward', disabled: idx >= same.length - 1, disabledReason: 'Already in front in its depth plane', onSelect: () => set({ order: same[idx + 1]!.order + 1 }, `Bring ${inst.name} forward`) },
    { id: 'back', label: 'Send backward', disabled: idx <= 0, disabledReason: 'Already at the back of its depth plane', onSelect: () => set({ order: same[idx - 1]!.order - 1 }, `Send ${inst.name} backward`) },
    { id: 'hide', label: inst.visible ? 'Hide' : 'Show', onSelect: () => set({ visible: !inst.visible }, `${inst.visible ? 'Hide' : 'Show'} ${inst.name}`) },
    { kind: 'separator', id: 's1' },
    { id: 'del', label: 'Delete', shortcut: 'Delete', onSelect: () => void deleteSelection(studio) },
  ];
}

/** Actions for timeline clips. */
export function clipMenu(studio: Studio, id: string): MenuEntry[] {
  const s = studio.state;
  const scene = s.scene ? s.project?.scenes[s.scene] : undefined;
  const clip = scene?.clips.find((c) => c.id === id);
  if (!scene || !clip) return [];
  const inside = s.time > clip.start && s.time < clip.end;
  return [
    { id: 'dup', label: 'Duplicate', shortcut: 'Ctrl D', onSelect: () => void duplicateSelection(studio) },
    { id: 'split', label: 'Split at playhead', disabled: !inside || !!clip.line, disabledReason: clip.line ? 'Dialogue lines are not split' : 'Move the playhead inside the clip', onSelect: () => void studio.exec([{ name: 'clip.split', params: { scene: scene.id, id, at: s.time } }], 'Split clip') },
    { id: 'enable', label: clip.enabled ? 'Disable' : 'Enable', onSelect: () => void studio.exec([{ name: 'clip.update', params: { scene: scene.id, id, set: { enabled: !clip.enabled } } }]) },
    ...(clip.line ? [{ id: 'mute', label: clip.line.muted ? 'Unmute line' : 'Mute line', onSelect: () => void studio.exec([{ name: 'line.setMuted', params: { scene: scene.id, id, muted: !clip.line!.muted } }]) }] : []),
    ...(clip.group ? [{ id: 'ungroup', label: 'Ungroup', onSelect: () => void studio.exec([{ name: 'clip.ungroup', params: { scene: scene.id, group: clip.group } }], 'Ungroup clips') }] : []),
    {
      id: 'recipe', label: 'Save selection as recipe…', disabled: !!clip.line, disabledReason: 'Dialogue lines are not saved in recipes',
      onSelect: () => {
        // Selected clips (and the rest of this clip's group) become a recipe with role placeholders (FR-RCP-04).
        const ids = new Set(s.selection.filter((x) => x.kind === 'clip').map((x) => x.id).concat(id));
        if (clip.group) for (const c of scene.clips) if (c.group === clip.group) ids.add(c.id);
        const name = window.prompt('Recipe name', 'My recipe');
        if (!name?.trim()) return;
        api.saveRecipe(s.pid, scene.id, [...ids], name.trim()).then(() => studio.set({ lastError: undefined })).catch((e: Error) => studio.set({ lastError: { message: e.message } }));
      },
    },
    { kind: 'separator', id: 's1' },
    { id: 'del', label: 'Delete', shortcut: 'Delete', onSelect: () => void deleteSelection(studio) },
  ];
}
