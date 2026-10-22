/**
 * Object interactions (FR-ACT-06, FR-PRP-01): an acting clip whose action declares `prop` binds to a prop instance
 * (`params.prop`). Within the action's hold window the prop attaches to the character's grip anchor and follows the
 * hand; afterwards it returns to its place, or stays in the hand when the action says it does not return. Action
 * events can set the prop's state (`propState`) and emit sound cues (`sound`). State is a pure function of time:
 * the latest state change at or before t wins, so seeking into the middle of an action shows the right state.
 */
import type { Clip, Instance, Scene } from '@frame/schema';
import type { ActionData, ActionLookup } from './data.js';

export interface Interaction {
  clip: Clip;
  holder: Instance;
  action: ActionData;
  hand: 'L' | 'R';
  /** Absolute hold window in ticks; `end` is Infinity when the prop stays in the hand. */
  hold: { start: number; end: number };
}

/** Interactions that use a prop, in time order. */
export function interactionsFor(scene: Scene, propId: string, actionOf: ActionLookup): Interaction[] {
  const tracks = new Map(scene.tracks.filter((t) => t.kind === 'acting' && !t.mute).map((t) => [t.id, t]));
  const out: Interaction[] = [];
  for (const c of scene.clips) {
    if (!c.enabled || c.params.prop !== propId || !c.asset) continue;
    const tr = tracks.get(c.track);
    const holder = tr ? scene.instances.find((i) => i.id === tr.owner && i.kind === 'character') : undefined;
    const action = actionOf(c.asset);
    if (!holder || !action) continue;
    const grip = action.prop?.grip ?? (action.hand === 'L' ? 'L' : 'R');
    const hand = c.params.hand === 'L' || c.params.hand === 'R' ? c.params.hand : grip;
    const dur = c.end - c.start;
    const [h0, h1] = action.prop?.hold ?? [0, 1];
    out.push({ clip: c, holder, action, hand, hold: { start: c.start + h0 * dur, end: action.prop ? (action.prop.returns === false ? Infinity : c.start + h1 * dur) : -Infinity } });
  }
  // Ordered by when each interaction takes hold of the prop (a hand-over grips before the receive does).
  const key = (x: Interaction) => (x.action.prop ? x.hold.start : x.clip.start);
  out.sort((a, b) => key(a) - key(b) || a.clip.id.localeCompare(b.clip.id));
  // A prop kept in the hand is released when the next interaction takes it (hand-over → receive), or when the
  // next interaction starts if that one does not hold it.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i]!.hold.end !== Infinity) continue;
    const next = out[i + 1]!;
    out[i]!.hold.end = next.action.prop ? Math.max(out[i]!.hold.start, next.hold.start) : next.clip.start;
  }
  return out;
}

/** Who holds the prop at t (and with which hand), if anyone. */
export function holderAt(scene: Scene, propId: string, t: number, actionOf: ActionLookup): Interaction | undefined {
  let found: Interaction | undefined;
  for (const it of interactionsFor(scene, propId, actionOf)) if (it.action.prop && t >= it.hold.start && t < it.hold.end) found = it;
  return found;
}

/**
 * The prop's state at t: its starting state, changed by state events of actions that use it and by `setState`
 * clips on its own track (both persist), with `state` clips on its own track applying while they play.
 */
export function propStateAt(scene: Scene, inst: Instance, t: number, actionOf: ActionLookup): string {
  const changes: [number, string][] = [];
  for (const it of interactionsFor(scene, inst.id, actionOf)) {
    for (const ev of it.action.events ?? []) {
      if (!ev.propState) continue;
      const at = it.clip.start + ev.t * (it.clip.end - it.clip.start);
      if (at <= t) changes.push([at, ev.propState]);
    }
  }
  const own = new Set(scene.tracks.filter((x) => x.owner === inst.id && !x.mute).map((x) => x.id));
  for (const c of scene.clips) {
    if (!c.enabled || !own.has(c.track)) continue;
    if (typeof c.params.setState === 'string' && c.end <= t) changes.push([c.end, c.params.setState]);
  }
  changes.sort((a, b) => a[0] - b[0]);
  let st = changes.length ? changes[changes.length - 1]![1] : inst.propState ?? 'default';
  for (const c of scene.clips) if (c.enabled && own.has(c.track) && typeof c.params.state === 'string' && t >= c.start && t < c.end) st = c.params.state;
  return st;
}

/** Whether an action can be used with a prop (FR-PRP-02): held actions need a grip anchor; state actions need the states. */
export function actionFitsProp(action: ActionData, prop: { anchors?: Record<string, unknown>; parameters?: { key: string; options?: string[] }[] }): boolean {
  const states = prop.parameters?.find((p) => p.key === 'state')?.options ?? [];
  const evStates = (action.events ?? []).map((e) => e.propState).filter((x): x is string => !!x);
  if (action.prop) return !!prop.anchors?.grip && evStates.every((s) => states.includes(s));
  return evStates.length > 0 && evStates.every((s) => states.includes(s));
}
