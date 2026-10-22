# Frame — Design System

| | |
|---|---|
| Document | 02 of 4 — Design System |
| Version | 1.0 |
| Date | 22 October 2026 |
| Status | Normative for all Studio UI |
| Reference mockups | Design Round 2 — "Studio workspace" and "Character builder", described in full in §7; source in `docs/spec/mockups/` (visual reference only) |
| Related | 01 Vision (principle P13) · 04 SRS (§UI requirements cite this document) |

This document defines how Frame's interface looks, is organised and behaves. The two approved mockups are the **reference implementation** of these rules; where this document and a mockup disagree, this document wins. The SRS makes this document binding: UI requirements state *what* must exist; this document states *how it must look and behave*.

"Shall" is mandatory, "should" is the default unless a recorded reason exists, "may" is optional.

---

## 1 Design philosophy

Frame's interface follows one idea: **the work is the hero; the tool is calm, dense and precise around it.** It should feel like a professional creative application in the browser — in the family of Adobe's web apps, Canva and Figma — never like a themed toy or a marketing page.

### 1.1 Principles

**D1 — Neutral chrome, colourful content.**
The interface is greyscale with one accent colour. Colour belongs to the creator's work (characters, sets, clip types). Decorative colour in the chrome competes with the art and is not used.

**D2 — Organisation carries complexity.**
Frame has thousands of assets and hundreds of settings. They are made manageable through four patterns used consistently everywhere: **trees** (hierarchy), **collapsible sections** (progressive disclosure), **lists** (scannable choices) and **search** (direct access). A new feature should fit one of these patterns before a new pattern is invented.

**D3 — Density with breathing room.**
Controls are compact (28 px rows, 12 px text) so panels show a lot at once, but alignment, consistent spacing and dividers keep them calm. Density never comes from cramming; it comes from removing decoration.

**D4 — Context over chrome.**
Show controls where and when they apply: a contextual toolbar for the selection, a properties panel for the selected item, a mode that changes the defaults. Hide what does not apply rather than disabling everything.

**D5 — One way to do a thing, many ways to reach it.**
Every action has one canonical control, reachable also by menu, keyboard shortcut, search and command palette. The canonical control always looks the same.

**D6 — Direct manipulation first, precise entry always.**
Drag on the canvas and timeline; type an exact number in the properties panel. Both edit the same value and both are undoable as one step.

**D7 — Honest state.**
Saved, saving, generating, failed, outdated, offline — every status is visible in text, never by colour alone, never optimistic.

**D8 — Two themes, one design.**
Dark and light themes are equal citizens built from the same tokens. Nothing is designed for one theme and "inverted" for the other.

**D9 — Quiet motion.**
Motion explains change (a section opening, a panel sliding) and is fast. The canvas is where things move; the chrome mostly does not.

**D10 — Accessible by construction.**
Keyboard reachable, screen-reader labelled, visible focus, sufficient contrast in both themes, and no information carried by colour alone.

### 1.2 What to avoid

Gradient-washed backgrounds, coloured panels, glowing or neon accents, oversized rounded "card" layouts, emoji as icons, large decorative illustrations in the chrome, multiple accent colours, heavy drop shadows, decorative borders, animated chrome, playful copy in serious places, and modal dialogs for things a panel can do.

---

## 2 Design tokens

Tokens are the single source of truth. Components reference semantic tokens (`color.panel`) — never raw values. Tokens are published as CSS custom properties (`--color-panel`) and as JSON for the CLI renderer and documentation.

