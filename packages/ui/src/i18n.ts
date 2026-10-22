/**
 * UI string catalogue (NFR-16): every user-facing string goes through t(). English is the only locale in v1;
 * adding a locale means adding a message table, not touching components.
 */
export type Messages = Record<string, string>;

const tables: Record<string, Messages> = { en: {} };
let locale = 'en';

export function registerMessages(lang: string, messages: Messages): void {
  tables[lang] = { ...(tables[lang] ?? {}), ...messages };
}

export function setLocale(lang: string): void {
  locale = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLocale(): string {
  return locale;
}

/** Looks up a message by key; `{name}` placeholders are replaced from vars. Falls back to English, then the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const msg = tables[locale]?.[key] ?? tables.en?.[key] ?? key;
  return vars ? msg.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? `{${k}}`)) : msg;
}

registerMessages('en', {
  'common.clear': 'Clear',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.dismiss': 'Dismiss',
  'common.search': 'Search',
  'common.noResults': 'No results for “{query}”.',
  'common.noOptions': 'No options',
  'common.collapse': 'Collapse {label}',
  'common.expand': 'Expand {label}',
  'common.customColour': 'Custom colour',
  'common.hex': 'Hex',
  'common.eyedropper': 'Pick from screen',
  'common.loading': 'Loading',
  'common.reset': 'Reset to default',
  'job.cancel': 'Cancel {name}',
  'job.elapsed': '{time} elapsed',
  'job.remaining': '{time} left',
});
