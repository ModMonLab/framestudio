import { Type, type Static } from '@sinclair/typebox';
import { AssetRef, FrameRate, LocalId, SchemaVersion, StyleFamily, Ticks, Vec2, View } from './common.js';

/* ------------------------------------------------------------------ project.json */

export const AgentPermissions = Type.Object(
  {
    deleteProjects: Type.Boolean({ default: false }),
    deleteVoices: Type.Boolean({ default: false }),
    cloneVoices: Type.Boolean({ default: false }),
    exposeWorker: Type.Boolean({ default: false }),
  },
  { additionalProperties: false, description: 'Human-granted agent permissions (FR-AGT-04).' },
);
export type AgentPermissions = Static<typeof AgentPermissions>;

export const OutputSettings = Type.Object(
  {
    preset: AssetRef,
    width: Type.Integer({ minimum: 16, maximum: 8192 }),
    height: Type.Integer({ minimum: 16, maximum: 8192 }),
    aspectRatios: Type.Array(Type.String({ pattern: '^\\d+:\\d+$' }), { minItems: 1, description: 'Aspect ratios previewed per camera (FR-CAM-06).' }),
  },
  { additionalProperties: false },
);
export type OutputSettings = Static<typeof OutputSettings>;

export const CaptionSettings = Type.Object(
  {
    enabled: Type.Boolean(),
    style: Type.Optional(AssetRef),
    speakerLabels: Type.Boolean(),
    burnIn: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const CastMember = Type.Object(
  {
    id: LocalId('cst'),
    character: AssetRef,
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, description: 'A character version used by this project (identity is the asset; FR-CHR-09).' },
);
export type CastMember = Static<typeof CastMember>;

export const Project = Type.Object(
  {
    schemaVersion: SchemaVersion,
    id: LocalId('prj'),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ description: 'Rich text (Markdown subset: headings, lists, bold, italic).' }),
    styleFamily: StyleFamily,
    frameRate: FrameRate,
    output: OutputSettings,
    captions: CaptionSettings,
    voiceWorkerUrl: Type.Optional(Type.String({ description: 'Endpoint override; tokens are never stored in projects (NFR-09).' })),
    renderDir: Type.Optional(Type.String()),
    episodes: Type.Array(LocalId('ep')),
    cast: Type.Array(CastMember),
    permissions: Type.Object({ agent: AgentPermissions }, { additionalProperties: false }),
    seed: Type.Integer({ minimum: 0 }),
    createdAt: Type.String(),
    appVersion: Type.String(),
    template: Type.Optional(AssetRef),
  },
  { additionalProperties: false },
);
export type Project = Static<typeof Project>;

/* ------------------------------------------------------------------ episode.json */

export const Episode = Type.Object(
  {
    schemaVersion: SchemaVersion,
    id: LocalId('ep'),
    name: Type.String({ minLength: 1 }),
    notes: Type.String(),
    scenes: Type.Array(LocalId('scn')),
    sceneTransitions: Type.Record(Type.String(), Type.Object({ transition: AssetRef, duration: Ticks }, { additionalProperties: false }), {
      description: 'Transition into the keyed scene from the previous one (FR-FX-03, FR-TML-09).',
    }),
  },
  { additionalProperties: false },
);
export type Episode = Static<typeof Episode>;

/* ------------------------------------------------------------------ scene */

export const DepthPlane = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String(),
    order: Type.Integer({ description: 'Back to front: lower draws first.' }),
    parallax: Type.Number({ description: 'Default parallax factor for this plane (1 = moves with the main stage).' }),
  },
  { additionalProperties: false },
);
export type DepthPlane = Static<typeof DepthPlane>;

export const GroundLine = Type.Object(
  { id: LocalId('gl'), name: Type.String(), y: Type.Number(), depthPlane: Type.String(), scale: Type.Number({ exclusiveMinimum: 0 }) },
  { additionalProperties: false, description: 'Where feet stand; scale is the character scale on that line.' },
);
export type GroundLine = Static<typeof GroundLine>;

export const Mark = Type.Object(
  {
    id: LocalId('mk'),
    name: Type.String(),
    x: Type.Number(),
    y: Type.Number(),
    depthPlane: Type.String(),
    facing: Type.Union([Type.Literal('left'), Type.Literal('right'), Type.Literal('front')]),
    seat: Type.Optional(Type.Object({ instance: LocalId('ins'), anchor: Type.String() }, { additionalProperties: false })),
  },
  { additionalProperties: false },
);
export type Mark = Static<typeof Mark>;