### 2.1 Colour — semantic tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `color.app` | `#1E1E20` | `#F1F1F3` | Application background behind panels |
| `color.panel` | `#252528` | `#FFFFFF` | Panels, bars, menus |
| `color.subtle` | `#2C2C30` | `#F6F6F8` | Group headers, segmented-control wells, secondary buttons |
| `color.field` | `#1B1B1D` | `#FFFFFF` | Inputs, search fields, number badges |
| `color.hover` | `#323236` | `#EEEEF2` | Hover background for rows, menu items, icon buttons |
| `color.border` | `#38383D` | `#DCDCE2` | Panel borders, input borders |
| `color.divider` | `#2F2F33` | `#EBEBEE` | Lines between rows and sections |
| `color.canvas` | `#161618` | `#E4E4E9` | Area around the stage frame |
| `color.text` | `#ECECEE` | `#1C1C1F` | Primary text |
| `color.text2` | `#B4B4B9` | `#4F4F56` | Secondary text, labels |
| `color.text3` | `#9A9AA0` | `#6B6B72` | Tertiary text, hints, metadata, placeholder |
| `color.accent` | `#4F7CFF` | `#3A66F0` | Primary actions, selection, focus, active tab indicator |
| `color.accent.hover` | `#6A90FF` | `#2A52CC` | Hover on accent surfaces |
| `color.on-accent` | `#FFFFFF` | `#FFFFFF` | Text and icons on accent |
| `color.selected` | `rgba(79,124,255,0.22)` | `rgba(58,102,240,0.12)` | Selected row/tile background |
| `color.focus` | `#6A90FF` | `#3A66F0` | 2 px focus ring |
| `color.success` | `#3CB371` | `#1E8E4E` | Saved, passed, connected |
| `color.warning` | `#E5A33B` | `#A86400` | Outdated, attention |
| `color.danger` | `#F06A6A` | `#C62F2F` | Failed, destructive |
| `color.info` | `#5AA9E6` | `#1F6FB2` | Informational status |
| `color.overlay` | `rgba(0,0,0,0.55)` | `rgba(20,20,30,0.35)` | Modal scrim |

Contrast requirements: `text` ≥ 7:1 and `text2` and `text3` ≥ 4.5:1 (WCAG AA) against `panel`, `subtle` and `field` in their theme. The values above meet this; the build shall verify it automatically. Any new colour token shall be checked against the same surfaces.

### 2.2 Colour — timeline and content categories

Clip and asset-category colours are the only saturated colours in the chrome. Each category has a fill and a text colour per theme; categories are also distinguished by **icon and label**, never colour alone.

| Category token | Dark fill / text | Light fill / text | Applies to |
|---|---|---|---|
| `clip.shot` | `#35507A` / `#E9EEFB` | `#D9E4F8` / `#1D3A6B` | Camera shots |
| `clip.move` | `#3D4B5C` / `#E3E8EF` | `#E1E6EC` / `#2D3A4A` | Camera moves, shakes |
| `clip.dialogue` | `#22675F` / `#E4F5F2` | `#CDEBE6` / `#14514A` | Dialogue lines |
| `clip.lipsync` | `#34343A` / `#C9C9CF` | `#ECECEF` / `#4F4F56` | Mouth-shape blocks |
| `clip.acting` | `#4F4590` / `#ECE9FB` | `#E3DEF8` / `#3A2F78` | Actions, gestures, posture, locomotion |
| `clip.face` | `#7A5C22` / `#FBF1DC` | `#F4E6C7` / `#5B4413` | Expressions, gaze |
| `clip.effect` | `#7A3F62` / `#FBE8F2` | `#F5DBE8` / `#6B2B51` | Motion effects, symbols, atmosphere |
| `clip.music` | `#433F86` / `#EBEAFB` | `#DEDCF6` / `#2F2B70` | Music |
| `clip.ambience` | `#37566A` / `#E2EDF3` | `#D8E7EF` / `#234759` | Ambience |
| `clip.sfx` | `#5E5D30` / `#F3F2DC` | `#EBE9CD` / `#4A4919` | Sound effects |
| `clip.text` | `#4A4A52` / `#EDEDF0` | `#E6E6EA` / `#33333A` | Captions, titles, graphics |

### 2.3 Typography

| Token | Value |
|---|---|
| `font.ui` | `Inter, "Segoe UI", system-ui, -apple-system, sans-serif` |
| `font.mono` | `"JetBrains Mono", ui-monospace, Menlo, monospace` (timecodes, numeric badges, IDs) |
| `font.weight.regular / medium / semibold / bold` | 400 / 500 / 600 / 700 |

| Style token | Size / line height / weight | Use |
|---|---|---|
| `type.caption` | 11 / 14 / 400–500 | Metadata, counts, ruler labels, rail labels (10 px allowed only for rail labels) |
| `type.body` | 12 / 16 / 400 | Default UI text, rows, fields |
| `type.body.strong` | 12 / 16 / 600 | Section headers, selected tree nodes, tab labels |
| `type.title.sm` | 13 / 18 / 600 | Panel titles |
| `type.title` | 14 / 20 / 600–700 | App bar product name, dialog titles |
| `type.title.lg` | 20 / 28 / 600 | Home and empty-state headings |
| `type.display` | 28 / 36 / 600 | Home hero only |
| `type.mono` | 11–12 / 16 / 500 | Timecodes, values |

