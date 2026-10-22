import { Type, AssetRef, InstanceKind, Transform, CharacterState, Vec2, TrackKind, type Instance, type Camera } from '@frame/schema';
import { defineCommand, fail } from '../command.js';
import { characterTrackKinds, defaultInstance, makeCamera, makeTrack } from '../defaults.js';
import { cameraOf, instanceOf, sceneOf, trackOf } from '../lookup.js';

const Id = Type.String({ minLength: 1 });
const OptId = Type.Optional(Type.String({ minLength: 1 }));

/* ------------------------------------------------------------------ instances (FR-STG-03) */

defineCommand({
  name: 'instance.add',
  summary: 'Place an asset in a scene (character, prop, set piece, effect, text, image or group). Characters get their own tracks.',
  params: Type.Object({
    scene: Id, id: OptId, kind: InstanceKind, asset: Type.Optional(AssetRef), media: Type.Optional(Type.String()),
    name: Type.String({ minLength: 1 }), transform: Type.Optional(Type.Partial(Transform)), depthPlane: Type.Optional(Type.String()),
    order: Type.Optional(Type.Number()), parallax: Type.Optional(Type.Number()), parent: Type.Optional(Type.String()),
    character: Type.Optional(CharacterState), propState: Type.Optional(Type.String()), params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    trackIds: Type.Optional(Type.Array(Type.String())),
  }, { additionalProperties: false }),
  examples: [{ scene: 'scn_00000001', kind: 'prop', asset: 'prop.mug@1', name: 'Mug', transform: { x: 800, y: 900 } }],
  prepare: (p, _s, ctx) => ({
    ...p,
    id: p.id ?? ctx.newId('ins'),
    trackIds: p.kind === 'character' ? (p.trackIds ?? characterTrackKinds.map(() => ctx.newId('trk'))) : undefined,
  }),
  label: (p) => `Place ${p.name}`,
  touches: (p) => [`scenes/${p.scene}/instances/${p.id}`],
  apply: (d, p, ctx) => {
    const scene = sceneOf(d, p.scene);
    if (scene.instances.some((i) => i.id === p.id)) fail('CONFLICT', `Instance ${p.id} exists`);
    if (p.kind === 'character' && !p.character) fail('VALIDATION_FAILED', 'Character instances need character state (look, view, posture, auto)');
    if (p.kind !== 'group' && p.kind !== 'image' && p.kind !== 'text' && !p.asset) fail('VALIDATION_FAILED', `${p.kind} instances need an asset reference`);
    if (p.depthPlane && !scene.stage.depthPlanes.some((dp) => dp.id === p.depthPlane)) fail('VALIDATION_FAILED', `Unknown depth plane ${p.depthPlane}`);
    if (p.parent) {
      const parent = instanceOf(scene, p.parent);
      if (parent.kind !== 'group') fail('VALIDATION_FAILED', 'Parent must be a group');
    }
    const plane = p.depthPlane ?? 'mid';
    const maxOrder = Math.max(-1, ...scene.instances.filter((i) => i.depthPlane === plane).map((i) => i.order));
    const base = defaultInstance({ id: p.id as Instance['id'], kind: p.kind, name: p.name });
    const inst: Instance = {
      ...base,
      transform: { ...base.transform, ...p.transform },
      depthPlane: plane,
      order: p.order ?? maxOrder + 1,
      parallax: p.parallax ?? scene.stage.depthPlanes.find((dp) => dp.id === plane)?.parallax ?? 1,
      ...(p.asset ? { asset: p.asset } : {}),
      ...(p.media ? { media: p.media } : {}),
      ...(p.parent ? { parent: p.parent as Instance['id'] } : {}),
      ...(p.character ? { character: p.character } : {}),
      ...(p.propState ? { propState: p.propState } : {}),
      params: p.params ?? {},
    };
    scene.instances.push(inst);
    if (p.kind === 'character') {
      characterTrackKinds.forEach((k, i) => {
        const t = makeTrack(ctx.newId, k, inst.id);
        t.id = p.trackIds![i] as never;
        t.name = k === 'dialogue' ? 'Dialogue' : t.name;
        scene.tracks.push(t);
      });
    }
  },
});

const InstancePatch = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  asset: Type.Optional(AssetRef),
  transform: Type.Optional(Type.Partial(Transform)),
  depthPlane: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
  parallax: Type.Optional(Type.Number()),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  parent: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  visible: Type.Optional(Type.Boolean()),
  locked: Type.Optional(Type.Boolean()),
  character: Type.Optional(Type.Partial(CharacterState)),
  propState: Type.Optional(Type.String()),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { additionalProperties: false });

