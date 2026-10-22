import { Type, type Static } from '@sinclair/typebox';

/** Project time is stored as integer ticks at 48 000 per second (FR-DAT-03). */
export const TICKS_PER_SECOND = 48_000;

export const CURRENT_SCHEMA_VERSION = 1;

export const SchemaVersion = Type.Integer({ minimum: 1, description: 'File schema version (FR-DAT-05).' });

export const Ticks = Type.Integer({ minimum: 0, description: 'Time in ticks (48 000 per second).' });
export type Ticks = Static<typeof Ticks>;

export const SignedTicks = Type.Integer({ description: 'Signed time offset in ticks.' });

/** Catalog-style dotted IDs (`kind.slug`) or user assets (`user.<uuid>`) (FR-DAT-01). */
export const AssetIdPattern = '^(?:[a-z0-9-]+\\.[a-z0-9-]+|user\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$';
export const AssetId = Type.String({ pattern: AssetIdPattern, description: 'Asset ID.' });

/** `id@version` reference to an immutable asset version (FR-DAT-02). */
export const AssetRefPattern = '^(?:[a-z0-9-]+\\.[a-z0-9-]+|user\\.[0-9a-f-]{36})@[1-9][0-9]*$';
export const AssetRef = Type.String({ pattern: AssetRefPattern, description: 'Asset reference id@version.' });
export type AssetRef = Static<typeof AssetRef>;

export const localIdPrefixes = ['prj', 'ep', 'scn', 'ins', 'clp', 'tak', 'trk', 'cam', 'mkr', 'grp', 'cst', 'lk', 'snap', 'job', 'gl', 'mk'] as const;
export type LocalIdPrefix = (typeof localIdPrefixes)[number];

export function LocalId(prefix: LocalIdPrefix) {
  return Type.String({ pattern: `^${prefix}_[A-Za-z0-9]{6,32}$`, description: `Project-local ID with prefix ${prefix}_.` });
}

export const StyleFamily = Type.Union([Type.Literal('flat'), Type.Literal('illustrated')]);
export type StyleFamily = Static<typeof StyleFamily>;
export const styleFamilies: StyleFamily[] = ['flat', 'illustrated'];

export const View = Type.Union([Type.Literal('front'), Type.Literal('three'), Type.Literal('side'), Type.Literal('back')]);
export type View = Static<typeof View>;
export const views: View[] = ['front', 'three', 'side', 'back'];

export const FrameRate = Type.Union([Type.Literal(24), Type.Literal(25), Type.Literal(30)]);
export type FrameRate = Static<typeof FrameRate>;

export const Vec2 = Type.Object({ x: Type.Number(), y: Type.Number() }, { additionalProperties: false });
export type Vec2 = Static<typeof Vec2>;

export const Sha256 = Type.String({ pattern: '^sha256-[0-9a-f]{64}$' });

/** Content-addressed media reference (FR-DAT-07). */
export const MediaRef = Type.Object(
  {
    hash: Sha256,
    mime: Type.String(),
    ext: Type.String({ pattern: '^[a-z0-9]{1,8}$' }),
    bytes: Type.Integer({ minimum: 0 }),
    durationS: Type.Optional(Type.Number({ minimum: 0 })),
    sampleRate: Type.Optional(Type.Integer({ minimum: 1 })),
    channels: Type.Optional(Type.Integer({ minimum: 1 })),
    width: Type.Optional(Type.Integer({ minimum: 1 })),
    height: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
export type MediaRef = Static<typeof MediaRef>;

export const Provenance = Type.Object(
  {
    method: Type.Union([
      Type.Literal('authored'),
      Type.Literal('ai-assisted-human-reviewed'),
      Type.Literal('imported'),
      Type.Literal('generated'),
      Type.Literal('recorded'),
    ]),
    author: Type.String(),
    date: Type.String(),
    sourceFile: Type.Optional(Type.String()),
    rightsStatement: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type Provenance = Static<typeof Provenance>;

export const License = Type.Object(
  {
    id: Type.String({ description: 'SPDX identifier or "proprietary-owner".' }),
    redistributable: Type.Boolean(),
    commercialUse: Type.Boolean(),
    attribution: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type License = Static<typeof License>;

export const Json = Type.Unknown();