Rules: sentence case everywhere (not Title Case), no all-caps except the shot badge on the canvas, numerals tabular in timecodes and numeric fields, never below 11 px except rail labels.

### 2.4 Spacing, sizing and layout

| Token | Value | Use |
|---|---|---|
| `space.1`…`space.8` | 2, 4, 6, 8, 12, 16, 24, 32 px | All padding and gaps |
| `size.row` | 28 px | Tree rows, list rows, fields, buttons, segmented controls |
| `size.row.lg` | 32–36 px | List rows with two lines, section headers (36) |
| `size.icon` | 16 px (14–20) | Icons; icon buttons 26–30 px square |
| `size.appbar` | 48 px | Top application bar |
| `size.toolbar` | 44 px | Contextual and canvas toolbars |
| `size.rail` | 64 px | Left icon rail |
| `size.panel.left` | 272 px (resizable 220–420) | Layers/assets/parts panel |
| `size.panel.right` | 300 px (resizable 260–440) | Properties panel (builder: 304) |
| `size.timeline` | 332 px default (resizable 160–70% of viewport) | Timeline |
| `size.timeline.header` | 200 px | Track header column |
| `size.touch` | 44 px | Minimum target on touch devices |

Layout grid: panels align to 4 px; content inside panels uses 12 px horizontal padding; nested tree levels indent 14 px.

### 2.5 Shape, elevation and motion

