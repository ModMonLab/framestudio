import './commands/structure.js';
import './commands/stage.js';
import './commands/timeline.js';
import './commands/assets.js';
import { listCommands } from './command.js';

export * from './time.js';
export * from './ids.js';
export * from './state.js';
export * from './command.js';
export * from './session.js';
export * from './defaults.js';
export * from './lookup.js';
export * from './validate.js';
export { takeMatchesRevision, estimateSpeechSeconds } from './commands/timeline.js';
export { sceneIdMap, remapScene } from './commands/structure.js';
export * from './perform/lipsync.js';
export * from './perform/data.js';
export * from './perform/character.js';
export * from './perform/evaluate.js';
export * from './captions.js';
export * from './audio.js';
export * from './sync.js';

/** Machine-readable command reference (`frame describe`, MCP resources; FR-CLI-03, FR-AGT-03). */
export function describeCommands() {
  return listCommands().map((c) => ({
    name: c.name,
    summary: c.summary,
    commutative: Boolean(c.touches),
    params: JSON.parse(JSON.stringify(c.params)),
    examples: c.examples ?? [],
  }));
}
export * from './preview.js';
export * from './build-character.js';
export * from './compare.js';
export * from './character-check.js';
export * from './rigging.js';
