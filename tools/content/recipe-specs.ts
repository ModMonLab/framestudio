/**
 * Performance recipes (Catalog G1) and shot recipes (Catalog M1 "Shot recipe") as data for the recipe engine
 * (packages/core/src/recipes.ts). Every step is an ordinary clip; references are library assets, so missing ones
 * are reported and skipped when the recipe is applied rather than invented.
 */
import type { RecipeData } from '../../packages/core/src/index.js';

const C = (key: string, label: string) => ({ key, label, kind: 'character' as const });
const P = (key: string, label: string) => ({ key, label, kind: 'prop' as const });

export const RECIPES: Record<string, RecipeData> = {
  interruption: {
    roles: [C('speaker', 'Speaker'), C('interrupter', 'Interrupter')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'interrupter', track: 'face', asset: 'exp.determined@1', at: { frac: 0.5 }, end: { line: 'end', offset: 1.5 }, blendIn: 0.2, blendOut: 0.3 },
      { role: 'interrupter', track: 'acting', asset: 'act.emphatic-talk@1', at: { frac: 0.6 }, end: { line: 'end', offset: 1.2 }, blendIn: 0.2, blendOut: 0.3 },
      { role: 'speaker', track: 'face', asset: 'exp.surprised@1', at: { frac: 0.65 }, dur: 1.8, blendIn: 0.1, blendOut: 0.4 },
      { role: 'speaker', track: 'gaze', at: { frac: 0.6 }, end: { line: 'end', offset: 1.5 }, params: { target: '$interrupter' } },
      { track: 'shot', at: { frac: 0.6 }, end: { line: 'end', offset: 1.5 }, shot: { framing: 'cam.medium-close-up@1', subjects: ['interrupter'] } },
    ],
  },
  'double-take-gag': {
    roles: [C('reactor', 'Reactor'), C('target', 'What they see')], duration: 3.5,
    steps: [
      { role: 'reactor', track: 'gaze', at: 0, dur: 0.6, params: { target: '$target' } },
      { role: 'reactor', track: 'gaze', at: 0.6, dur: 0.7, params: { target: 'camera' } },
      { role: 'reactor', track: 'gaze', at: 1.3, dur: 2.2, params: { target: '$target' } },
      { role: 'reactor', track: 'face', asset: 'exp.double-take-face@1', at: 1.3, dur: 2.2, blendIn: 0.05, blendOut: 0.3 },
      { track: 'shot', at: 1.3, dur: 2.2, shot: { framing: 'cam.close-up@1', subjects: ['reactor'] } },
      { track: 'camera-move', asset: 'cam.snap-zoom@1', at: 1.3, dur: 0.35 },
      { track: 'sfx', asset: 'sfx.boing@1', at: 1.3, dur: 0.9 },
    ],
  },
  'hand-over-object': {
    roles: [C('giver', 'Giver'), C('receiver', 'Receiver'), P('object', 'Object')], duration: 2.6,
    steps: [
      { role: 'giver', track: 'gaze', at: 0, dur: 2.4, params: { target: '$receiver' } },
      { role: 'receiver', track: 'gaze', at: 0.4, dur: 2.2, params: { target: '$object' } },
      { role: 'giver', track: 'acting', asset: 'act.hand-over@1', at: 0, dur: 1.6, params: { prop: '$object' } },
      { role: 'receiver', track: 'acting', asset: 'act.receive@1', at: 0, dur: 1.6, params: { prop: '$object' } },
      { track: 'shot', at: 0, dur: 2.6, shot: { framing: 'cam.two-shot@1', subjects: ['giver', 'receiver'] } },
    ],
  },
  'coffee-break': {
    roles: [C('drinker', 'Drinker'), P('mug', 'Mug')], duration: 4.8,
    steps: [
      { role: 'drinker', track: 'gaze', at: 0, dur: 0.9, params: { target: '$mug' } },
      { role: 'drinker', track: 'acting', asset: 'act.drink-from-mug@1', at: 0.3, dur: 4, params: { prop: '$mug' } },
      { role: 'drinker', track: 'face', asset: 'exp.content@1', at: 2.2, dur: 2.6, blendIn: 0.4, blendOut: 0.4 },
    ],
  },
  'phone-call': {
    roles: [C('caller', 'Caller'), P('phone', 'Phone')], duration: 7,
    steps: [
      { track: 'sfx', asset: 'sfx.phone-ring@1', at: 0, dur: 1.8 },
      { role: 'caller', track: 'gaze', at: 0.2, dur: 1, params: { target: '$phone' } },
      { role: 'caller', track: 'acting', asset: 'act.use-phone@1', at: 1, dur: 6, params: { prop: '$phone' } },
      { role: 'caller', track: 'face', asset: 'exp.focused@1', at: 2, dur: 4.5, blendIn: 0.3, blendOut: 0.3 },
    ],
  },
  'listen-and-nod': {
    roles: [C('speaker', 'Speaker'), C('listener', 'Listener')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'listener', track: 'gaze', at: { line: 'start' }, end: { line: 'end' }, params: { target: '$speaker' } },
      { role: 'listener', track: 'face', asset: 'exp.polite-smile@1', at: { line: 'start' }, end: { line: 'end' }, blendIn: 0.3, blendOut: 0.3, params: { intensity: 50 } },
      { role: 'listener', track: 'acting', asset: 'act.nod@1', at: { word: 2 }, dur: 0.8 },
      { role: 'listener', track: 'acting', asset: 'act.slow-nod@1', at: { frac: 0.55 }, dur: 1.4 },
      { role: 'listener', track: 'acting', asset: 'act.nod@1', at: { word: 'last', edge: 'end' }, dur: 0.8 },
    ],
  },
  'question-and-reaction': {
    roles: [C('speaker', 'Asker'), C('listener', 'Listener')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'listener', track: 'face', asset: 'exp.raised-eyebrow@1', at: { word: 'last' }, dur: 2, blendIn: 0.15, blendOut: 0.4 },
      { track: 'shot', at: { word: 'last' }, end: { line: 'end', offset: 2 }, shot: { framing: 'cam.close-up@1', subjects: ['listener'] } },
    ],
  },
  'agree-and-disagree': {
    roles: [C('agreer', 'Agrees'), C('disagreer', 'Disagrees')], duration: 2.4,
    steps: [
      { role: 'agreer', track: 'acting', asset: 'act.nod@1', at: 0, dur: 0.8 },
      { role: 'agreer', track: 'acting', asset: 'act.nod@1', at: 0.9, dur: 0.8 },
      { role: 'disagreer', track: 'acting', asset: 'act.head-shake@1', at: 1.1, dur: 1.2 },
      { track: 'shot', at: 0, dur: 1.1, shot: { framing: 'cam.close-up@1', subjects: ['agreer'] } },
      { track: 'shot', at: 1.1, dur: 1.3, shot: { framing: 'cam.close-up@1', subjects: ['disagreer'] } },
    ],
  },
  'embarrassed-reply': {
    roles: [C('speaker', 'Speaker'), C('listener', 'Listener')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'speaker', track: 'face', asset: 'exp.embarrassed@1', at: { line: 'start', offset: -0.3 }, end: { line: 'end' }, blendIn: 0.3, blendOut: 0.3 },
      { role: 'speaker', track: 'gaze', at: { line: 'start', offset: -0.3 }, end: { word: 'last' }, params: { target: 'camera' } },
      { role: 'speaker', track: 'gaze', at: { word: 'last' }, end: { line: 'end', offset: 1 }, params: { target: '$listener' } },
    ],
  },
  'sarcastic-reply': {
    roles: [C('speaker', 'Speaker')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'speaker', track: 'face', asset: 'exp.eye-roll@1', at: { line: 'start', offset: -0.4 }, dur: 1.1, blendOut: 0.2 },
      { role: 'speaker', track: 'face', asset: 'exp.deadpan@1', at: { line: 'start', offset: 0.6 }, end: { word: 'last' }, blendIn: 0.2, blendOut: 0.2 },
      { role: 'speaker', track: 'face', asset: 'exp.raised-eyebrow@1', at: { word: 'last' }, end: { line: 'end', offset: 1.2 }, blendIn: 0.2 },
    ],
  },
  'nervous-answer': {
    roles: [C('speaker', 'Speaker'), C('listener', 'Listener', )], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'speaker', track: 'face', asset: 'exp.nervous@1', at: { line: 'start' }, end: { word: 'last' }, blendIn: 0.3, blendOut: 0.2 },
      { role: 'speaker', track: 'gaze', at: { frac: 0.2 }, dur: 0.8, params: { target: 'camera' } },
      { role: 'speaker', track: 'acting', asset: 'act.shift-weight@1', at: { line: 'start' }, end: { line: 'end' } },
      { role: 'speaker', track: 'face', asset: 'exp.half-smile@1', at: { word: 'last' }, end: { line: 'end', offset: 1 }, blendIn: 0.2 },
      { role: 'speaker', track: 'gaze', at: { word: 'last' }, end: { line: 'end', offset: 1 }, params: { target: '$listener' } },
    ],
  },
  'thinking-out-loud': {
    roles: [C('thinker', 'Thinker')], duration: 4.2,
    steps: [
      { role: 'thinker', track: 'face', asset: 'exp.thinking@1', at: 0, dur: 2.6, blendIn: 0.3, blendOut: 0.2 },
      { role: 'thinker', track: 'acting', asset: 'act.point-at@1', at: 2.6, dur: 1.6 },
      { role: 'thinker', track: 'face', asset: 'exp.eureka@1', at: 2.6, dur: 1.6, blendIn: 0.1, blendOut: 0.3 },
      { track: 'sfx', asset: 'sfx.pop@1', at: 2.6, dur: 0.25 },
    ],
  },
  'sad-realisation': {
    roles: [C('character', 'Character')], duration: 4,
    steps: [
      { role: 'character', track: 'face', asset: 'exp.smile@1', at: 0, dur: 1.4, blendOut: 0.6 },
      { role: 'character', track: 'face', asset: 'exp.sad@1', at: 0.8, dur: 3.2, blendIn: 0.6 },
      { track: 'camera-move', asset: 'cam.slow-creep@1', at: 0.8, dur: 3.2 },
    ],
  },
  'dramatic-reveal': {
    roles: [C('reactor', 'Reactor')], duration: 5,
    steps: [
      { track: 'camera-move', asset: 'cam.push-in@1', at: 0, dur: 3 },
      { track: 'shot', at: 3, dur: 2, shot: { framing: 'cam.close-up@1', subjects: ['reactor'] } },
      { role: 'reactor', track: 'face', asset: 'exp.shocked@1', at: 3, dur: 2, blendIn: 0.08, blendOut: 0.4 },
    ],
  },
  'comedic-beat': {
    roles: [C('subject', 'Subject')], duration: 1.6,
    steps: [
      { track: 'shot', at: 0, dur: 1.6, shot: { framing: 'cam.close-up@1', subjects: ['subject'] } },
      { track: 'camera-move', asset: 'cam.snap-zoom@1', at: 0, dur: 0.3 },
      { role: 'subject', track: 'face', asset: 'exp.deadpan@1', at: 0, dur: 1.6 },
    ],
  },
  'explain-a-point': {
    roles: [C('speaker', 'Speaker')], duration: 4.6,
    steps: [
      { role: 'speaker', track: 'acting', asset: 'act.explain-with-hands@1', at: 0, dur: 3, blendIn: 0.3, blendOut: 0.3 },
      { role: 'speaker', track: 'acting', asset: 'act.point-at@1', at: 3, dur: 1.6 },
      { role: 'speaker', track: 'face', asset: 'exp.focused@1', at: 0, dur: 4.6, blendIn: 0.3, blendOut: 0.3, params: { intensity: 50 } },
    ],
  },
  'reveal-an-object': {
    roles: [C('presenter', 'Presenter'), P('object', 'Object'), C('listener', 'Listener')], duration: 4,
    steps: [
      { role: 'presenter', track: 'acting', asset: 'act.pick-up@1', at: 0, dur: 1.2, params: { prop: '$object' } },
      { role: 'presenter', track: 'gaze', at: 1.2, dur: 2.8, params: { target: '$listener' } },
      { role: 'presenter', track: 'face', asset: 'exp.proud@1', at: 1.2, dur: 2.8, blendIn: 0.3, blendOut: 0.3 },
    ],
  },
  'awkward-silence': {
    roles: [C('a', 'First'), C('b', 'Second')], duration: 3.5,
    steps: [
      { role: 'a', track: 'face', asset: 'exp.awkward@1', at: 0, dur: 3.5, blendIn: 0.3, blendOut: 0.3 },
      { role: 'b', track: 'face', asset: 'exp.side-eye@1', at: 0.4, dur: 3.1, blendIn: 0.3, blendOut: 0.3 },
      { role: 'b', track: 'gaze', at: 0.4, dur: 1.2, params: { target: '$a' } },
      { track: 'shot', at: 0, dur: 3.5, shot: { framing: 'cam.two-shot@1', subjects: ['a', 'b'] } },
    ],
  },
};

