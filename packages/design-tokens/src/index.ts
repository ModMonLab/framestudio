/**
 * Frame design tokens — the single source of truth for the Studio chrome (Design System §2, §11).
 * Components reference semantic tokens through CSS custom properties (`var(--color-panel)`), never raw values.
 */

export type ThemeName = 'dark' | 'light';

export const colorTokenNames = [
  'app', 'panel', 'subtle', 'field', 'hover', 'border', 'divider', 'canvas', 'text', 'text2', 'text3',
  'accent', 'accentHover', 'accentFill', 'accentFillHover', 'accentText', 'onAccent', 'selected', 'focus', 'success', 'warning', 'danger', 'info', 'overlay',
] as const;
export type ColorToken = (typeof colorTokenNames)[number];

export const clipCategories = [
  'shot', 'move', 'dialogue', 'lipsync', 'acting', 'face', 'effect', 'music', 'ambience', 'sfx', 'text',
] as const;
export type ClipCategory = (typeof clipCategories)[number];

export const color: Record<ThemeName, Record<ColorToken, string>> = {
  dark: {
    app: '#1E1E20', panel: '#252528', subtle: '#2C2C30', field: '#1B1B1D', hover: '#323236',
    border: '#38383D', divider: '#2F2F33', canvas: '#161618', text: '#ECECEE', text2: '#B4B4B9',
    text3: '#9A9AA0', accent: '#4F7CFF', accentHover: '#6A90FF', accentFill: '#3F69EE', accentFillHover: '#365FDB', accentText: '#8EAAFF', onAccent: '#FFFFFF',
    selected: 'rgba(79,124,255,0.22)', focus: '#6A90FF', success: '#3CB371', warning: '#E5A33B',
    danger: '#F06A6A', info: '#5AA9E6', overlay: 'rgba(0,0,0,0.55)',
  },
  light: {
    app: '#F1F1F3', panel: '#FFFFFF', subtle: '#F6F6F8', field: '#FFFFFF', hover: '#EEEEF2',
    border: '#DCDCE2', divider: '#EBEBEE', canvas: '#E4E4E9', text: '#1C1C1F', text2: '#4F4F56',
    text3: '#6B6B72', accent: '#3A66F0', accentHover: '#2A52CC', accentFill: '#3A66F0', accentFillHover: '#2A52CC', accentText: '#2A52CC', onAccent: '#FFFFFF',
    selected: 'rgba(58,102,240,0.12)', focus: '#3A66F0', success: '#1E8E4E', warning: '#A86400',
    danger: '#C62F2F', info: '#1F6FB2', overlay: 'rgba(20,20,30,0.35)',
  },
};

/** Clip and asset-category colours: [fill, text] per theme (Design System §2.2). */
export const clip: Record<ThemeName, Record<ClipCategory, readonly [string, string]>> = {
  dark: {
    shot: ['#35507A', '#E9EEFB'], move: ['#3D4B5C', '#E3E8EF'], dialogue: ['#22675F', '#E4F5F2'],
    lipsync: ['#34343A', '#C9C9CF'], acting: ['#4F4590', '#ECE9FB'], face: ['#7A5C22', '#FBF1DC'],
    effect: ['#7A3F62', '#FBE8F2'], music: ['#433F86', '#EBEAFB'], ambience: ['#37566A', '#E2EDF3'],
    sfx: ['#5E5D30', '#F3F2DC'], text: ['#4A4A52', '#EDEDF0'],
  },
  light: {
    shot: ['#D9E4F8', '#1D3A6B'], move: ['#E1E6EC', '#2D3A4A'], dialogue: ['#CDEBE6', '#14514A'],
    lipsync: ['#ECECEF', '#4F4F56'], acting: ['#E3DEF8', '#3A2F78'], face: ['#F4E6C7', '#5B4413'],
    effect: ['#F5DBE8', '#6B2B51'], music: ['#DEDCF6', '#2F2B70'], ambience: ['#D8E7EF', '#234759'],
    sfx: ['#EBE9CD', '#4A4919'], text: ['#E6E6EA', '#33333A'],
  },
};