defineCommand({
  name: 'instance.update',
  summary: 'Change instance properties: transform, depth, parallax, opacity, visibility, lock, look, view, posture, parameters.',
  params: Type.Object({ scene: Id, id: Id, set: InstancePatch }, { additionalProperties: false }),
  examples: [{ scene: 'scn_00000001', id: 'ins_00000002', set: { transform: { x: 640 } } }],
  label: (p, s) => {
    const name = s.scenes[p.scene]?.instances.find((i) => i.id === p.id)?.name ?? 'object';
    if (p.set.transform) return `Move ${name}`;
    if (p.set.character?.look) return `Change look of ${name}`;
    return `Edit ${name}`;
  },
  touches: (p) => [`scenes/${p.scene}/instances/${p.id}`],
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    const inst = instanceOf(scene, p.id) as Instance;
    if (inst.locked && p.set.locked !== false && Object.keys(p.set).some((k) => k !== 'locked' && k !== 'visible')) {
      fail('VALIDATION_FAILED', `${inst.name} is locked`, undefined, 'Unlock it first.');
    }
    const s = p.set;
    if (s.depthPlane && !scene.stage.depthPlanes.some((dp) => dp.id === s.depthPlane)) fail('VALIDATION_FAILED', `Unknown depth plane ${s.depthPlane}`);
    if (s.transform) Object.assign(inst.transform, s.transform);
    if (s.character) {
      if (!inst.character) fail('VALIDATION_FAILED', `${inst.name} is not a character`);
      Object.assign(inst.character, s.character);
    }
    if (s.params) Object.assign(inst.params, s.params);
    if (s.parent === null) delete inst.parent;
    else if (s.parent) {
      if (s.parent === inst.id) fail('VALIDATION_FAILED', 'An object cannot be its own parent');
      if (instanceOf(scene, s.parent).kind !== 'group') fail('VALIDATION_FAILED', 'Parent must be a group');
      inst.parent = s.parent as Instance['id'];
    }
    for (const k of ['name', 'asset', 'depthPlane', 'order', 'parallax', 'opacity', 'visible', 'locked', 'propState'] as const) {
      if (s[k] !== undefined) (inst as Record<string, unknown>)[k] = s[k];
    }
  },
});

defineCommand({
  name: 'instance.remove',
  summary: 'Remove instances and their own tracks and clips (undoable).',
  params: Type.Object({ scene: Id, ids: Type.Array(Id, { minItems: 1 }) }, { additionalProperties: false }),
  label: (p, s) => (p.ids.length === 1 ? `Delete ${s.scenes[p.scene]?.instances.find((i) => i.id === p.ids[0])?.name ?? 'object'}` : `Delete ${p.ids.length} objects`),
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    const ids = new Set<string>(p.ids);
    for (const id of p.ids) instanceOf(scene, id);
    // children of removed groups are removed too
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of scene.instances) if (i.parent && ids.has(i.parent) && !ids.has(i.id)) { ids.add(i.id); grew = true; }
    }
    const tracks = new Set(scene.tracks.filter((t) => ids.has(t.owner)).map((t) => t.id));
    scene.instances = scene.instances.filter((i) => !ids.has(i.id));
    scene.tracks = scene.tracks.filter((t) => !tracks.has(t.id));
    scene.clips = scene.clips.filter((c) => !tracks.has(c.track));
    for (const c of scene.cameras) c.subjects = c.subjects.filter((s) => !ids.has(s));
  },
});

defineCommand({
  name: 'instance.group',
  summary: 'Group instances under a new group instance (FR-STG-03).',
  params: Type.Object({ scene: Id, ids: Type.Array(Id, { minItems: 1 }), id: OptId, name: Type.Optional(Type.String()) }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('ins') }),
  label: () => 'Group',
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    const members = p.ids.map((id) => instanceOf(scene, id));
    const xs = members.map((m) => m.transform.x);
    const ys = members.map((m) => m.transform.y);
    const g = defaultInstance({ id: p.id as Instance['id'], kind: 'group', name: p.name ?? 'Group' });
    g.transform = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, scale: 1, rotation: 0, flipX: false };
    g.depthPlane = members[0]!.depthPlane;
    g.order = Math.max(...members.map((m) => m.order));
    scene.instances.push(g);
    for (const id of p.ids) {
      const m = scene.instances.find((i) => i.id === id)!;
      m.parent = g.id;
      m.transform.x -= g.transform.x;
      m.transform.y -= g.transform.y;
    }
  },
});