export const Stage = Type.Object(
  {
    width: Type.Number({ exclusiveMinimum: 0, description: 'Stage width in stage units (1 unit = 1 px at 1920-wide reference).' }),
    height: Type.Number({ exclusiveMinimum: 0 }),
    groundLines: Type.Array(GroundLine),
    marks: Type.Array(Mark),
    depthPlanes: Type.Array(DepthPlane, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type Stage = Static<typeof Stage>;

export const InstanceKind = Type.Union([
  Type.Literal('character'),
  Type.Literal('prop'),
  Type.Literal('set-piece'),
  Type.Literal('effect'),
  Type.Literal('text'),
  Type.Literal('image'),
  Type.Literal('group'),
]);
export type InstanceKind = Static<typeof InstanceKind>;

export const Transform = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    scale: Type.Number({ exclusiveMinimum: 0 }),
    rotation: Type.Number({ description: 'Degrees, clockwise.' }),
    flipX: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type Transform = Static<typeof Transform>;

export const Posture = Type.Union([
  Type.Literal('standing'),
  Type.Literal('seated'),
  Type.Literal('crouched'),
  Type.Literal('kneeling'),
  Type.Literal('lying'),
]);
export type Posture = Static<typeof Posture>;

export const CharacterState = Type.Object(
  {
    look: Type.String({ description: 'Look id within the character asset.' }),
    view: View,
    posture: Posture,
    baseExpression: Type.Optional(AssetRef),
    voice: Type.Optional(AssetRef),
    auto: Type.Object(
      {
        idle: Type.Boolean(),
        listening: Type.Boolean(),
        blinks: Type.Boolean(),
        talkingGestures: Type.Boolean(),
      },
      { additionalProperties: false, description: 'Automatic behaviour generators (FR-ACT-07, FR-ACT-08, FR-EXP-03).' },
    ),
  },
  { additionalProperties: false },
);
export type CharacterState = Static<typeof CharacterState>;

export const Instance = Type.Object(
  {
    id: LocalId('ins'),
    kind: InstanceKind,
    asset: Type.Optional(AssetRef),
    media: Type.Optional(Type.String({ description: 'Media hash for image instances.' })),
    name: Type.String({ minLength: 1 }),
    transform: Transform,
    depthPlane: Type.String(),
    order: Type.Number({ description: 'Layer order within the depth plane.' }),
    parallax: Type.Number({ description: 'Parallax factor (independent of draw order; FR-STG-02).' }),
    opacity: Type.Number({ minimum: 0, maximum: 1 }),
    parent: Type.Optional(LocalId('ins')),
    visible: Type.Boolean(),
    locked: Type.Boolean(),
    character: Type.Optional(CharacterState),
    propState: Type.Optional(Type.String({ description: 'Initial prop state.' })),
    params: Type.Record(Type.String(), Type.Unknown(), { description: 'Kind-specific parameters (text content, palette, colours...).' }),
  },
  { additionalProperties: false },
);
export type Instance = Static<typeof Instance>;

export const Camera = Type.Object(
  {
    id: LocalId('cam'),
    name: Type.String({ minLength: 1 }),
    center: Vec2,
    width: Type.Number({ exclusiveMinimum: 0, description: 'Framing width in stage units at stage scale.' }),
    rotation: Type.Number(),
    lens: Type.Union([Type.Literal('24mm'), Type.Literal('35mm'), Type.Literal('50mm'), Type.Literal('85mm')]),
    preset: Type.Optional(AssetRef),
    subjects: Type.Array(LocalId('ins')),
    ratioRule: Type.Union([Type.Literal('center'), Type.Literal('headroom')]),
    ratioOverrides: Type.Record(Type.String(), Type.Object({ center: Vec2, width: Type.Number({ exclusiveMinimum: 0 }) }, { additionalProperties: false })),
  },
  { additionalProperties: false },
);
export type Camera = Static<typeof Camera>;

export const TrackKind = Type.Union([
  Type.Literal('shot'),
  Type.Literal('camera-move'),
  Type.Literal('dialogue'),
  Type.Literal('lipsync'),
  Type.Literal('acting'),
  Type.Literal('face'),
  Type.Literal('gaze'),
  Type.Literal('effect'),
  Type.Literal('music'),
  Type.Literal('ambience'),
  Type.Literal('sfx'),
  Type.Literal('text'),
]);
export type TrackKind = Static<typeof TrackKind>;

export const Track = Type.Object(
  {
    id: LocalId('trk'),
    kind: TrackKind,
    owner: Type.Union([Type.Literal('scene'), LocalId('ins')]),
    name: Type.String(),
    mute: Type.Boolean(),
    solo: Type.Boolean(),
    lock: Type.Boolean(),
    hidden: Type.Boolean(),
    gainDb: Type.Number({ minimum: -60, maximum: 12 }),
  },
  { additionalProperties: false },
);
export type Track = Static<typeof Track>;

export const Delivery = Type.Object(
  {
    preset: Type.Optional(AssetRef),
    emotion: Type.Optional(Type.String()),
    pace: Type.Optional(Type.Number({ minimum: 0.5, maximum: 2 })),
    instruction: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);
export type Delivery = Static<typeof Delivery>;

export const MouthShape = Type.Union(
  ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((s) => Type.Literal(s)),
  { description: 'Mouth shape letter (Catalog A17).' },
);
export type MouthShape = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const MouthBlock = Type.Object(
  { shape: MouthShape, start: Type.Number({ minimum: 0 }), end: Type.Number({ minimum: 0 }) },
  { additionalProperties: false, description: 'Times in seconds relative to the take start.' },
);
export type MouthBlock = { shape: MouthShape; start: number; end: number };

export const Line = Type.Object(
  {
    speaker: LocalId('ins'),
    text: Type.String({ maxLength: 4000 }),
    revision: Type.Integer({ minimum: 1 }),
    delivery: Delivery,
    take: Type.Optional(LocalId('tak')),
    muted: Type.Boolean({ description: 'Intentionally silent line (take state "Muted").' }),
    caption: Type.Optional(Type.Object({ text: Type.Optional(Type.String()), hidden: Type.Optional(Type.Boolean()) }, { additionalProperties: false })),
    mouthOverrides: Type.Optional(Type.Array(MouthBlock)),
  },
  { additionalProperties: false },
);
export type Line = Static<typeof Line>;

export const ClipSource = Type.String({ pattern: '^(manual|auto|import|template|recipe:[a-z0-9.@-]+|agent:[A-Za-z0-9_-]+)$' });

export const Clip = Type.Object(
  {
    id: LocalId('clp'),
    track: LocalId('trk'),
    start: Ticks,
    end: Ticks,
    asset: Type.Optional(AssetRef),
    params: Type.Record(Type.String(), Type.Unknown()),
    blendIn: Ticks,
    blendOut: Ticks,
    enabled: Type.Boolean(),
    source: ClipSource,
    group: Type.Optional(LocalId('grp')),
    line: Type.Optional(Line),
    media: Type.Optional(Type.String({ description: 'Media hash for imported audio or images.' })),
    sourceIn: Type.Optional(Ticks),
    name: Type.Optional(Type.String()),
  },
  { additionalProperties: false, description: 'Half-open interval [start, end) in ticks (FR-DAT-03).' },
);
export type Clip = Static<typeof Clip>;

export const Marker = Type.Object({ id: LocalId('mkr'), name: Type.String(), at: Ticks }, { additionalProperties: false });
export type Marker = Static<typeof Marker>;

export const SceneAudio = Type.Object(
  {
    duckingDb: Type.Number({ maximum: 0, minimum: -40 }),
    duckAttack: Type.Number({ minimum: 0 }),
    duckRelease: Type.Number({ minimum: 0 }),
    roomTone: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const Scene = Type.Object(
  {
    schemaVersion: SchemaVersion,
    id: LocalId('scn'),
    name: Type.String({ minLength: 1 }),
    notes: Type.String(),
    duration: Ticks,
    kit: Type.Optional(AssetRef),
    seed: Type.Integer({ minimum: 0 }),
    stage: Stage,
    instances: Type.Array(Instance),
    cameras: Type.Array(Camera, { minItems: 1 }),
    defaultCamera: LocalId('cam'),
    tracks: Type.Array(Track),
    clips: Type.Array(Clip),
    markers: Type.Array(Marker),
    loop: Type.Optional(Type.Object({ start: Ticks, end: Ticks }, { additionalProperties: false })),
    audio: SceneAudio,
  },
  { additionalProperties: false },
);
export type Scene = Static<typeof Scene>;
