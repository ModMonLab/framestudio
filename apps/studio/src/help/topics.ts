/**
 * Help topics (FR-ONB-02): short task-oriented pages shown in the Help screen and linked from every panel. Bodies use
 * the notes Markdown subset (headings, lists, bold, italic).
 */
export interface HelpTopic {
  id: string;
  title: string;
  body: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'start', title: 'Getting started', body: `## Your first scene
1. Create a project from **Home**: pick a folder, a style and optionally a template.
2. Place characters, sets and props from the **Assets** rail.
3. Add lines from a character's **Audio** tab or the **Script view**, then generate or upload takes.
4. Add expressions, actions and shots in **Direct** mode, then trim in **Edit** mode.
5. **Export** when the Problems badge is clear.

Press *Ctrl/⌘ K* at any time to search commands, scenes, layers, assets, settings and help.` },
  { id: 'modes', title: 'Stage, Direct and Edit', body: `## Three modes, one project
- **Stage** (1): place and arrange objects on the canvas; depth planes and parallax.
- **Direct** (2): performance — expressions, actions, gaze, walking, shots and recipes.
- **Edit** (3): the timeline first — trim, split, ripple, markers and sound.

Every change is a command: undo with *Ctrl/⌘ Z*, and the label tells you what will be undone.` },
  { id: 'layers', title: 'Layers', body: `## The Layers tree
The tree lists the scene's cameras, characters, props, sets, effects and text by depth plane. Click to select (the canvas and timeline follow), double-click to rename, drag to reorder or regroup. Right-click for more actions.

Use the search field to filter long lists; it matches names and kinds.` },
  { id: 'assets', title: 'Assets and the library', body: `## Finding things
Search across everything, then filter by kind. Items that do not fit the selection stay visible but disabled, with the reason on hover.

- Drag an item to the canvas or a timeline track, or select it and use the main button.
- Open the full-page library for versions, usages and licences.
- Import your own artwork from *File ▸ Import package…* or the library's Import button.` },
  { id: 'builder', title: 'Character builder', body: `## Building a character
Open the builder from a character's properties. Sections cover body, head, face, hair, wardrobe and identity; every choice previews in both style families and all four views.

- **Looks** keep outfits and colours together; a scene instance chooses a look.
- **Randomise** suggests combinations you can keep or undo.
- Save publishes a new version; projects keep using the version they pinned until you update usages.` },
  { id: 'dialogue', title: 'Lines and takes', body: `## Dialogue
A line belongs to a speaker and has one text, delivery and chosen take. Edit it in the timeline, the Properties panel or the **Script view** — it is the same line.

- **Generate** takes with the voice worker, **upload** a recording, or record one.
- Editing the text marks generated takes *Outdated*; recordings can be confirmed explicitly.
- Use \`[pause 0.5s]\` or an ellipsis for beats.
- *Scene ▸ Script view* imports a script (\`NAME: line\` or Fountain) and exports text, Fountain or PDF.` },
  { id: 'timeline', title: 'Timeline', body: `## Editing time
- Drag clips to move, edges to trim; *S* splits at the playhead; *Ripple* closes gaps.
- Box-select with a drag on empty lanes; Shift adds to the selection.
- Markers: *M* adds one; double-click to rename.
- Overlapping clips that cannot play together are hatched; the Problems list offers a fix.` },
  { id: 'camera', title: 'Cameras and shots', body: `## Shots
Add cameras from the Layers tree or framing presets in Assets. A shot clip on the Camera track cuts to a camera; transitions blend between shots. *Auto coverage* proposes shots from the dialogue.` },
  { id: 'sound', title: 'Sound and music', body: `## Sound
Music and ambience duck under dialogue automatically. Set gain, pan and fades per clip and track; mute and solo tracks from their headers. Export normalises loudness to the output preset's target.` },
  { id: 'export', title: 'Export', body: `## Export
Choose a preset (landscape, portrait, square, audio-only, GIF, image sequence), a range and captions. Export is blocked while problems marked *blocks export* remain; the dialog lists them with links. Finished renders open in the Jobs list with an in-app player.` },
  { id: 'voice', title: 'Voices and the voice worker', body: `## The voice worker
Voices are designed, generated and aligned by the Voice Worker, a separate program on a machine with a GPU. Set its address in **Settings ▸ Voice worker**. Without it you can still upload recordings and use every other part of Frame.

Frame never presents fixture or test audio as real speech; such takes are labelled.` },
  { id: 'projects', title: 'Projects, versions and packages', body: `## Keeping work safe
- Every change is saved within a second; the badge shows Saved, Saving, Unsaved or Not saved (with Retry).
- *File ▸ Versions…* saves named snapshots you can compare, restore or open as a copy.
- Packages (.frameproj, .framechar, .frameasset, .framevoice) move work between machines.
- If another program edits the project files while you have unsaved changes, Frame pauses saving and asks which version to keep.` },
  { id: 'agents', title: 'AI agents and the CLI', body: `## Working with agents
Everything in the Studio is also available to the \`frame\` CLI and to AI agents over MCP. Agent changes are tagged in the activity list and can be reverted as a group. Agents cannot change their own permissions; set them in *File ▸ Project settings…*.` },
  { id: 'shortcuts', title: 'Keyboard shortcuts', body: `## Shortcuts
- *Space* play/pause · *J K L* shuttle · *← →* frame step (Shift: 1 s) · *1 2 3* modes
- *Ctrl/⌘ K* command palette · *Ctrl/⌘ Z* undo · *Ctrl/⌘ Shift Z* redo
- *Ctrl/⌘ X C V* cut, copy, paste · *Ctrl/⌘ D* duplicate · *Delete* remove
- *Ctrl/⌘ S* save · *Ctrl/⌘ E* export

Rebind the Ctrl/⌘ shortcuts in **Settings ▸ Keyboard shortcuts**.` },
];

export const helpHref = (id: string) => `#/help/${id}`;