| Token | Value |
|---|---|
| `radius.xs / sm / md / lg` | 4 / 6 / 8 / 10 px (buttons and fields: 6; tiles: 8; dialogs: 10; badges: 4) |
| `radius.full` | 999 px (status dots, play button) |
| `border.width` | 1 px (selected tiles: 2 px accent) |
| `shadow.float` | `0 2px 8px rgba(0,0,0,0.12)` — floating canvas controls |
| `shadow.popover` | `0 8px 24px rgba(0,0,0,0.24)` — menus, popovers |
| `shadow.dialog` | `0 16px 48px rgba(0,0,0,0.32)` — dialogs |
| `shadow.stage` | `0 1px 2px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22)` — stage frame |
| `motion.fast` | 80 ms — hover, press |
| `motion.base` | 150 ms — expand/collapse, tab change |
| `motion.slow` | 220 ms — panel slide, dialog enter |
| `motion.ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `z.canvas / panel / sticky / popover / dialog / toast` | 0 / 10 / 20 / 100 / 200 / 300 |

All motion respects `prefers-reduced-motion` (durations collapse to 0, except playback).

### 2.6 Iconography

- One outline icon family at 1.7–2 px stroke, 24 px grid, rendered at 14–20 px, `currentColor`. (Lucide-compatible geometry is acceptable.)
- Filled icons only for transport (play, pause, stop) and status dots.
- Every icon-only button has an accessible name and a tooltip with its shortcut.
- No emoji in the chrome. Asset previews are thumbnails of the real asset, not icons.

### 2.7 Token export (JSON)

```json
{
  "color": {
    "dark":  { "app": "#1E1E20", "panel": "#252528", "subtle": "#2C2C30", "field": "#1B1B1D", "hover": "#323236",
               "border": "#38383D", "divider": "#2F2F33", "canvas": "#161618", "text": "#ECECEE", "text2": "#B4B4B9",
               "text3": "#9A9AA0", "accent": "#4F7CFF", "accentHover": "#6A90FF", "onAccent": "#FFFFFF",
               "selected": "rgba(79,124,255,0.22)", "focus": "#6A90FF", "success": "#3CB371", "warning": "#E5A33B",
               "danger": "#F06A6A", "info": "#5AA9E6", "overlay": "rgba(0,0,0,0.55)" },
    "light": { "app": "#F1F1F3", "panel": "#FFFFFF", "subtle": "#F6F6F8", "field": "#FFFFFF", "hover": "#EEEEF2",
               "border": "#DCDCE2", "divider": "#EBEBEE", "canvas": "#E4E4E9", "text": "#1C1C1F", "text2": "#4F4F56",
               "text3": "#6B6B72", "accent": "#3A66F0", "accentHover": "#2A52CC", "onAccent": "#FFFFFF",
               "selected": "rgba(58,102,240,0.12)", "focus": "#3A66F0", "success": "#1E8E4E", "warning": "#A86400",
               "danger": "#C62F2F", "info": "#1F6FB2", "overlay": "rgba(20,20,30,0.35)" }
  },
  "clip": {
    "dark":  { "shot": ["#35507A","#E9EEFB"], "move": ["#3D4B5C","#E3E8EF"], "dialogue": ["#22675F","#E4F5F2"],
               "lipsync": ["#34343A","#C9C9CF"], "acting": ["#4F4590","#ECE9FB"], "face": ["#7A5C22","#FBF1DC"],
               "effect": ["#7A3F62","#FBE8F2"], "music": ["#433F86","#EBEAFB"], "ambience": ["#37566A","#E2EDF3"],
               "sfx": ["#5E5D30","#F3F2DC"], "text": ["#4A4A52","#EDEDF0"] },
    "light": { "shot": ["#D9E4F8","#1D3A6B"], "move": ["#E1E6EC","#2D3A4A"], "dialogue": ["#CDEBE6","#14514A"],
               "lipsync": ["#ECECEF","#4F4F56"], "acting": ["#E3DEF8","#3A2F78"], "face": ["#F4E6C7","#5B4413"],
               "effect": ["#F5DBE8","#6B2B51"], "music": ["#DEDCF6","#2F2B70"], "ambience": ["#D8E7EF","#234759"],
               "sfx": ["#EBE9CD","#4A4919"], "text": ["#E6E6EA","#33333A"] }
  },
  "font": { "ui": "Inter, 'Segoe UI', system-ui, sans-serif", "mono": "'JetBrains Mono', ui-monospace, monospace" },
  "type": { "caption": [11, 14], "body": [12, 16], "titleSm": [13, 18], "title": [14, 20], "titleLg": [20, 28], "display": [28, 36] },
  "space": [2, 4, 6, 8, 12, 16, 24, 32],
  "size": { "row": 28, "rowLg": 34, "appbar": 48, "toolbar": 44, "rail": 64, "panelLeft": 272, "panelRight": 300, "timeline": 332, "trackHeader": 200 },
  "radius": { "xs": 4, "sm": 6, "md": 8, "lg": 10, "full": 999 },
  "motion": { "fast": 80, "base": 150, "slow": 220, "ease": "cubic-bezier(0.2,0,0,1)" }
}
```

---

## 3 Themes

- Dark is the default; light is a full equal. A third option, **System**, follows `prefers-color-scheme`.
- The theme switch lives in the app bar (sun/moon icon button) and in Settings; the choice persists per user.
- Theme never changes the creator's content: stage art, characters and exported video are identical in both themes. Only the chrome and clip chips change.
- Thumbnails of assets are rendered on a neutral swatch that reads in both themes.
- High-contrast mode (Windows forced colours) shall keep focus rings, selection and clip boundaries visible using system colours.

---

## 4 Layout architecture

### 4.1 The studio shell

```
┌──────────────────────────────── App bar (48) ─────────────────────────────────┐
│ Logo · Menus · Breadcrumb · Save state │ Stage | Direct | Edit │ Status · Theme · Undo/Redo · Preview · Export │
├────┬──────────────┬──────────────── Contextual toolbar (44) ──────┬───────────┤
│Rail│ Left panel   │                                               │ Properties│
│ 64 │ 272          │          Canvas (stage frame centred)         │ 300       │
│    │ title·search │                                               │ tabs      │
│    │ tree / lists │   floating: style (bottom-left), zoom (bottom-right)       │ sections  │
├────┴──────────────┴───────────────────────────────────────────────┴───────────┤
│ Timeline toolbar (40): transport · timecode · snap/ripple · filter tracks · All/Picture/Audio · zoom │
│ Track headers (200) │ Ruler · clips · playhead                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- All panels are resizable by dragging their inner edge; sizes persist per user.
- Left panel, right panel and timeline can each be collapsed (shortcut and View menu); the canvas grows to fill.
- Minimum supported viewport: 1280 × 720 at 100 % zoom; reference viewport 1440 × 900; the layout shall remain usable at 125 % browser zoom by collapsing the rail labels and allowing panels to scroll.
- Below 1100 px width, the right panel becomes an overlay drawer; below 900 px the studio shows a "best on a larger screen" notice but still opens (read-only review is acceptable on tablets).

