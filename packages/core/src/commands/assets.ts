import { Type, AssetManifest, AssetRef, issues, type AssetManifest as Manifest } from '@frame/schema';
import type { CharacterData } from '../perform/character.js';
import { defineCommand, fail } from '../command.js';

/* ------------------------------------------------------------------ project-local assets (FR-AST-06, FR-VOI-01/10) */

defineCommand({
  name: 'asset.addLocal',
  summary: 'Store a project-local asset version (user.<uuid>@n), e.g. a designed voice. Published versions are immutable.',
  params: Type.Object({ manifest: Type.Unknown() }, { additionalProperties: false }),
  label: (p) => `Add ${(p.manifest as Manifest).name}`,
  touches: (p) => [`assets/${(p.manifest as Manifest).id}@${(p.manifest as Manifest).version}`],
  apply: (d, p) => {
    const m = p.manifest as Manifest;
    const errs = issues(AssetManifest, m, 5);
    if (errs.length) fail('VALIDATION_FAILED', `Asset manifest is invalid: ${errs.map((e) => `${e.path} ${e.message}`).join('; ')}`, { issues: errs });
    if (!m.id.startsWith('user.')) fail('VALIDATION_FAILED', 'Project-local assets use user.<uuid> IDs');
    const ref = `${m.id}@${m.version}`;
    if (d.assets[ref]) fail('CONFLICT', `${ref} already exists; publish a new version instead`, { ref });
    d.assets[ref] = JSON.parse(JSON.stringify(m));
  },
});

defineCommand({
  name: 'asset.removeLocal',
  summary: 'Remove a project-local asset version that nothing in the project uses.',
  params: Type.Object({ ref: AssetRef }, { additionalProperties: false }),
  label: () => 'Remove local asset',
  touches: (p) => [`assets/${p.ref}`],
  apply: (d, p) => {
    if (!d.assets[p.ref]) fail('NOT_FOUND', `${p.ref} is not a project-local asset`);
    const used = Object.values(d.scenes).some((s) => JSON.stringify(s).includes(`"${p.ref}"`)) || JSON.stringify(d.project).includes(`"${p.ref}"`);
    if (used) fail('CONFLICT', `${p.ref} is still used in this project`);
    delete d.assets[p.ref];
  },
});

/* ------------------------------------------------------------------ update usages (FR-CHR-10, FR-AST-05) */

const refId = (ref: string) => ref.slice(0, ref.lastIndexOf('@'));

defineCommand({
  name: 'asset.updateUsages',
  summary: 'Switch usages of one asset version to another — one instance, every instance in a scene, or the whole project (instances, clips, voices, cast). Explicit and undoable; other usages keep their version (P5).',
  params: Type.Object(
    {
      from: AssetRef,
      to: AssetRef,
      scope: Type.Union([Type.Literal('instance'), Type.Literal('scene'), Type.Literal('project')]),
      scene: Type.Optional(Type.String()),
      instance: Type.Optional(Type.String()),
      looks: Type.Optional(Type.Array(Type.String(), { description: 'Look ids of the target version; instances on a look it lacks switch to fallbackLook.' })),
      fallbackLook: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  examples: [{ from: 'user.00000000-0000-4000-8000-000000000001@1', to: 'user.00000000-0000-4000-8000-000000000001@2', scope: 'scene', scene: 'scn_00000001' }],
  prepare: (p, s) => {
    // Looks of a project-local target are known here; library targets pass them explicitly.
    const target = s.assets[p.to];
    if (target?.kind === 'chr' && !p.looks) {
      const d = target.data as CharacterData;
      return { ...p, looks: d.looks.map((l) => l.id), fallbackLook: p.fallbackLook ?? d.defaultLook };
    }
    return p;
  },
  label: (p, s) => {
    const name = s.assets[p.to]?.name ?? refId(p.to);
    const v = p.to.slice(p.to.lastIndexOf('@') + 1);
    const where = p.scope === 'instance' ? s.scenes[p.scene ?? '']?.instances.find((i) => i.id === p.instance)?.name ?? 'one instance' : p.scope === 'scene' ? `scene ${s.scenes[p.scene ?? '']?.name ?? ''}`.trim() : 'the project';
    return `Update ${name} to version ${v} in ${where}`;
  },
  apply: (d, p, ctx) => {
    if (refId(p.from) !== refId(p.to)) fail('USAGE', `${p.from} and ${p.to} are different assets; use the relink fix for a replacement`);
    if (p.scope !== 'project' && !p.scene) fail('USAGE', 'scene is required for scope scene or instance');
    if (p.scope === 'instance' && !p.instance) fail('USAGE', 'instance is required for scope instance');
    if (p.scene && !d.scenes[p.scene]) fail('NOT_FOUND', `Scene ${p.scene} not found`);
    const scenes = p.scope === 'project' ? Object.values(d.scenes) : [d.scenes[p.scene!]!];
    const updated: { scene: string; kind: string; id: string }[] = [];
    for (const sc of scenes) {
      for (const i of sc.instances) {
        if (p.scope === 'instance' && i.id !== p.instance) continue;
        if (i.asset === p.from) {
          i.asset = p.to;
          if (i.character && p.looks && !p.looks.includes(i.character.look) && p.fallbackLook) i.character.look = p.fallbackLook;
          updated.push({ scene: sc.id, kind: 'instance', id: i.id });
        }
        if (i.character?.voice === p.from) {
          i.character.voice = p.to;
          updated.push({ scene: sc.id, kind: 'voice', id: i.id });
        }
        if (i.character?.baseExpression === p.from) {
          i.character.baseExpression = p.to;
          updated.push({ scene: sc.id, kind: 'expression', id: i.id });
        }
      }
      if (p.scope === 'instance') {
        const owned = new Set(sc.tracks.filter((t) => t.owner === p.instance).map((t) => t.id));
        for (const c of sc.clips) if (owned.has(c.track) && c.asset === p.from) {
          c.asset = p.to;
          updated.push({ scene: sc.id, kind: 'clip', id: c.id });
        }
      } else {
        for (const c of sc.clips) if (c.asset === p.from) {
          c.asset = p.to;
          updated.push({ scene: sc.id, kind: 'clip', id: c.id });
        }
      }
    }
    if (p.scope === 'project') for (const c of d.project.cast) if (c.character === p.from) c.character = p.to;
    if (p.scope === 'instance' && !updated.length) fail('NOT_FOUND', `Instance ${p.instance} does not use ${p.from}`);
    ctx.report({ updated });
  },
});