defineCommand({
  name: 'instance.ungroup',
  summary: 'Dissolve a group, keeping members in place.',
  params: Type.Object({ scene: Id, id: Id }, { additionalProperties: false }),
  label: () => 'Ungroup',
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    const g = instanceOf(scene, p.id);
    if (g.kind !== 'group') fail('VALIDATION_FAILED', 'Not a group');
    for (const m of scene.instances) {
      if (m.parent === g.id) {
        m.transform.x += g.transform.x;
        m.transform.y += g.transform.y;
        if (g.parent) m.parent = g.parent; else delete m.parent;
      }
    }
    scene.instances = scene.instances.filter((i) => i.id !== g.id);
  },
});

/* ------------------------------------------------------------------ cameras (FR-CAM-01) */

defineCommand({
  name: 'camera.add',
  summary: 'Add a camera.',
  params: Type.Object({
    scene: Id, id: OptId, name: Type.String({ minLength: 1 }), center: Type.Optional(Vec2), width: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    rotation: Type.Optional(Type.Number()), lens: Type.Optional(Type.Union([Type.Literal('24mm'), Type.Literal('35mm'), Type.Literal('50mm'), Type.Literal('85mm')])),
    preset: Type.Optional(AssetRef), subjects: Type.Optional(Type.Array(Type.String())),
  }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('cam') }),
  label: (p) => `Add camera ${p.name}`,
  touches: (p) => [`scenes/${p.scene}/cameras/${p.id}`],
  apply: (d, p, ctx) => {
    const scene = sceneOf(d, p.scene);
    const cam = makeCamera(ctx.newId, p.name, scene.stage.width, scene.stage.height);
    cam.id = p.id as Camera['id'];
    if (p.center) cam.center = p.center;
    if (p.width) cam.width = p.width;
    if (p.rotation !== undefined) cam.rotation = p.rotation;
    if (p.lens) cam.lens = p.lens;
    if (p.preset) cam.preset = p.preset;
    if (p.subjects) cam.subjects = p.subjects as Camera['subjects'];
    scene.cameras.push(cam);
  },
});

defineCommand({
  name: 'camera.update',
  summary: 'Change a camera framing, lens, rotation, subjects or per-ratio overrides.',
  params: Type.Object({
    scene: Id, id: Id,
    set: Type.Object({
      name: Type.Optional(Type.String({ minLength: 1 })), center: Type.Optional(Vec2), width: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
      rotation: Type.Optional(Type.Number()), lens: Type.Optional(Type.Union([Type.Literal('24mm'), Type.Literal('35mm'), Type.Literal('50mm'), Type.Literal('85mm')])),
      preset: Type.Optional(AssetRef), subjects: Type.Optional(Type.Array(Type.String())),
      ratioRule: Type.Optional(Type.Union([Type.Literal('center'), Type.Literal('headroom')])),
      ratioOverrides: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Null(), Type.Object({ center: Vec2, width: Type.Number({ exclusiveMinimum: 0 }) })]))),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  label: (p, s) => `Reframe ${s.scenes[p.scene]?.cameras.find((c) => c.id === p.id)?.name ?? 'camera'}`,
  touches: (p) => [`scenes/${p.scene}/cameras/${p.id}`],
  apply: (d, p) => {
    const cam = cameraOf(sceneOf(d, p.scene), p.id) as Camera;
    const { ratioOverrides, ...rest } = p.set;
    Object.assign(cam, rest);
    if (ratioOverrides) {
      for (const [k, v] of Object.entries(ratioOverrides)) {
        if (v === null) delete cam.ratioOverrides[k];
        else cam.ratioOverrides[k] = v;
      }
    }
  },
});

defineCommand({
  name: 'camera.remove',
  summary: 'Remove a camera; shots that used it fall back to the default camera.',
  params: Type.Object({ scene: Id, id: Id }, { additionalProperties: false }),
  label: () => 'Delete camera',
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    cameraOf(scene, p.id);
    if (scene.cameras.length <= 1) fail('VALIDATION_FAILED', 'A scene needs at least one camera');
    scene.cameras = scene.cameras.filter((c) => c.id !== p.id);
    if (scene.defaultCamera === p.id) scene.defaultCamera = scene.cameras[0]!.id;
    for (const c of scene.clips) if (c.params.camera === p.id) c.params.camera = scene.defaultCamera;
  },
});