export const font = {
  ui: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

/** [size, lineHeight] in px (Design System §2.3). */
export const type = {
  caption: [11, 14], body: [12, 16], titleSm: [13, 18], title: [14, 20], titleLg: [20, 28], display: [28, 36], mono: [11, 16],
} as const;

export const space = [2, 4, 6, 8, 12, 16, 24, 32] as const;

export const size = {
  row: 28, rowLg: 34, section: 36, icon: 16, iconButton: 28, appbar: 48, toolbar: 44, timelineToolbar: 40,
  rail: 64, panelLeft: 272, panelLeftMin: 220, panelLeftMax: 420, panelRight: 300, panelRightMin: 260,
  panelRightMax: 440, builderPanelRight: 304, timeline: 332, timelineMin: 160, trackHeader: 200,
  ruler: 22, groupRow: 26, laneRow: 30, touch: 44, indent: 14,
} as const;

export const radius = { xs: 4, sm: 6, md: 8, lg: 10, full: 999 } as const;

export const shadow = {
  float: '0 2px 8px rgba(0,0,0,0.12)',
  popover: '0 8px 24px rgba(0,0,0,0.24)',
  dialog: '0 16px 48px rgba(0,0,0,0.32)',
  stage: '0 1px 2px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22)',
} as const;

export const motion = { fast: 80, base: 150, slow: 220, ease: 'cubic-bezier(0.2,0,0,1)' } as const;

export const z = { canvas: 0, panel: 10, sticky: 20, popover: 100, dialog: 200, toast: 300 } as const;

export const tokens = { color, clip, font, type, space, size, radius, shadow, motion, z } as const;

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** CSS custom properties for one theme (colour and clip tokens). */
export function themeVariables(theme: ThemeName): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of colorTokenNames) vars[`--color-${kebab(name)}`] = color[theme][name];
  for (const cat of clipCategories) {
    vars[`--clip-${cat}`] = clip[theme][cat][0];
    vars[`--clip-${cat}-text`] = clip[theme][cat][1];
  }
  return vars;
}

/** Theme-independent CSS custom properties. */
export function baseVariables(): Record<string, string> {
  const vars: Record<string, string> = {
    '--font-ui': font.ui,
    '--font-mono': font.mono,
    '--motion-fast': `${motion.fast}ms`,
    '--motion-base': `${motion.base}ms`,
    '--motion-slow': `${motion.slow}ms`,
    '--motion-ease': motion.ease,
  };
  for (const [k, [fs, lh]] of Object.entries(type)) {
    vars[`--type-${kebab(k)}-size`] = `${fs}px`;
    vars[`--type-${kebab(k)}-line`] = `${lh}px`;
  }
  space.forEach((v, i) => (vars[`--space-${i + 1}`] = `${v}px`));
  for (const [k, v] of Object.entries(size)) vars[`--size-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(z)) vars[`--z-${k}`] = String(v);
  return vars;
}

function block(selector: string, vars: Record<string, string>): string {
  return `${selector} {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
}

/**
 * Full stylesheet: base variables on :root, dark theme as default, light theme under [data-theme="light"],
 * System follows prefers-color-scheme via [data-theme="system"]. Reduced motion collapses durations.
 */
export function tokensCss(): string {
  return [
    '/* Generated from @frame/design-tokens. Do not edit by hand. */\n',
    block(':root', baseVariables()),
    block(':root, [data-theme="dark"]', themeVariables('dark')),
    block('[data-theme="light"]', themeVariables('light')),
    `@media (prefers-color-scheme: light) {\n${block('  [data-theme="system"]', themeVariables('light'))}}\n`,
    `@media (prefers-reduced-motion: reduce) {\n${block('  :root', { '--motion-fast': '0ms', '--motion-base': '0ms', '--motion-slow': '0ms' })}}\n`,
  ].join('\n');
}

/** JSON export in the shape of Design System §2.7. */
export function tokensJson(): unknown {
  return {
    color, clip, font: { ui: font.ui, mono: font.mono }, type: Object.fromEntries(Object.entries(type).filter(([k]) => k !== 'mono')),
    space, size: { row: size.row, rowLg: size.rowLg, appbar: size.appbar, toolbar: size.toolbar, rail: size.rail,
      panelLeft: size.panelLeft, panelRight: size.panelRight, timeline: size.timeline, trackHeader: size.trackHeader },
    radius, motion,
  };
}

/* ---------- contrast (WCAG 2.x) ---------- */

export function parseColor(c: string): [number, number, number, number] {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = c.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const p = rgba[1]!.split(',').map((s) => parseFloat(s.trim()));
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  throw new Error(`Unsupported colour ${c}`);
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: string): number {
  const [r, g, b] = parseColor(c);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