### 4.2 Modes

The three workspace modes are tabs in the app bar. Modes **change defaults, not capabilities** — every panel remains reachable in every mode.

| Mode | Purpose | Default right tab | Contextual toolbar shows | Timeline emphasis |
|---|---|---|---|---|
| **Stage** | Build the set, place cast and props, frame cameras | Properties | Look, Pose, Depth, View | Camera and layers |
| **Direct** | Perform: lines, expressions, gestures, gaze, recipes | Acting | Expression, Gesture, Look at, Recipe | Character groups expanded |
| **Edit** | Cut, mix and finish | Audio | Voice, Take, Gain, Fade | Camera and sound expanded |

### 4.3 Left rail destinations

Layers · Assets · Cast · Text · Effects · Audio · Templates. Each opens the left panel with a title, search field and its content. Assets/Cast/Text/Effects/Audio/Templates are filtered views of the same library browser (§5.3).

---

## 5 Organisation patterns

### 5.1 Tree (hierarchy)

Used for: Layers, character Parts, project/episode/scene navigation, asset folders.

- Row height 28 px; indent 14 px per level; chevron (10 px) in an 18 px hit area; type icon 15 px; label; trailing metadata in `text3`; optional trailing status (changed dot, visibility, lock).
- Group rows (depth ≤ 2) use semibold labels; leaves use regular weight; deeper detail rows use `text2`.
- Click selects; chevron toggles; double-click renames (where renamable) or frames the object on the canvas.
- Keyboard (WAI-ARIA tree): ↑/↓ move, → expand/enter, ← collapse/parent, Home/End, Enter select, F2 rename, type-ahead.
- Search filters the tree, shows matching rows **with their ancestors**, expands all matched branches and highlights the matched text. "No results" states the query.
- "Collapse all" in the panel header. Expansion state persists per project.
- Hover reveals row actions (visibility eye, lock, more ⋯) without shifting layout.
- Drag and drop reorders and reparents where allowed (e.g., moving a prop into a group, changing layer order) with a 2 px accent insertion line.

### 5.2 Collapsible sections (progressive disclosure)

Used for: Properties panel, Parts properties, Assets categories, timeline groups, dialogs with advanced options.

- Header row 36 px: chevron, semibold title, trailing summary of the current value in `text3` (e.g., "Expression — Embarrassed"). The summary lets a collapsed section still inform.
- Content padding 2 px 12 px 12 px; vertical gap 8–10 px between controls; 1 px `divider` between sections.
- Default open state is chosen per section and mode; user choices persist.
- Sections never nest more than one level; deeper structure becomes a tree or a list.

### 5.3 Lists and the library browser

- **Radio list** (single choice from named options): bordered container, 32 px rows, radio mark, label, trailing metadata; selected row uses `selected` background.
- **Asset list** (two-line): 34 px rows with a 30 px real thumbnail, name, metadata ("Reaction · 1.0 s").
- **Tile grid** (visual choice): 3 columns in the properties panel (2 on narrow), 8 px radius tiles with a real rendered preview; selected tile has 2 px accent border and `selected` fill.
- **Library browser:** search across everything; results grouped by category (collapsible, with counts); each group shows up to 6 items then "See all N"; filters for style family, view support, compatibility with the selection, source (bundled / mine / imported), and tags; list ↔ grid toggle; drag from browser to canvas, character or timeline.
- Incompatible items remain visible but disabled with the reason on hover (P11), unless the "Compatible only" filter is on.

### 5.4 Search everywhere

- Every panel with more than ~15 items has a search field directly under its title.
- A global **command palette** (Ctrl/⌘ K) searches commands, assets, layers, scenes, settings and help, and shows shortcuts.
- Search is instant (no submit), case-insensitive, matches names, tags and current values, and supports simple filters (`type:expression`, `style:illustrated`, `view:side`).

---

## 6 Components

Each component lists anatomy, states and rules. States for every interactive component: default, hover, pressed, focus-visible, selected/checked (where applicable), disabled (with reason), and loading (where applicable).