defineCommand({
  name: 'camera.setDefault',
  summary: 'Set the camera used where no shot covers the time (FR-CAM-02).',
  params: Type.Object({ scene: Id, id: Id }, { additionalProperties: false }),
  label: () => 'Set default camera',
  touches: (p) => [`scenes/${p.scene}/defaultCamera`],
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    cameraOf(scene, p.id);
    scene.defaultCamera = p.id as Camera['id'];
  },
});

/* ------------------------------------------------------------------ tracks (FR-TML-07) */

defineCommand({
  name: 'track.add',
  summary: 'Add a track to the scene or to an instance.',
  params: Type.Object({ scene: Id, id: OptId, kind: TrackKind, owner: Type.String(), name: Type.Optional(Type.String()) }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('trk') }),
  label: (p) => `Add ${p.kind} track`,
  apply: (d, p, ctx) => {
    const scene = sceneOf(d, p.scene);
    if (p.owner !== 'scene') instanceOf(scene, p.owner);
    const t = makeTrack(ctx.newId, p.kind, p.owner);
    t.id = p.id as never;
    if (p.name) t.name = p.name;
    scene.tracks.push(t);
  },
});

defineCommand({
  name: 'track.update',
  summary: 'Change track name, mute, solo, lock, hidden or gain.',
  params: Type.Object({
    scene: Id, id: Id,
    set: Type.Object({
      name: Type.Optional(Type.String()), mute: Type.Optional(Type.Boolean()), solo: Type.Optional(Type.Boolean()),
      lock: Type.Optional(Type.Boolean()), hidden: Type.Optional(Type.Boolean()), gainDb: Type.Optional(Type.Number({ minimum: -60, maximum: 12 })),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  label: (p) => (p.set.mute !== undefined ? (p.set.mute ? 'Mute track' : 'Unmute track') : p.set.solo !== undefined ? 'Solo track' : p.set.lock !== undefined ? 'Lock track' : 'Edit track'),
  touches: (p) => [`scenes/${p.scene}/tracks/${p.id}`],
  apply: (d, p) => {
    Object.assign(trackOf(sceneOf(d, p.scene), p.id), p.set);
  },
});

defineCommand({
  name: 'track.remove',
  summary: 'Remove a track and its clips.',
  params: Type.Object({ scene: Id, id: Id }, { additionalProperties: false }),
  label: () => 'Delete track',
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    trackOf(scene, p.id);
    scene.tracks = scene.tracks.filter((t) => t.id !== p.id);
    scene.clips = scene.clips.filter((c) => c.track !== p.id);
  },
});

/* ------------------------------------------------------------------ stage (FR-STG-01) */

defineCommand({
  name: 'stage.addMark',
  summary: 'Add a named character mark (standing or seat position).',
  params: Type.Object({
    scene: Id, id: OptId, name: Type.String(), x: Type.Number(), y: Type.Number(), depthPlane: Type.Optional(Type.String()),
    facing: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('right'), Type.Literal('front')])),
    seat: Type.Optional(Type.Object({ instance: Type.String(), anchor: Type.String() })),
  }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('mk') }),
  label: (p) => `Add mark ${p.name}`,
  apply: (d, p) => {
    const scene = sceneOf(d, p.scene);
    scene.stage.marks.push({ id: p.id as never, name: p.name, x: p.x, y: p.y, depthPlane: p.depthPlane ?? 'mid', facing: p.facing ?? 'front', ...(p.seat ? { seat: p.seat as never } : {}) });
  },
});

defineCommand({
  name: 'stage.addGroundLine',
  summary: 'Add a ground line (where feet stand) with a character scale.',
  params: Type.Object({ scene: Id, id: OptId, name: Type.String(), y: Type.Number(), depthPlane: Type.Optional(Type.String()), scale: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('gl') }),
  label: (p) => `Add ground line ${p.name}`,
  apply: (d, p) => {
    sceneOf(d, p.scene).stage.groundLines.push({ id: p.id as never, name: p.name, y: p.y, depthPlane: p.depthPlane ?? 'mid', scale: p.scale ?? 1 });
  },
});

defineCommand({
  name: 'stage.removeMark',
  summary: 'Remove a mark or ground line.',
  params: Type.Object({ scene: Id, id: Id }, { additionalProperties: false }),
  label: () => 'Delete mark',
  apply: (d, p) => {
    const st = sceneOf(d, p.scene).stage;
    const before = st.marks.length + st.groundLines.length;
    st.marks = st.marks.filter((m) => m.id !== p.id);
    st.groundLines = st.groundLines.filter((g) => g.id !== p.id);
    if (st.marks.length + st.groundLines.length === before) fail('NOT_FOUND', `Mark ${p.id} not found`);
  },
});
