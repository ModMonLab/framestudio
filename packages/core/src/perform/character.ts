/** Resolves a character asset + look + family into a composer spec (FR-CHR-01, FR-CHR-09, FR-WRD-01). */
import type { AssetManifest, StyleFamily } from '@frame/schema';
import { DEFAULT_BODY, type BodyParams, type CharacterSpec, type FamilyStyle, type ResolvedPart, type PartData, type RigVariant } from '@frame/rig';

export interface AssetResolver {
  manifest(ref: string): AssetManifest | undefined;
}

export interface LookData {
  id: string;
  name: string;
  /** Garment and accessory refs. */
  garments: string[];
  accessories: string[];
  /** Colour overrides for garment slots (top, bottom, outer, dress, shoe, acc…). */
  colors: Record<string, string>;
  /** Per-garment option states, keyed by garment ref. */
  options?: Record<string, Record<string, string>>;
  /** Pattern per slot (Catalog B6). */
  patterns?: Record<string, { pattern: string; scale?: number; colors?: string[] }>;
}

export interface CharacterData {
  role?: string;
  notes?: string;
  lifeStage: string;
  bodyBase: string;
  /** Body slider values 0–100 overriding the base. */
  body: Partial<Record<keyof BodyParams, number>>;
  /** Face/body parts by slot: head, eyes, brows, nose, mouth, ears, hair, fringe, facialHair, feet, hands, base. */
  parts: Record<string, string>;
  /** Extra overlays: skin details, makeup, identity overlays. */
  details?: string[];
  /** Control values keyed by control asset ref (0–100 or option/colour values). */
  controls: Record<string, number | string>;
  colors: Record<string, string>;
  looks: LookData[];
  defaultLook: string;
  voice?: string;
  performance: { idleEnergy: number; gestureSize: number; expressionStrength: number; signatureActions: string[] };
  /** Rig variant (wheelchair seated rig etc., FR-CHR-11). */
  rigVariant?: string;
}

export interface ResolveResult {
  spec: CharacterSpec;
  look: LookData | undefined;
  missing: string[];
  /** Merged rig variant of the character's identity options (FR-CHR-11). */
  variant: RigVariant;
}

/** Assembles the composer spec. Missing parts are reported, never invented. */
export function resolveCharacter(m: AssetManifest, lookId: string | undefined, family: StyleFamily, style: FamilyStyle, assets: AssetResolver, extraParts: string[] = []): ResolveResult {
  const c = m.data as CharacterData;
  const missing: string[] = [];
  const get = (ref: string) => {
    const a = assets.manifest(ref);
    if (!a) missing.push(ref);
    return a;
  };
  const body: BodyParams = { ...DEFAULT_BODY, headRatio: style.headRatio, height: style.height };
  const base = c.bodyBase ? get(c.bodyBase) : undefined;
  Object.assign(body, (base?.data as { bodyParams?: Partial<BodyParams> } | undefined)?.bodyParams ?? {});
  const stage = c.lifeStage ? get(c.lifeStage) : undefined;
  const ls = (stage?.data as { lifeStage?: { headRatio: Record<StyleFamily, number>; heightScale: number } } | undefined)?.lifeStage;
  if (ls) {
    body.headRatio = ls.headRatio[family];
    body.height = style.height * ls.heightScale;
  }
  const heightScale = (body as BodyParams & { heightScale?: number }).heightScale;
  if (heightScale) body.height *= heightScale / 100;
  Object.assign(body, c.body);

  // Controls: sliders → normalised morph params or body params; enums → options; colours → palette.
  const params: Record<string, number> = {};
  const options: Record<string, string> = {};
  const colors: Record<string, string> = { ...c.colors };
  for (const [ref, value] of Object.entries(c.controls)) {
    const ctl = (get(ref)?.data as { control?: { type: string; param?: string; target?: string; option?: string; color?: string } } | undefined)?.control;
    if (!ctl) continue;
    if (ctl.type === 'slider' && typeof value === 'number') {
      if (ctl.target === 'body') (body as unknown as Record<string, number>)[ctl.param!] = value;
      else params[ctl.param!] = (value - 50) / 50;
    } else if (ctl.type === 'enum' && typeof value === 'string') options[ctl.option!] = value;
    else if (ctl.type === 'color' && typeof value === 'string' && ctl.color) colors[ctl.color] = value;
  }

  const look = c.looks.find((l) => l.id === (lookId ?? c.defaultLook)) ?? c.looks[0];
  const refs = [...Object.values(c.parts), ...(c.rigVariant ? [c.rigVariant] : []), ...(c.details ?? []), ...(look?.garments ?? []), ...(look?.accessories ?? []), ...extraParts];
  const parts: ResolvedPart[] = [];
  for (const ref of refs) {
    const a = get(ref);
    if (!a) continue;
    const data = a.data as PartData | undefined;
    if (!data?.families) continue; // data-only assets (controls, states) are not drawn
    const partOptions = look?.options?.[ref];
    parts.push({ ref, data, ...(partOptions ? { options: partOptions } : {}) });
    // Garment default colours unless the look overrides them.
    if (data.colors) for (const [k, v] of Object.entries(data.colors)) if (!(k in colors)) colors[k] = v;
  }
  Object.assign(colors, look?.colors ?? {});
  const variant = mergeVariants(parts.map((p) => p.data.variant));
  Object.assign(body, variant.body ?? {});
  Object.assign(colors, variant.palette ?? {});
  return { spec: { family, style, body, params, colors, parts, options }, look, missing, variant };
}

export function mergeVariants(vs: (RigVariant | undefined)[]): RigVariant {
  const out: RigVariant = {};
  for (const v of vs) {
    if (!v) continue;
    if (v.posture) out.posture = v.posture;
    if (v.rolling) out.rolling = v.rolling;
    if (v.truncate) out.truncate = { ...out.truncate, ...v.truncate };
    if (v.replace) out.replace = { ...out.replace, ...v.replace };
    if (v.body) out.body = { ...out.body, ...v.body };
    if (v.palette) out.palette = { ...out.palette, ...v.palette };
  }
  return out;
}

/** The rig variant of a character instance without composing it (posture and locomotion need it first). */
export function characterVariant(m: AssetManifest, lookId: string | undefined, assets: AssetResolver): RigVariant {
  const c = m.data as CharacterData;
  const look = c.looks.find((l) => l.id === (lookId ?? c.defaultLook)) ?? c.looks[0];
  const refs = [...(c.rigVariant ? [c.rigVariant] : []), ...(c.details ?? []), ...(look?.accessories ?? [])];
  return mergeVariants(refs.map((r) => (assets.manifest(r)?.data as PartData | undefined)?.variant));
}