| Component | Spec |
|---|---|
| **App bar** | 48 px, `panel` background, bottom border. Left: product mark (26 px accent tile) and name, text menus (File, Edit, View, Insert, Scene, Help), breadcrumb (Episodes / Project) and save-state badge. Centre: mode tabs. Right: voice-worker status, theme, undo, redo, Preview (secondary), Export (primary). |
| **Text menu** | 28 px ghost buttons; menus open on click and on hover once one is open; items 28 px with shortcut right-aligned in `text3`; separators; submenus. |
| **Underline tabs** | Label semibold; active: `text` + 2 px inset accent underline; inactive: `text2`. Used for modes and panel tabs. |
| **Segmented control** | Well in `subtle` with 1 px border and 2 px padding; options 24 px high; active option is a `panel` chip with a 1 px border; equal or content-width options. |
| **Primary button** | 28 px, accent fill, white semibold label, radius 6. At most one per region. |
| **Secondary button** | 28 px, `subtle` fill, 1 px border, `text` label. |
| **Ghost / icon button** | Transparent; hover `hover`; icon 14–16 px in 26–30 px square. |
| **Text field** | 28–30 px, `field` background, 1 px border, focus border accent; leading icon optional; clear button when filled. |
| **Number field** | Monospace value, label prefix inside the field (X, Y, W, H); supports arrow-key nudge (Shift ×10), scrubbing by dragging the label, and expressions (`+10`, `*2`). |
| **Select / dropdown** | Field-styled button with value and chevron; opens a menu with search when > 10 options. |
| **Slider row** | Label (`text2`) and numeric badge (mono, field background) on one line; range below; end labels ("Narrow" / "Wide") in `text3` caption. Double-click resets to default. The badge is editable. |
| **Swatch grid** | 8 columns of square swatches, radius 6, selected = 2 px accent ring inset by a `panel` gap; hex shown in the row header; a final "custom" swatch opens a colour picker with palette, eyedropper and hex. |
| **Toggle row** | Checkbox (15 px) + label + secondary description. Switch style only for on/off settings that apply immediately. |
| **Chip** | 26 px, used for quick choices in contextual places (expressions in Direct mode); selected = `selected` fill, accent border and text. |
| **Status badge** | 18–20 px, caption text, `subtle` fill; status dot (7 px) plus text; never colour alone. |
| **Toolbar** | 44 px, `panel` background, border on the canvas side; groups separated by a 1 px × 20 px divider. Contextual toolbar starts with the selection's colour dot and name. |
| **Floating canvas control** | `panel` pill, 1 px border, `shadow.float`, 3 px padding; used for zoom (bottom-right) and style (bottom-left). |
| **Popover / menu** | `panel`, 1 px border, radius 8, `shadow.popover`, 4 px padding, 28 px items. |
| **Dialog** | Max 640 px (wide 960), radius 10, `shadow.dialog`; title row, body, footer with secondary then primary buttons right-aligned; Esc closes; focus trapped; never used for something a panel can host. |
| **Toast** | Bottom-right, max 420 px, status icon + message + optional action (Undo/Retry) + dismiss; auto-dismiss 4 s (errors 9 s, never for errors needing action). |
| **Progress / job row** | For renders and voice generation: name, state text, progress bar (4 px), elapsed/remaining, cancel. Jobs appear in a Jobs popover from the app bar. |
| **Empty state** | Panel-level: short sentence of what goes here + one primary action. No illustrations larger than 64 px. |
| **Tooltip** | 11 px, inverted surface, 400 ms delay, includes shortcut. |
| **Skeleton** | Shimmer-free neutral blocks while thumbnails or panels load. |

### 6.1 Canvas components

- **Stage frame:** centred, exact output aspect ratio, `shadow.stage`, 2 px radius; area around it is `canvas`. Safe-area guides (title-safe 90 %, action-safe 93 %) toggleable.
- **Selection:** 1.5 px accent outline with 7 px white square handles; rotation handle above; multi-select shows a group box; hover shows a 1 px `text3` outline.
- **Shot badge:** top-left of the frame, caption, white on 65 % black, uppercase camera name (the only uppercase in the UI).
- **Captions preview:** rendered with the project's caption style exactly as exported.
- **Guides and snapping:** smart guides in accent; spacing indicators; snap to stage centre, other objects, ground lines and anchors.
- **Camera framing overlay:** in Stage mode a camera's frame is shown as a dashed rectangle with its name; dragging it reframes the shot.

