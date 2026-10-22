/** Expression presets (E1), overlays mapping (E2) and action curves (F1) as data. */
import type { ActionData, ExpressionData, Key } from '../../packages/core/src/perform/data.js';

type E = ExpressionData;
const e = (o: E): E => ({ intensity: 70, transition: 0.25, ...o });

/** Building blocks shared by many expressions. */
const SMILE: E = { eyeOpen: 0.82, eyeLower: 0.35, mouthCurve: 1, cheek: 0.6, browInner: 0.15, restMouth: 'X' };
const OPEN_SMILE: E = { ...SMILE, restMouth: 'B', mouthCurve: 1.1 };
const SAD: E = { eyeOpen: 0.85, browInner: 0.85, browOuter: -0.35, mouthCurve: -0.9, lookDown: 0.3 };
const ANGRY: E = { eyeOpen: 0.78, browInner: -0.85, browOuter: 0.2, browFurrow: 1, mouthCurve: -0.6, restMouth: 'A' };
const FEAR: E = { eyeOpen: 1.28, browInner: 1, browOuter: 0.2, browFurrow: 0.4, mouthCurve: -0.5, mouthWidth: 0.4, restMouth: 'B' };
const SURPRISE: E = { eyeOpen: 1.32, browInner: 0.95, browOuter: 0.9, restMouth: 'E' };