/** Shot recipes (Catalog M1): coordinated shots and moves for subjects (FR-CAM-04). */
export const SHOT_RECIPES: Record<string, RecipeData> = {
  'interview-two-shot': {
    roles: [C('a', 'Host'), C('b', 'Guest')], duration: 6,
    steps: [{ track: 'shot', at: 0, dur: 6, shot: { framing: 'cam.two-shot@1', subjects: ['a', 'b'] } }, { track: 'camera-move', asset: 'cam.slow-creep@1', at: 0, dur: 6 }],
  },
  'reaction-ping-pong': {
    roles: [C('a', 'First'), C('b', 'Second')], duration: 6,
    steps: [0, 1.5, 3, 4.5].map((at, i) => ({ track: 'shot' as const, at, dur: 1.5, shot: { framing: 'cam.close-up@1', subjects: [i % 2 ? 'b' : 'a'] } })),
  },
  'comedic-beat-shot': {
    roles: [C('subject', 'Subject')], duration: 1.5,
    steps: [{ track: 'shot', at: 0, dur: 1.5, shot: { framing: 'cam.close-up@1', subjects: ['subject'] } }, { track: 'camera-move', asset: 'cam.snap-zoom@1', at: 0, dur: 0.3 }],
  },
  'dramatic-reveal-shot': {
    roles: [C('subject', 'Subject')], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 4, shot: { framing: 'cam.medium@1', subjects: ['subject'] } }, { track: 'camera-move', asset: 'cam.push-in@1', at: 0, dur: 4 }],
  },
  'establishing-pan': {
    roles: [], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 4, shot: { framing: 'cam.extreme-wide@1', subjects: [] } }, { track: 'camera-move', asset: 'cam.pan@1', at: 0, dur: 4 }],
  },
  // Edits (Catalog M1): cut patterns as editable shots.
  'hard-cut': {
    roles: [C('subject', 'Subject')], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 2, shot: { framing: 'cam.wide@1', subjects: ['subject'] } }, { track: 'shot', at: 2, dur: 2, shot: { framing: 'cam.close-up@1', subjects: ['subject'] } }],
  },
  'match-cut': {
    roles: [C('a', 'First'), C('b', 'Second')], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 2, shot: { framing: 'cam.close-up@1', subjects: ['a'] } }, { track: 'shot', at: 2, dur: 2, shot: { framing: 'cam.close-up@1', subjects: ['b'] } }],
  },
  'jump-cut': {
    roles: [C('subject', 'Subject')], duration: 3.6,
    steps: [['cam.medium@1', 0], ['cam.medium-close-up@1', 1.2], ['cam.close-up@1', 2.4]].map(([framing, at]) => ({ track: 'shot' as const, at: at as number, dur: 1.2, shot: { framing: framing as string, subjects: ['subject'] } })),
  },
  'reaction-cut': {
    roles: [C('speaker', 'Speaker'), C('listener', 'Listener')], anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { track: 'shot', at: { line: 'start' }, end: { frac: 0.7 }, shot: { framing: 'cam.medium@1', subjects: ['speaker'] } },
      { track: 'shot', at: { frac: 0.7 }, end: { line: 'end', offset: 1.2 }, shot: { framing: 'cam.close-up@1', subjects: ['listener'] } },
    ],
  },
  cutaway: {
    roles: [C('subject', 'Subject'), { key: 'detail', label: 'Detail', kind: 'prop' }], duration: 5.2,
    steps: [
      { track: 'shot', at: 0, dur: 2, shot: { framing: 'cam.medium@1', subjects: ['subject'] } },
      { track: 'shot', at: 2, dur: 1.2, shot: { framing: 'cam.insert-detail@1', subjects: ['detail'] } },
      { track: 'shot', at: 3.2, dur: 2, shot: { framing: 'cam.medium@1', subjects: ['subject'] } },
    ],
  },
  'split-screen': {
    roles: [C('a', 'Left'), C('b', 'Right')], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 4, shot: { framing: 'cam.medium@1', subjects: ['a'], second: { framing: 'cam.medium@1', subjects: ['b'] }, layout: 'split' } }],
  },
  'picture-in-picture': {
    roles: [C('main', 'Main'), C('inset', 'Inset')], duration: 4,
    steps: [{ track: 'shot', at: 0, dur: 4, shot: { framing: 'cam.medium@1', subjects: ['main'], second: { framing: 'cam.close-up@1', subjects: ['inset'] }, layout: 'pip' } }],
  },
  'freeze-with-title': {
    roles: [C('subject', 'Subject')], duration: 3,
    steps: [
      { track: 'shot', at: 0, dur: 3, shot: { framing: 'cam.medium-close-up@1', subjects: ['subject'] } },
      { track: 'effect', asset: 'fx.freeze-frame@1', at: 1, dur: 2 },
      { track: 'text', asset: 'txt.chapter-title@1', at: 1, dur: 2, params: { text: 'Title' } },
    ],
  },
  'walk-and-talk-follow': {
    roles: [C('subject', 'Walker')], duration: 6,
    steps: [{ track: 'shot', at: 0, dur: 6, shot: { framing: 'cam.full@1', subjects: ['subject'] } }, { track: 'camera-move', asset: 'cam.follow-subject@1', at: 0, dur: 6, params: { target: '$subject' } }],
  },
};