### 6.2 Timeline components

- **Toolbar (40 px):** back-to-start, play/pause (30 px accent circle), timecode `00:04.2 / 00:30.0` in mono, Snap and Ripple toggles, track filter field, All/Picture/Audio segmented control, zoom slider.
- **Ruler (22 px):** mono caption labels; click or drag to seek; markers shown as small flags; loop range as a tinted band.
- **Track header column (200 px):** group rows (26 px, `subtle`, chevron, colour key square, name, track count) and lane rows (30 px, indented 26 px, type icon, name, M/S for audio lanes, lock).
- **Collapsed group:** shows a condensed summary strip of its clips so timing stays visible.
- **Clip:** radius 4, category fill/text tokens, 11 px medium label with ellipsis; trim handles on hover (6 px); selected = 2 px accent outline; invalid/conflicting = danger outline and hatched fill with a warning icon; muted = 50 % opacity and a muted icon; generating = animated stripe (respects reduced motion) and "Generating" label.
- **Lip-sync lane:** mouth-shape blocks labelled with the shape letter in mono 9 px; editable by drag and by choosing a shape.
- **Playhead:** 1 px accent line with a handle in the ruler; follows playback; auto-scroll optional.
- **Waveforms:** drawn from decoded audio in `clip text` colour at 35 % opacity inside dialogue and sound clips.

---

## 7 Reference screens

The approved mockups are normative examples of the system. Implementations shall match their structure and behaviour; pixel values come from the tokens.

### 7.1 Studio workspace (reference: "Studio workspace — Stage / Direct / Edit")

| Region | Content and behaviour |
|---|---|
| App bar | Frame mark, menus, breadcrumb "Episodes / The Backup Recording", "Saved" badge, mode tabs (Stage, Direct, Edit), voice worker status, theme toggle, undo/redo, Preview, Export. |
| Rail | Layers, Assets, Cast, Text, Effects, Audio, Templates (icon + 10 px label; active = `selected` fill, accent icon). |
| Left panel — Layers | Title, collapse-all, add; search; tree: Episode → Scenes → Cast (characters → Look, Voice, Pose), Set (Background, Furniture, Props), Cameras, Atmosphere, Screen overlays; metadata on the right (Seated, 35mm, Fore/Mid/Back). |
| Left panel — Assets | Search across all; collapsible categories with live counts taken from the Catalog (Expressions, Actions, Recipes, Characters, Props, Locations, Effects, Camera, Sound, Text); two-line asset rows with thumbnails; "See all N". |
| Contextual toolbar | Selection dot + name; mode-dependent property menus (e.g., Direct: Expression · Gesture · Look at · Recipe); duplicate, delete. |
| Canvas | Centred 16:9 stage; selection with handles; caption preview; shot badge; floating Style (Flat / Illustrated) and Zoom controls. |
| Properties panel | Tabs Properties / Acting / Audio; collapsible sections: Transform (X/Y/W/H/rotation/flip), Layer and depth (depth plane, parallax, opacity), Appearance (look, view, open in builder), Pose; Expression (chips, intensity, blend), Gesture, Gaze, Recipes; Voice, Current line (takes list), Delivery, Lip sync, Mix. |
| Timeline | Groups Camera (Shots, Moves), each character (Dialogue, Lip sync, Acting, Face), Effects, Sound (Music, Ambience, Sound FX); M/S/lock; filter; All/Picture/Audio; playback animates cuts, lip sync and acting. |

### 7.2 Character builder (reference: "Character builder")

