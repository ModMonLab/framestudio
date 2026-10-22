/**
 * Seating (FR-STG-04): putting a character on a prop's seat anchor. The character's hips land on the seat for its
 * body proportions, it draws just in front of the seat on the same depth plane, and it faces the way the seat
 * declares (`anchors.seatFacing`: left, right or front) or keeps its facing. Pure: returns commands.
 */
import type { Command, StyleFamily } from '@frame/schema';
import { composeCharacter, NEUTRAL_FACE, REST_POSE, type FamilyStyle } from '@frame/rig';
import type { ProjectState } from '../state.js';
import { resolveCharacter, type AssetResolver } from './character.js';

export interface SeatOptions {
  assets: AssetResolver;
  styles: Record<StyleFamily, FamilyStyle>;
  family?: StyleFamily;
  /** Seat anchor name on the prop (default `seat`). */
  anchor?: string;
}

/** Seat anchors of a prop manifest (`seat`, `seatL`, `seat2` …) in prop units. */
export function seatAnchors(anchors: Record<string, unknown> | undefined): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(anchors ?? {})) if (/^seat/i.test(k) && k !== 'seatFacing' && Array.isArray(v) && v.length === 2) out[k] = [Number(v[0]), Number(v[1])];
  return out;
}

export function seatCommands(state: ProjectState, sceneId: string, characterId: string, propId: string, o: SeatOptions): Command[] {
  const scene = state.scenes[sceneId];
  const ch = scene?.instances.find((i) => i.id === characterId);
  const prop = scene?.instances.find((i) => i.id === propId);
  if (!scene || !ch?.character || !ch.asset) throw new Error('Choose a character to seat');
  if (!prop?.asset) throw new Error('Choose a seat');
  const pm = o.assets.manifest(prop.asset);
  const seats = seatAnchors(pm?.anchors as Record<string, unknown> | undefined);
  const name = o.anchor ?? Object.keys(seats)[0];
  const seat = name ? seats[name] : undefined;
  if (!seat) throw new Error(`${prop.name} has no seat`);
  const man = o.assets.manifest(ch.asset);
  if (!man) throw new Error(`${ch.asset} not found`);
  // Hip height of this character when seated, from its own proportions.
  const family = o.family ?? state.project.styleFamily;
  const { spec } = resolveCharacter(man, ch.character.look, family, o.styles[family], o.assets, []);
  const facing = (pm?.anchors as { seatFacing?: string } | undefined)?.seatFacing;
  const flipX = facing === 'left' ? !prop.transform.flipX : facing === 'right' ? prop.transform.flipX : ch.transform.flipX;
  const composed = composeCharacter(spec, { view: ch.character.view, flip: flipX, pose: { ...REST_POSE, posture: 'seated' }, face: NEUTRAL_FACE, mouth: null, gaze: [0, 0], overlays: {} });
  const [hipX, hipY] = composed.joints.pelvis.p;
  const ps = prop.transform.scale;
  const flipProp = prop.transform.flipX ? -1 : 1;
  return [{
    name: 'instance.update',
    params: {
      scene: sceneId, id: ch.id,
      set: {
        transform: { x: prop.transform.x + seat[0] * ps * flipProp - hipX * ch.transform.scale, y: prop.transform.y + seat[1] * ps - hipY * ch.transform.scale, flipX },
        depthPlane: prop.depthPlane,
        order: prop.order + 1,
        character: { posture: 'seated' },
      },
    },
  }];
}
