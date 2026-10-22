import { Type, type Static } from '@sinclair/typebox';
import {
  AssetId, AssetRef, License, LocalId, MediaRef, Provenance, SchemaVersion, Sha256, StyleFamily, View,
} from './common.js';
import { Delivery } from './project.js';

/* ------------------------------------------------------------------ takes and alignment */

export const WordTiming = Type.Object(
  { text: Type.String(), start: Type.Number({ minimum: 0 }), end: Type.Number({ minimum: 0 }) },
  { additionalProperties: false },
);
export const PhonemeTiming = Type.Object(
  { p: Type.String(), start: Type.Number({ minimum: 0 }), end: Type.Number({ minimum: 0 }) },
  { additionalProperties: false },
);
export type WordTiming = Static<typeof WordTiming>;
export type PhonemeTiming = Static<typeof PhonemeTiming>;

export const Alignment = Type.Object(
  {
    words: Type.Array(WordTiming),
    phonemes: Type.Array(PhonemeTiming),
    method: Type.Union([Type.Literal('forced'), Type.Literal('transcribed+forced'), Type.Literal('amplitude'), Type.Literal('fixture')]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    aligner: Type.Optional(Type.String()),
    envelope: Type.Optional(Type.Object(
      { windowS: Type.Number({ exclusiveMinimum: 0 }), values: Type.Array(Type.Number({ minimum: 0 })) },
      { additionalProperties: false, description: 'RMS envelope for the amplitude lip-sync fallback (FR-LIP-02, method "amplitude").' },
    )),
  },
  { additionalProperties: false, description: 'Times in seconds relative to the take start (SRS §3.5).' },
);
export type Alignment = Static<typeof Alignment>;

export const TakeStatus = Type.Union([
  Type.Literal('queued'),
  Type.Literal('generating'),
  Type.Literal('ready'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
]);
export type TakeStatus = Static<typeof TakeStatus>;

export const Take = Type.Object(
  {
    schemaVersion: SchemaVersion,
    id: LocalId('tak'),
    line: LocalId('clp'),
    lineRevision: Type.Integer({ minimum: 1 }),
    confirmedRevision: Type.Optional(Type.Integer({ minimum: 1, description: 'Recorded/uploaded take explicitly confirmed for a newer revision (FR-DLG-03).' })),
    number: Type.Integer({ minimum: 1 }),
    source: Type.Union([Type.Literal('generated'), Type.Literal('recorded'), Type.Literal('uploaded')]),
    voice: Type.Optional(AssetRef),
    engine: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    fixture: Type.Boolean({ description: 'Produced by the fixture worker; never real speech (API-04).' }),
    seed: Type.Optional(Type.Integer()),
    settings: Type.Optional(Delivery),
    media: Type.Optional(MediaRef),
    durationS: Type.Optional(Type.Number({ minimum: 0 })),
    alignment: Type.Optional(Alignment),
    status: TakeStatus,
    error: Type.Optional(Type.Object({ code: Type.String(), message: Type.String() }, { additionalProperties: false })),
    job: Type.Optional(Type.String()),
    createdAt: Type.String(),
  },
  { additionalProperties: false },
);
export type Take = Static<typeof Take>;

/* ------------------------------------------------------------------ voices */

export const ConsentRecord = Type.Object(
  {
    statement: Type.Union([Type.Literal('own-voice'), Type.Literal('documented-consent')]),
    speakerName: Type.String({ minLength: 1 }),
    confirmedBy: Type.String({ minLength: 1 }),
    date: Type.String({ minLength: 1 }),
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false, description: 'Mandatory for cloned voices (FR-VOI-04).' },
);
export type ConsentRecord = Static<typeof ConsentRecord>;

export const VoiceReference = Type.Object(
  {
    emotion: Type.String({ description: 'neutral, happy, sad, angry, nervous, whisper, excited, deadpan, ...' }),
    media: MediaRef,
    transcript: Type.String(),
    seed: Type.Optional(Type.Integer()),
    accepted: Type.Boolean(),
    fixture: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type VoiceReference = Static<typeof VoiceReference>;

export const VoiceData = Type.Object(
  {
    description: Type.String(),
    method: Type.Union([Type.Literal('design'), Type.Literal('clone'), Type.Literal('preset'), Type.Literal('recorded')]),
    language: Type.String(),
    consent: Type.Optional(ConsentRecord),
    references: Type.Array(VoiceReference),
    auditions: Type.Array(Type.Object({ text: Type.String(), media: MediaRef, emotion: Type.String() }, { additionalProperties: false })),
    engineData: Type.Record(Type.String(), Type.Object({ conditioningHash: Type.String(), model: Type.String() }, { additionalProperties: false })),
  },
  { additionalProperties: false },
);
export type VoiceData = Static<typeof VoiceData>;

/* ------------------------------------------------------------------ asset manifests */

export const ParameterDef = Type.Object(
  {
    key: Type.String(),
    type: Type.Union([Type.Literal('number'), Type.Literal('enum'), Type.Literal('color'), Type.Literal('boolean'), Type.Literal('string'), Type.Literal('ref')]),
    range: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    options: Type.Optional(Type.Array(Type.String())),
    default: Type.Unknown(),
    label: Type.Optional(Type.String()),
    endLabels: Type.Optional(Type.Tuple([Type.String(), Type.String()])),
  },
  { additionalProperties: false },
);
export type ParameterDef = Static<typeof ParameterDef>;

export const AssetManifest = Type.Object(
  {
    schemaVersion: SchemaVersion,
    id: AssetId,
    version: Type.Integer({ minimum: 1 }),
    kind: Type.String({ pattern: '^[a-z-]+$', description: 'Catalog prefix of the asset category (e.g. hair, act, prop).' }),
    name: Type.String({ minLength: 1 }),
    category: Type.String(),
    group: Type.Optional(Type.String()),
    tags: Type.Array(Type.String()),
    synonyms: Type.Array(Type.String()),
    families: Type.Array(StyleFamily),
    views: Type.Array(View),
    viewExemptions: Type.Record(Type.String(), Type.String({ minLength: 1 }), { description: 'view → documented reason.' }),
    anchors: Type.Record(Type.String(), Type.Unknown()),
    capabilities: Type.Array(Type.String()),
    parameters: Type.Array(ParameterDef),
    dependencies: Type.Array(AssetRef),
    layering: Type.Record(Type.String(), Type.Unknown()),
    previews: Type.Object({ flat: Type.Optional(Type.String()), illustrated: Type.Optional(Type.String()) }, { additionalProperties: false }),
    license: License,
    provenance: Provenance,
    review: Type.Optional(Type.Object({ status: Type.Union([Type.Literal('pending'), Type.Literal('approved'), Type.Literal('changes-requested')]), by: Type.Optional(Type.String()), date: Type.Optional(Type.String()), sheet: Type.Optional(Type.String()) }, { additionalProperties: false })),
    deprecated: Type.Optional(Type.Object({ replacement: AssetId }, { additionalProperties: false })),
    changes: Type.Optional(Type.String({ description: 'What changed in this version (FR-AST-05).' })),
    data: Type.Unknown({ description: 'Kind-specific definition, validated by the kind schema in @frame/assets.' }),
  },
  { additionalProperties: false },
);
export type AssetManifest = Static<typeof AssetManifest>;

/* ------------------------------------------------------------------ locks */

export const Locks = Type.Object(
  {
    schemaVersion: SchemaVersion,
    assets: Type.Record(Type.String(), Type.Object({ hash: Sha256, source: Type.Union([Type.Literal('bundled'), Type.Literal('user'), Type.Literal('project'), Type.Literal('imported')]) }, { additionalProperties: false })),
  },
  { additionalProperties: false, description: 'Pinned versions of every referenced library asset (FR-DAT-06).' },
);
export type Locks = Static<typeof Locks>;

/* ------------------------------------------------------------------ packages */

export const PackageFormat = Type.Union([
  Type.Literal('frameproj'),
  Type.Literal('framechar'),
  Type.Literal('frameasset'),
  Type.Literal('framevoice'),
]);
export type PackageFormat = Static<typeof PackageFormat>;

export const PackageManifest = Type.Object(
  {
    format: PackageFormat,
    formatVersion: Type.Integer({ minimum: 1 }),
    appVersion: Type.String(),
    createdAt: Type.String(),
    contents: Type.Array(
      Type.Object(
        {
          path: Type.String({ pattern: '^(?!/)(?!.*(^|/)\\.\\.(/|$))[A-Za-z0-9._/@-]+$' }),
          hash: Sha256,
          bytes: Type.Integer({ minimum: 0 }),
          role: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    assets: Type.Array(AssetRef),
  },
  { additionalProperties: false, description: 'Package manifest.json (FR-DAT-10).' },
);
export type PackageManifest = Static<typeof PackageManifest>;