| Region | Content and behaviour |
|---|---|
| App bar | Breadcrumb "Cast / Maya Bennett", version badge "v2 · edited", Preview style (Flat / Illustrated), theme, undo/redo, Export…, Save version 3 (primary). |
| Left panel — Parts | Search parts and settings (matches names and current values); tree: Identity · Body (Build, Torso, Arms and hands, Legs and feet) · Head and face (Face shape, Eyes, Eyebrows, Nose, Mouth, Ears, Skin and details) · Hair (Hairstyle, Colour, Facial hair) · Wardrobe (Saved looks, Top, Bottoms, Shoes) · Accessories · Voice (Voice asset, Emotional range, Auditions) · Performance defaults. Current value shown as metadata; changed parts marked with an accent dot. Footer: rig check status. |
| Canvas toolbar | View (Front, ¾, Side, Back), Frame (Full body, Upper, Face), Turnaround sheet toggle. |
| Canvas | Large live preview, or a four-view turnaround sheet; style badge; mouth-shape readout during lip-sync test. |
| Bottom toolbar | Expression test (Neutral, Smile, Surprise, Sad, Skeptical, Embarrassed, Angry), Gesture test (Rest, Talk, Point, Wave), Test lip sync. |
| Properties panel | Header with breadcrumb and part name, reset; collapsible sections using radio lists, swatch grids, slider rows with numeric badges, toggles, preset tiles rendered from the character itself, take lists with waveforms, and action buttons. |

### 7.3 Screens specified by pattern (to be designed in the same system)

Home and project browser, template gallery, episode/scene overview, asset library (full-page), voice designer and voice library, part editor (vector point editing per view), import wizard, export dialog and jobs, settings (general, theme, voice worker, storage, shortcuts), command palette, CLI/agent activity log, help and onboarding tour. Each shall use the shell, patterns and components above; no new visual language may be introduced for them.

---

## 8 Interaction rules

- **Selection is shared:** selecting on the canvas, in the Layers tree or on the timeline selects the same object everywhere.
- **Every edit is undoable;** drags, slider scrubs and typing in one field are single undo steps. Undo/redo labels describe the action ("Undo Move Maya").
- **Autosave** is continuous; the save badge shows Saved / Saving… / Unsaved / Not saved (with Retry).
- **Keyboard:** Space play/pause · K/J/L shuttle · ←/→ frame step (Shift: 1 s) · Home/End · Ctrl/⌘ Z / Shift Z / Y · Ctrl/⌘ D duplicate · Delete · V select · M move · C camera tool · T text · F frame selection · Ctrl/⌘ K command palette · Ctrl/⌘ S save version / package · 1/2/3 switch Stage/Direct/Edit · \\ toggle panels. Shortcuts never fire while typing in a text field.
- **Drag and drop:** from library to canvas (place), to a character (apply expression/action/look), to the timeline (create clip at drop time), between tree nodes (reparent/reorder).
- **Context menus** on canvas objects, tree rows and clips mirror the toolbar/properties actions.
- **Destructive actions** are undoable with a toast; only irreversible ones (delete project, delete voice asset with dependents) use a confirmation dialog that names the consequences.
- **Long operations** (generation, alignment, export, import) never block the UI; they appear as jobs with progress and cancel.

---

## 9 Content and voice of the interface

- Use the director's vocabulary (P1): cast, line, beat, look, shot, cut, take. Avoid engine terms in primary UI.
- Labels are short nouns or verb phrases in sentence case: "Look at", "Generate takes", "Save version 3".
- Errors say what happened and what to do next: "Leo's line has no audio. Record, upload or generate a take."
- Status text is literal: "Generating take 2 of 3…", not "Working magic…".
- Numbers carry units: "0.25 s", "−18 dB", "35mm", "70 %".
- No exclamation marks, no jokes in system messages, no anthropomorphic copy.

---

## 10 Accessibility checklist

- All functionality reachable by keyboard; visible 2 px focus ring in `color.focus` with 2 px offset.
- Correct ARIA roles: `tablist/tab`, `tree/treeitem` with `aria-expanded`, `radiogroup/radio`, `toolbar`, `slider` with value text, `dialog` with labelled title, live regions for status and toasts.
- Text contrast per §2.1; non-text contrast ≥ 3:1 for borders of inputs, focus rings and clip outlines.
- Information never by colour alone: clip types have icons and labels; statuses have text.
- Usable at 125 % and 150 % zoom; text resizes without clipping.
- Reduced motion honoured; no flashing content in the chrome.
- Canvas objects are listed in the Layers tree so every object is selectable without pointer precision.

---

## 11 Governance

- Tokens live in one package (`@frame/design-tokens`) generating CSS variables, TypeScript constants and the JSON above; the UI may not hard-code colours, sizes or durations.
- Components live in one package (`@frame/ui`) with stories for every state in both themes; visual regression tests run on both themes.
- Changes to tokens or components require updating this document and the component stories in the same change.