export const EXPRESSIONS: Record<string, E> = {
  content: e({ ...SMILE, mouthCurve: 0.55, eyeOpen: 0.92, eyeLower: 0.15, cheek: 0.3, intensity: 60 }),
  smile: e(SMILE),
  'big-grin': e({ ...OPEN_SMILE, restMouth: 'C', eyeOpen: 0.6, eyeLower: 0.55, cheek: 1, mouthWidth: 0.5 }),
  laugh: e({ eyeOpen: 0, eyeHappy: 1, mouthCurve: 1.1, restMouth: 'D', cheek: 1, browInner: 0.3, head: { pitch: -8 } }),
  giggle: e({ eyeOpen: 0.35, eyeHappy: 0.6, mouthCurve: 1, restMouth: 'B', cheek: 0.9, browInner: 0.3 }),
  delighted: e({ ...OPEN_SMILE, eyeOpen: 1.05, browInner: 0.6, browOuter: 0.5, restMouth: 'C' }),
  proud: e({ ...SMILE, eyeOpen: 0.8, mouthCurve: 0.8, head: { pitch: -6 }, browOuter: 0.2 }),
  smug: e({ eyeOpen: 0.65, mouthCurve: 0.7, mouthWidth: 0.2, browInnerL: -0.2, browOuterL: 0.4, browInnerR: 0.1, head: { pitch: -4, roll: 4 } }),
  relieved: e({ eyeOpen: 0.55, mouthCurve: 0.5, browInner: 0.45, browOuter: -0.2, head: { pitch: 3 } }),
  amused: e({ ...SMILE, mouthCurve: 0.75, eyeOpen: 0.75, browOuterL: 0.4 }),
  loving: e({ eyeOpen: 0.6, eyeLower: 0.3, mouthCurve: 0.7, cheek: 0.8, browInner: 0.4, overlay: 'overlay.blush@1', overlayAmount: 0.6, head: { roll: 6 } }),
  grateful: e({ eyeOpen: 0.75, mouthCurve: 0.7, browInner: 0.6, head: { pitch: 5 } }),
  excited: e({ eyeOpen: 1.25, mouthCurve: 1.1, restMouth: 'C', browInner: 0.8, browOuter: 0.8, cheek: 0.8 }),
  starstruck: e({ eyeOpen: 1.3, mouthCurve: 1, restMouth: 'E', browInner: 0.9, browOuter: 0.9, overlay: 'overlay.sparkle-eyes@1' }),
  sad: e(SAD),
  teary: e({ ...SAD, overlay: 'overlay.tears@1', overlayAmount: 0.8 }),
  crying: e({ ...SAD, eyeOpen: 0.4, restMouth: 'C', mouthCurve: -1, overlay: 'overlay.tear-streams@1' }),
  sobbing: e({ ...SAD, eyeOpen: 0.1, eyeHappy: -0.2, restMouth: 'D', mouthCurve: -1.1, overlay: 'overlay.tear-streams@1', head: { pitch: 8 } }),
  disappointed: e({ ...SAD, browInner: 0.5, mouthCurve: -0.6, eyeOpen: 0.75, lookDown: 0.5 }),
  hurt: e({ ...SAD, browInner: 1, eyeOpen: 0.9, mouthCurve: -0.7, restMouth: 'B' }),
  lonely: e({ ...SAD, eyeOpen: 0.7, mouthCurve: -0.4, lookDown: 0.7, browInner: 0.6 }),
  ashamed: e({ ...SAD, eyeOpen: 0.6, lookDown: 1, mouthCurve: -0.5, overlay: 'overlay.blush@1', overlayAmount: 0.5, head: { pitch: 12 } }),
  guilty: e({ ...SAD, eyeOpen: 0.7, lookDown: 0.8, mouthCurve: -0.3, gaze: [-0.6, 0.3] }),
  defeated: e({ ...SAD, eyeOpen: 0.5, lookDown: 0.6, mouthCurve: -0.7, head: { pitch: 14 } }),
  annoyed: e({ ...ANGRY, browFurrow: 0.5, browInner: -0.4, mouthCurve: -0.3, restMouth: 'X', eyeOpen: 0.8 }),
  irritated: e({ ...ANGRY, browFurrow: 0.7, browInner: -0.55, mouthCurve: -0.45, eyeOpen: 0.75 }),
  frustrated: e({ ...ANGRY, browInner: 0.3, browFurrow: 0.8, mouthCurve: -0.7, restMouth: 'B' }),
  angry: e(ANGRY),
  furious: e({ ...ANGRY, eyeOpen: 0.9, restMouth: 'B', mouthWidth: 0.5, browInner: -1, overlay: 'overlay.anger-vein@1' }),
  seething: e({ ...ANGRY, eyeOpen: 0.55, eyeLower: 0.4, restMouth: 'A', mouthWidth: 0.3, overlay: 'overlay.shadowed-eyes@1', overlayAmount: 0.6 }),
  indignant: e({ ...ANGRY, browInner: -0.3, browOuter: 0.5, mouthCurve: -0.5, head: { pitch: -6 } }),
  contemptuous: e({ eyeOpen: 0.7, mouthCurve: 0.2, mouthWidth: -0.2, browInnerR: -0.3, browOuterR: 0.4, head: { pitch: -8, roll: -5 } }),
  nervous: e({ ...FEAR, eyeOpen: 1.08, browInner: 0.7, mouthCurve: 0.2, mouthWidth: 0.3, restMouth: 'A', overlay: 'overlay.sweat-drop@1', overlayAmount: 0.7 }),
  anxious: e({ ...FEAR, eyeOpen: 1.12, browInner: 0.9, mouthCurve: -0.3, restMouth: 'A' }),
  worried: e({ ...FEAR, eyeOpen: 1.0, browInner: 0.85, browOuter: -0.2, mouthCurve: -0.4, restMouth: 'X' }),
  scared: e(FEAR),
  terrified: e({ ...FEAR, eyeOpen: 1.4, restMouth: 'D', mouthWidth: 0.6, overlay: 'overlay.pale@1' }),
  panicked: e({ ...FEAR, eyeOpen: 1.35, restMouth: 'C', overlay: 'overlay.sweat-drop@1' }),
  uneasy: e({ ...FEAR, eyeOpen: 0.95, browInner: 0.5, mouthCurve: -0.2, restMouth: 'X', gaze: [0.5, 0] }),
  sheepish: e({ eyeOpen: 0.75, browInner: 0.6, mouthCurve: 0.4, mouthWidth: -0.2, lookDown: 0.3, overlay: 'overlay.blush@1', overlayAmount: 0.4, head: { roll: 6 } }),
  surprised: e(SURPRISE),
  shocked: e({ ...SURPRISE, eyeOpen: 1.4, restMouth: 'D' }),
  stunned: e({ ...SURPRISE, eyeOpen: 1.25, restMouth: 'B', browInner: 0.7, browOuter: 0.6 }),
  gasp: e({ ...SURPRISE, restMouth: 'F', eyeOpen: 1.3 }),
  'double-take-face': e({ ...SURPRISE, eyeOpen: 1.42, restMouth: 'C', browInner: 1 }),
  'jaw-drop': e({ ...SURPRISE, restMouth: 'D', eyeOpen: 1.2, mouthWidth: -0.2 }),
  thinking: e({ eyeOpen: 0.85, browInnerL: 0.5, browOuterL: 0.3, browInnerR: -0.2, mouthCurve: -0.1, mouthWidth: -0.2, gaze: [0.4, -0.6] }),
  confused: e({ eyeOpen: 0.95, browInnerL: 0.7, browOuterL: 0.6, browInnerR: -0.4, browFurrow: 0.3, mouthCurve: -0.3, head: { roll: 8 } }),
  puzzled: e({ eyeOpen: 0.9, browInner: 0.5, browFurrow: 0.4, mouthCurve: -0.2, restMouth: 'A', head: { roll: -6 } }),
  skeptical: e({ eyeOpenL: 0.95, eyeOpenR: 0.7, browInnerL: 0.6, browOuterL: 0.8, browInnerR: -0.3, mouthCurve: 0.25, mouthWidth: -0.1 }),
  suspicious: e({ eyeOpen: 0.55, eyeLower: 0.3, browInner: -0.4, browFurrow: 0.5, mouthCurve: -0.2, gaze: [0.6, 0] }),
  doubtful: e({ eyeOpen: 0.8, browInnerL: 0.5, browInnerR: 0.1, mouthCurve: -0.35, mouthWidth: -0.2 }),
  calculating: e({ eyeOpen: 0.6, eyeLower: 0.3, browInner: -0.2, mouthCurve: 0.1, gaze: [0.3, -0.3] }),
  eureka: e({ eyeOpen: 1.3, browInner: 0.9, browOuter: 0.9, mouthCurve: 0.9, restMouth: 'C' }),
  embarrassed: e({ eyeOpen: 0.72, browInner: 0.55, browOuter: -0.1, mouthCurve: 0.2, mouthWidth: -0.3, gaze: [-0.4, 0.4], overlay: 'overlay.blush@1', overlayAmount: 0.9, cheek: 0.4 }),
  flustered: e({ eyeOpen: 1.1, browInner: 0.8, mouthCurve: 0.1, restMouth: 'B', overlay: 'overlay.heavy-blush@1', overlayAmount: 0.9 }),
  awkward: e({ eyeOpen: 0.9, browInner: 0.4, mouthCurve: 0.25, mouthWidth: 0.4, restMouth: 'A', gaze: [0.5, 0] }),
  shy: e({ eyeOpen: 0.7, lookDown: 0.6, mouthCurve: 0.35, mouthWidth: -0.3, browInner: 0.4, overlay: 'overlay.blush@1', overlayAmount: 0.6, head: { pitch: 8, roll: 4 } }),
  flirty: e({ eyeOpenL: 0.75, eyeOpenR: 0.35, mouthCurve: 0.8, cheek: 0.5, browOuterL: 0.4, head: { roll: 6 } }),
  teasing: e({ eyeOpen: 0.7, mouthCurve: 0.8, mouthWidth: 0.2, browInnerL: 0.5, browOuterL: 0.6, restMouth: 'B' }),
  sarcastic: e({ eyeOpen: 0.6, mouthCurve: 0.3, mouthWidth: -0.1, browInnerL: 0.6, browOuterL: 0.7, browInnerR: -0.2 }),
  'polite-smile': e({ ...SMILE, mouthCurve: 0.6, eyeOpen: 0.95, eyeLower: 0.05, cheek: 0.2 }),
  'fake-smile': e({ mouthCurve: 0.9, mouthWidth: 0.4, eyeOpen: 1.0, browInner: 0.2, restMouth: 'B' }),
  'eye-roll': e({ eyeOpen: 0.7, gaze: [0.2, -1], mouthCurve: -0.2, browOuter: 0.3, head: { roll: -5, pitch: -4 } }),
  bored: e({ eyeOpen: 0.5, mouthCurve: -0.2, browInner: -0.1, head: { roll: 8 } }),
  tired: e({ eyeOpen: 0.42, browInner: 0.3, mouthCurve: -0.25, lookDown: 0.2 }),
  sleepy: e({ eyeOpen: 0.25, browInner: 0.2, mouthCurve: 0, head: { pitch: 6, roll: 6 } }),
  unimpressed: e({ eyeOpen: 0.55, mouthCurve: -0.3, mouthWidth: -0.1, browInner: -0.1 }),
  deadpan: e({ eyeOpen: 0.62, mouthCurve: 0, mouthWidth: 0.1 }),
  'zoned-out': e({ eyeOpen: 0.6, gaze: [0, 0], mouthCurve: 0, restMouth: 'B', browInner: 0 }),
  'raised-eyebrow': e({ browInnerL: 0.8, browOuterL: 0.9, eyeOpenL: 1.05, intensity: 80 }),
  'slight-frown': e({ mouthCurve: -0.45, browInner: -0.2, browFurrow: 0.3, intensity: 60 }),
  'lip-press': e({ restMouth: 'A', mouthWidth: -0.2, mouthCurve: -0.1 }),
  'half-smile': e({ mouthCurve: 0.45, mouthWidth: 0.1, eyeOpen: 0.9, cheek: 0.2 }),
  'nose-wrinkle': e({ eyeOpen: 0.65, eyeLower: 0.4, mouthCurve: -0.2, browInner: -0.3, browFurrow: 0.6, cheek: 0.6 }),
  squint: e({ eyeOpen: 0.45, eyeLower: 0.6, browInner: -0.2, cheek: 0.4 }),
  'blink-pause': e({ eyeOpen: 0, mouthCurve: 0, transition: 0.08, intensity: 100 }),
  'side-eye': e({ eyeOpen: 0.7, gaze: [1, 0], browInner: -0.2, mouthCurve: -0.1 }),
  disgusted: e({ eyeOpen: 0.6, eyeLower: 0.4, browInner: -0.4, browFurrow: 0.8, mouthCurve: -0.8, restMouth: 'B', mouthWidth: 0.2, overlay: 'overlay.sick-green@1', overlayAmount: 0.3 }),
  determined: e({ eyeOpen: 0.85, browInner: -0.4, browFurrow: 0.4, mouthCurve: 0.15, restMouth: 'A' }),
  focused: e({ eyeOpen: 0.75, browInner: -0.3, browFurrow: 0.5, mouthCurve: 0, gaze: [0.4, 0.1] }),
  dreamy: e({ eyeOpen: 0.55, mouthCurve: 0.5, browInner: 0.4, gaze: [0.2, -0.6], head: { roll: 6, pitch: -5 } }),
  mischievous: e({ eyeOpen: 0.6, eyeLower: 0.3, mouthCurve: 0.9, mouthWidth: 0.3, browInner: -0.4, browOuter: 0.5 }),
};

