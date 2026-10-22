/**
 * File import into a project (SRS §4.4, FR-IMP-01/02): images become project-local image assets (raster media or a
 * parsed vector drawing) that can be placed as objects or backgrounds; audio becomes content-addressed media on a
 * music, ambience or SFX track. Every import is validated before anything is stored and records provenance — file
 * name, date and the user's statement of rights — and a licence.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { secondsToTicks, type ProjectState } from '@frame/core';
import { FrameError, type AssetManifest, type Command, type License } from '@frame/schema';
import type { OpenProject } from './project.js';
import { checkRaster, parseSvg } from './import-image.js';
import { decodeAudioFile } from './audio.js';

export const AUDIO_EXTS = ['wav', 'mp3', 'flac', 'ogg', 'm4a'] as const;
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const;
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60 * 60;
const AUDIO_MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4' };

/** How the user holds the rights to an imported file (FR-IMP-02). */
export type RightsStatement = 'own' | 'licensed' | 'public-domain';

export interface ImportRequest {
  fileName: string;
  rights: RightsStatement;
  /** Licence name or URL when rights are 'licensed' (e.g. "CC-BY-4.0"); attribution text optional. */
  licence?: string;
  attribution?: string;
  author: string;
  /** Where to use it: a scene and a role. Without a scene the asset/media is only stored. */
  scene?: string;
  as?: 'object' | 'background' | 'music' | 'ambience' | 'sfx';
  /** Start time for audio (ticks) and position for objects (stage units). */
  at?: number;
  x?: number;
  y?: number;
  source?: string;
  dryRun?: boolean;
}

export interface ImportResult {
  kind: 'image' | 'audio';
  asset?: string;
  media?: string;
  instance?: string;
  clip?: string;
  revision: number;
  warnings: string[];
  dryRun: boolean;
}

const ext = (name: string) => path.extname(name).slice(1).toLowerCase();

export function licenceFor(r: ImportRequest): License {
  if (r.rights === 'own') return { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true, ...(r.attribution ? { attribution: r.attribution } : {}) };
  if (r.rights === 'public-domain') return { id: 'CC0-1.0', redistributable: true, commercialUse: true };
  if (!r.licence?.trim()) throw new FrameError('USAGE', 'Name the licence you hold for this file (for example CC-BY-4.0)', undefined, 'FR-IMP-02 records the licence with every import.');
  return { id: r.licence.trim(), redistributable: false, commercialUse: true, ...(r.attribution ? { attribution: r.attribution } : {}) };
}

function checkRequest(r: ImportRequest) {
  if (!r.fileName || r.fileName.includes('/') || r.fileName.includes('\\')) throw new FrameError('USAGE', 'fileName must be a plain file name');
  if (!['own', 'licensed', 'public-domain'].includes(r.rights)) throw new FrameError('USAGE', 'State your rights to the file: own, licensed or public-domain', undefined, 'Imports record a statement of rights (FR-IMP-02).');
}

function imageManifest(id: string, name: string, data: unknown, r: ImportRequest, date: string): AssetManifest {
  return {
    schemaVersion: 1, id, version: 1, kind: 'img', name, category: 'Imported images', group: 'Imports', tags: ['imported', 'image'], synonyms: [],
    families: [], views: [], viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {},
    license: licenceFor(r),
    provenance: { method: 'imported', author: r.author, date, sourceFile: r.fileName, rightsStatement: r.rights === 'own' ? 'I made this or own the rights' : r.rights === 'public-domain' ? 'Public domain' : `Licensed: ${r.licence}` },
    data,
  } as AssetManifest;
}

function sceneOf(state: ProjectState, id: string | undefined) {
  const s = id ? state.scenes[id] : undefined;
  if (id && !s) throw new FrameError('NOT_FOUND', `Scene ${id} not found`);
  return s;
}

