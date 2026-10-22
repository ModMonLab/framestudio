# 0010 — UI stack

- React 19.2.0, Vite 7.1 with `@vitejs/plugin-react` 5.1 (MIT).
- Icons: `lucide-react` 0.546.0 (ISC) — Lucide geometry is explicitly acceptable (Design System §2.6). Transport icons (play/pause/stop) are Frame's own filled icons.
- Components in `@frame/ui` use only token CSS variables; class prefix `fr-`. All UI strings go through `t()` (NFR-16).
- Component gallery `apps/gallery` renders every component state; `@playwright/test` 1.56.1 (matches the preinstalled Chromium 1194) screenshots each story in both themes at 1440×900 and 1280×720 and runs axe (`@axe-core/playwright` 4.10.2, MPL-2.0, test-only) for WCAG 2.2 A/AA (UI-07, NFR-12).
- Fonts in the browser are the same bundled OTF/TTF files served from `content/fonts`, so screenshots do not depend on system fonts.