/* ------------------------------------------------------------------ actions */

const k = <T>(...pairs: [number, T, Key['e']?][]): Key<T>[] => pairs.map(([t, v, ease]) => ({ t, v, ...(ease ? { e: ease } : {}) }));

const REST_ARM = [0.14, -0.97, 0.06];
const A = (o: Partial<ActionData> & Pick<ActionData, 'channels' | 'keys'>): ActionData => ({ loop: false, duration: 1.5, postures: ['standing', 'seated'], ...o });

/** Talking-group actions loop and are additive-friendly gestures for the dominant hand (R by default). */
export const ACTIONS: Record<string, ActionData> = {
  breathe: A({ channels: ['torso'], additive: true, loop: true, duration: 4, keys: { breath: k([0, 0], [0.5, 1], [1, 0]) } }),
  'shift-weight': A({ channels: ['root', 'torso'], loop: true, duration: 5, postures: ['standing'], keys: { 'spine.roll': k([0, -2], [0.5, 2], [1, -2]), 'offset.x': k([0, -3], [0.5, 3], [1, -3]) } }),
  nod: A({ channels: ['head'], additive: true, duration: 0.8, keys: { 'head.pitch': k([0, 0], [0.3, 12], [0.6, -3], [1, 0]) } }),
  'slow-nod': A({ channels: ['head'], additive: true, duration: 1.4, keys: { 'head.pitch': k([0, 0], [0.4, 9], [1, 0]) } }),
  'head-shake': A({ channels: ['head'], additive: true, duration: 1.2, keys: { 'head.yaw': k([0, 0], [0.2, -14], [0.45, 14], [0.7, -12], [1, 0]) } }),
  'head-tilt': A({ channels: ['head'], additive: true, duration: 1.2, keys: { 'head.roll': k([0, 0], [0.3, 12], [0.8, 12], [1, 0]) } }),
  'calm-talk': A({ channels: ['armR', 'handR'], loop: true, duration: 2.4, hand: 'R', keys: { armR: k([0, [0.35, -0.55, 0.45]], [0.35, [0.42, -0.45, 0.5]], [0.7, [0.3, -0.6, 0.42]], [1, [0.35, -0.55, 0.45]]), handR: k([0, 'open-palm'], [0.5, 'relaxed'], [1, 'open-palm']) } }),
  'emphatic-talk': A({ channels: ['armR', 'armL', 'handR', 'handL'], loop: true, duration: 1.6, hand: 'both', keys: { armR: k([0, [0.45, -0.35, 0.55]], [0.25, [0.5, -0.15, 0.6]], [0.5, [0.45, -0.45, 0.5]], [0.75, [0.55, -0.2, 0.55]], [1, [0.45, -0.35, 0.55]]), armL: k([0, [0.4, -0.5, 0.45]], [0.5, [0.45, -0.3, 0.55]], [1, [0.4, -0.5, 0.45]]), handR: k([0, 'open-palm']), handL: k([0, 'open-palm']), 'head.pitch': k([0, 0], [0.25, 5], [0.5, -2], [0.75, 4], [1, 0]) } }),
  'explain-with-hands': A({ channels: ['armR', 'armL', 'handR', 'handL'], loop: true, duration: 2.8, hand: 'both', keys: { armR: k([0, [0.5, -0.45, 0.45]], [0.5, [0.35, -0.4, 0.55]], [1, [0.5, -0.45, 0.45]]), armL: k([0, [0.35, -0.42, 0.55]], [0.5, [0.5, -0.45, 0.45]], [1, [0.35, -0.42, 0.55]]), handR: k([0, 'open-palm']), handL: k([0, 'cupped']) } }),
  'beat-gesture': A({ channels: ['armR', 'handR'], loop: true, duration: 0.9, hand: 'R', keys: { armR: k([0, [0.35, -0.45, 0.5]], [0.4, [0.38, -0.62, 0.5]], [1, [0.35, -0.45, 0.5]]), handR: k([0, 'relaxed']) } }),
  'open-palms': A({ channels: ['armR', 'armL', 'handR', 'handL'], duration: 1.4, hand: 'both', keys: { armR: k([0, REST_ARM], [0.35, [0.55, -0.55, 0.45]], [0.75, [0.55, -0.55, 0.45]], [1, REST_ARM]), armL: k([0, REST_ARM], [0.35, [0.55, -0.55, 0.45]], [0.75, [0.55, -0.55, 0.45]], [1, REST_ARM]), handR: k([0, 'open-palm']), handL: k([0, 'open-palm']) } }),
  'wave-hello': A({ channels: ['armR', 'handR'], duration: 1.8, hand: 'R', keys: { armR: k([0, REST_ARM], [0.2, [0.55, 0.45, 0.2]], [0.35, [0.7, 0.4, 0.2]], [0.5, [0.5, 0.48, 0.2]], [0.65, [0.7, 0.4, 0.2]], [0.8, [0.55, 0.45, 0.2]], [1, REST_ARM]), handR: k([0, 'wave-flat']) } }),
  'point-at': A({ channels: ['armR', 'handR'], duration: 1.6, hand: 'R', keys: { armR: k([0, REST_ARM], [0.25, [0.22, 0.02, 0.95], 'overshoot'], [0.8, [0.22, 0.02, 0.95]], [1, REST_ARM]), handR: k([0, 'point']) } }),
  shrug: A({ channels: ['armR', 'armL', 'handR', 'handL', 'torso', 'head'], duration: 1.2, hand: 'both', keys: { shrug: k([0, 0], [0.35, 1], [0.75, 1], [1, 0]), armR: k([0, REST_ARM], [0.35, [0.5, -0.6, 0.35]], [0.75, [0.5, -0.6, 0.35]], [1, REST_ARM]), armL: k([0, REST_ARM], [0.35, [0.5, -0.6, 0.35]], [0.75, [0.5, -0.6, 0.35]], [1, REST_ARM]), handR: k([0, 'open-palm']), handL: k([0, 'open-palm']), 'head.roll': k([0, 0], [0.4, 8], [0.8, 8], [1, 0]) } }),
  'seated-relaxed': A({ channels: ['posture', 'armL', 'armR'], loop: true, duration: 4, postures: ['seated'], keys: { posture: k([0, 'seated']), armR: k([0, [0.25, -0.6, 0.5]]), armL: k([0, [0.25, -0.6, 0.5]]), 'spine.pitch': k([0, -4]) } }),
  'seated-lean-in': A({ channels: ['posture', 'torso'], loop: true, duration: 4, postures: ['seated'], keys: { posture: k([0, 'seated']), 'spine.pitch': k([0, 10]), armR: k([0, [0.25, -0.5, 0.6]]), armL: k([0, [0.25, -0.5, 0.6]]) } }),
  'sit-down': A({ channels: ['posture', 'root'], duration: 1.2, postures: ['standing'], resultPosture: 'seated', keys: { posture: k([0, 'standing'], [0.5, 'seated']), 'spine.pitch': k([0, 0], [0.4, 20], [1, 0]) } }),
  'stand-up': A({ channels: ['posture', 'root'], duration: 1.2, postures: ['seated'], resultPosture: 'standing', keys: { posture: k([0, 'seated'], [0.5, 'standing']), 'spine.pitch': k([0, 0], [0.4, 20], [1, 0]) } }),
  'arms-crossed': A({ channels: ['armR', 'armL', 'handR', 'handL'], loop: true, duration: 3, hand: 'both', keys: { armR: k([0, [-0.3, -0.45, 0.4]], [1, [-0.3, -0.45, 0.4]]), armL: k([0, [-0.28, -0.4, 0.42]], [1, [-0.28, -0.4, 0.42]]), handR: k([0, 'fist']), handL: k([0, 'fist']) } }),
};