/** Imports one file into an open project in a single undoable step. */
export function importFile(p: OpenProject, bytes: Uint8Array, r: ImportRequest, o: { newId?: () => string; now?: string } = {}): ImportResult {
  checkRequest(r);
  const e = ext(r.fileName);
  const date = (o.now ?? new Date().toISOString()).slice(0, 10);
  const newId = o.newId ?? randomUUID;
  const scene = sceneOf(p.state, r.scene);
  const warnings: string[] = [];
  const cmds: Command[] = [];
  const name = path.basename(r.fileName, path.extname(r.fileName)).replace(/[_-]+/g, ' ').trim() || 'Imported';

  if ((IMAGE_EXTS as readonly string[]).includes(e)) {
    let data: unknown;
    let w: number;
    let h: number;
    let mediaHash: string | undefined;
    if (e === 'svg') {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new FrameError('VALIDATION_FAILED', `${r.fileName} is not UTF-8 text, so it is not a valid SVG`);
      }
      const svg = parseSvg(text);
      warnings.push(...svg.warnings);
      data = { vector: svg.drawing };
      w = svg.drawing.width;
      h = svg.drawing.height;
    } else {
      const info = checkRaster(bytes);
      if ((e === 'jpg' || e === 'jpeg') !== (info.format === 'jpeg') || (e === 'png') !== (info.format === 'png') || (e === 'webp') !== (info.format === 'webp')) {
        warnings.push(`${r.fileName} is actually a ${info.format.toUpperCase()} file; imported as such`);
      }
      w = info.width;
      h = info.height;
      const media = r.dryRun ? undefined : p.store.putMedia(bytes, { ext: info.ext, mime: info.mime, width: w, height: h });
      mediaHash = media?.hash;
      data = { image: { media: media ?? { hash: 'sha256-' + '0'.repeat(64), ext: info.ext, mime: info.mime, bytes: bytes.byteLength, width: w, height: h }, width: w, height: h } };
    }
    const id = `user.${newId()}`;
    const ref = `${id}@1`;
    cmds.push({ name: 'asset.addLocal', params: { manifest: imageManifest(id, name, data, r, date) } });
    let instance: string | undefined;
    if (scene) {
      const role = r.as ?? 'object';
      if (role !== 'object' && role !== 'background') throw new FrameError('USAGE', `An image can be placed as an object or a background, not ${role}`);
      instance = `ins_${newId().replace(/-/g, '').slice(-16)}`;
      const planes = [...scene.stage.depthPlanes].sort((a, b) => a.order - b.order);
      const back = planes[0]!;
      const cover = Math.max(scene.stage.width / w, scene.stage.height / h);
      const fit = Math.min(1, (scene.stage.width * 0.4) / w, (scene.stage.height * 0.4) / h);
      cmds.push({
        name: 'instance.add',
        params: {
          scene: scene.id, id: instance, kind: 'image', asset: ref, name,
          transform: { x: r.x ?? scene.stage.width / 2, y: r.y ?? scene.stage.height / 2, scale: role === 'background' ? cover : fit },
          ...(role === 'background' ? { depthPlane: back.id, order: -1 } : {}),
        },
      });
    }
    const res = p.session.apply({ commands: cmds, label: `Import ${r.fileName}`, ...(r.source ? { source: r.source } : {}) }, { dryRun: r.dryRun });
    return { kind: 'image', asset: ref, ...(mediaHash ? { media: mediaHash } : {}), ...(instance ? { instance } : {}), revision: res.revision, warnings, dryRun: res.dryRun };
  }

  if ((AUDIO_EXTS as readonly string[]).includes(e)) {
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw new FrameError('VALIDATION_FAILED', `${r.fileName} is ${(bytes.byteLength / 1e6).toFixed(0)} MB; audio imports are limited to 500 MB`);
    // Decode before storing: a file that does not decode is refused with the decoder's reason.
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-import-')), `in.${e}`);
    fs.writeFileSync(tmp, bytes);
    let pcm;
    try {
      pcm = decodeAudioFile(tmp);
    } catch (err) {
      throw new FrameError('VALIDATION_FAILED', `${r.fileName} could not be decoded as audio: ${(err as Error).message}`);
    } finally {
      fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
    const durationS = (pcm.data[0]?.length ?? 0) / pcm.sampleRate;
    if (!(durationS > 0)) throw new FrameError('VALIDATION_FAILED', `${r.fileName} contains no audio`);
    if (durationS > MAX_AUDIO_SECONDS) throw new FrameError('VALIDATION_FAILED', `${r.fileName} is ${(durationS / 60).toFixed(0)} minutes long; audio imports are limited to 60 minutes`);
    const media = r.dryRun ? undefined : p.store.putMedia(bytes, { ext: e, mime: AUDIO_MIME[e]!, durationS, sampleRate: pcm.sampleRate, channels: pcm.channels });
    let clip: string | undefined;
    if (scene) {
      const kind = r.as ?? 'music';
      if (kind !== 'music' && kind !== 'ambience' && kind !== 'sfx') throw new FrameError('USAGE', `Audio can be imported as music, ambience or sfx, not ${kind}`);
      let track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === kind)?.id;
      if (!track) {
        track = `trk_${newId().replace(/-/g, '').slice(-16)}`;
        cmds.push({ name: 'track.add', params: { scene: scene.id, id: track, kind, owner: 'scene' } });
      }
      const start = Math.max(0, Math.min(r.at ?? 0, scene.duration - 1));
      let end = start + secondsToTicks(durationS);
      if (end > scene.duration) {
        warnings.push(`The clip was trimmed at the scene end (${((scene.duration - start) / 48000).toFixed(1)} s of ${durationS.toFixed(1)} s); extend the clip after lengthening the scene`);
        end = scene.duration;
      }
      clip = `clp_${newId().replace(/-/g, '').slice(-16)}`;
      cmds.push({ name: 'clip.add', params: { scene: scene.id, id: clip, track, start, end, media: media?.hash ?? 'sha256-' + '0'.repeat(64), name, params: { gainDb: 0, provenance: { sourceFile: r.fileName, rights: r.rights, licence: licenceFor(r).id, date } } } });
    }
    const res = cmds.length ? p.session.apply({ commands: cmds, label: `Import ${r.fileName}`, ...(r.source ? { source: r.source } : {}) }, { dryRun: r.dryRun }) : { revision: p.session.revision, dryRun: !!r.dryRun };
    return { kind: 'audio', ...(media ? { media: media.hash } : {}), ...(clip ? { clip } : {}), revision: res.revision, warnings, dryRun: res.dryRun };
  }

  throw new FrameError('VALIDATION_FAILED', `.${e || '(none)'} files cannot be imported here`, undefined, `Images: ${IMAGE_EXTS.join(', ')}. Audio: ${AUDIO_EXTS.join(', ')}. Packages: use package import.`);
}
