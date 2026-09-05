# KITA TABUNG V11 — Upgrade Report

## 1. Executive summary

V11 mengubah KITA TABUNG dari aplikasi satu-file yang langsung menampilkan auth/dashboard menjadi struktur produk publik + aplikasi terautentikasi. Fitur keuangan lama dipertahankan. Upgrade difokuskan pada trust, onboarding, konsistensi bahasa, aksesibilitas, mobile usability, performance boundary, PWA caching, dan hardening API.

Tidak ada perubahan schema database production pada upgrade ini.

## 2. Architecture discovered

### Baseline V10

- Static web app untuk Vercel.
- Seluruh dashboard/auth berada di satu `index.html` sekitar 395 KB raw.
- Library browser melalui CDN: Supabase JS, Chart.js, jsPDF, Font Awesome, Google Fonts.
- Supabase Auth untuk login/OTP/recovery.
- Finance state disimpan sebagai JSON pada `public.user_finance_state` dan cache lokal per user.
- RLS SQL membatasi CRUD berdasarkan `auth.uid() = user_id`.
- Vercel Functions: `/api/chat` dan `/api/receipt-scan`.
- PWA: manifest + service worker.
- Tidak ada package manager, build system, lint config, atau test framework pada paket baseline.

### Security-sensitive areas

- Client-side Supabase session.
- Finance state cloud + local cache.
- Restore file JSON.
- Receipt image upload.
- AI finance context.
- Service-worker cache.
- Auth OTP/recovery.

## 3. Features implemented by phase

### Phase 1 — Discovery and characterization

- Source architecture inspected before patching.
- Added tests against the actual financial functions extracted from `app.html`.
- Characterized budget period, rollover, overspending carry floor, expense/income/transfer balance round-trip.

### Phase 2 — Public product experience

- New lightweight `index.html` landing page.
- Authenticated app moved to `app.html`.
- Landing explains product, real capabilities, core workflow, privacy summary, and CTA.
- Product preview uses masked values rather than fake balances/transactions.
- Root route detects auth query/hash fallback and forwards it to `app.html`.

### Phase 3 — Trust/legal/auth clarity

- Added `privacy.html`, `terms.html`, `help.html`, `data-delete.html`.
- Legal pages explicitly marked as draft where owner/business decisions are missing.
- App Settings links to trust/help pages.
- Auth error copy made more generic to reduce email-account enumeration risk.
- Registration shows password guidance before submission.
- Auth redirect fallback now targets `/app.html`.

### Phase 4 — Guided onboarding and empty states

- Dismissible onboarding checklist:
  1. configure first wallet;
  2. create first budget;
  3. record first transaction;
  4. create saving target;
  5. review dashboard.
- Progress persists in the existing JSON state without DB schema migration.
- Budget, history, recurring bills, and target empty states now explain purpose + next action.

### Phase 5 — Design language and mobile consistency

- Sidebar nav converted from clickable `div` to semantic `button` elements.
- Indonesian terminology cleaned up (`Beranda`, `Pengaturan`, `Ringkasan Mingguan`, `Arus Kas & Pengeluaran`, neutral user fallback).
- Added minimum touch-target sizing, safe-area spacing, modal internal scrolling, reduced-motion support.
- Responsive checks completed at 320, 360, 390, 768, 1024, and 1280 px with zero horizontal overflow in browser rendering tests.

### Phase 6 — Accessibility

- Global visible `:focus-visible` state.
- Dialog role/label enhancement.
- Focus moves into opened dialogs and is restored when dialogs close.
- Tab focus is trapped inside the active modal.
- Runtime association of form labels to controls.
- Accessible names for navigation/icon actions and dynamically rendered edit/delete controls.
- Async app messages announced through live regions.
- Expense chart gets an accessible text description and retains text breakdown.
- `prefers-reduced-motion` honored.

### Phase 7 — Performance/PWA boundary

- Public landing no longer loads Chart.js, Supabase JS, jsPDF, or dashboard JS.
- Public initial raw HTML+CSS reduced from about 395 KB monolith to about 14 KB.
- Gzip comparison in local measurement: V10 monolith ~89.5 KB vs V11 public HTML+CSS ~4.6 KB.
- Service worker does not cache `/api/*` responses.
- Navigation uses network-first behavior to reduce stale app-shell risk after deploy.
- PWA start URL changed to `app.html`.

### Phase 8 — Security hardening

- Added Vercel headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, clickjacking protection, Permissions Policy.
- Private AI/receipt POST APIs reject foreign browser origins.
- Request-size checks added.
- POST `/api/chat` and `/api/receipt-scan` now require an active Supabase access token and validate it against Supabase Auth before processing.
- PIN failures use a separate 403 path rather than being confused with auth-session failures.
- Existing receipt file validation and backup-size/schema validation preserved.
- Source RLS policy test verifies authenticated-only per-user CRUD rules are present in the supplied SQL.

## 4. Files changed/added

Major files:

- `index.html` — new public landing.
- `app.html` — preserved V10 application + V11 patches.
- `assets/public.css` — public/legal styles.
- `privacy.html`
- `terms.html`
- `help.html`
- `data-delete.html`
- `api/chat.js`
- `api/receipt-scan.js`
- `sw.js`
- `manifest.webmanifest`
- `vercel.json`
- `supabase-setup.sql` — copied as current reference; no new migration.
- `tests/financial-characterization.mjs`
- `tests/product-integrity.mjs`
- `tests/api-auth.mjs`
- `tests/rls-policy.mjs`

## 5. Screenshot evidence

Stored in `evidence/`:

- `before-v10-dashboard-360.png`
- `before-v10-dashboard-1280.png`
- `landing-360.png`
- `landing-1280.png`
- `app-static-360.png`
- `app-static-1280.png`
- `dashboard-onboarding-360.png`
- `dashboard-onboarding-1280.png`

Browser rendering used installed Chromium. Network/local navigation is blocked by the execution environment, so application pages were rendered with local assets and controlled library stubs. This is real browser layout evidence, but **not a substitute for production-domain E2E testing**.

## 6. Commands executed and actual results

- Inline frontend JS syntax: `node --check` → PASS.
- `api/chat.js`: `node --check` → PASS.
- `api/receipt-scan.js`: `node --check` → PASS.
- `sw.js`: `node --check` → PASS.
- `vercel.json`: JSON parse → PASS.
- `manifest.webmanifest`: JSON parse → PASS.
- Duplicate HTML IDs → 0.
- `node tests/financial-characterization.mjs` → PASS.
- `node tests/product-integrity.mjs` → PASS.
- `node tests/api-auth.mjs` → PASS.
- `node tests/rls-policy.mjs` → PASS.
- Chromium responsive render checks at 320/360/390/768/1024/1280 → zero horizontal overflow for public landing and static app rendering.

## 7. Performance measurements

Raw local file measurement:

- V10 public/auth/dashboard monolith: ~395,092 bytes raw; ~89,526 bytes gzip.
- V11 public landing HTML + CSS: 14,228 bytes raw; 4,819 bytes gzip.
- Approximate raw public-entry reduction: ~96.5%.
- Authenticated `app.html`: 412,065 bytes raw; it is intentionally no longer part of the public initial route.

Real network Core Web Vitals/Lighthouse were not measured because the sandbox cannot navigate to localhost or the public domain. Do not interpret the file-size result as a production Lighthouse score.

## 8. Accessibility results

Verified in static browser render:

- no horizontal overflow at required target widths;
- login modal fits mobile viewport and scrolls internally;
- form controls receive runtime accessible labels;
- nav controls are semantic buttons;
- modal focus trap/focus restoration code is present and syntax-valid;
- reduced motion CSS is present;
- chart has a text equivalent/breakdown.

A production run with axe/Lighthouse and a full keyboard walkthrough is still required before claiming WCAG 2.2 AA conformance.

## 9. Security changes and remaining limitations

Improved:

- same-origin API boundary;
- Supabase session validation on private AI endpoints;
- request-size checks;
- security headers;
- PWA no-cache boundary for APIs;
- existing RLS source policy preserved.

Remaining limitations:

- Live cross-account RLS rejection was not tested against production Supabase credentials in this environment.
- `app.html` is still a large monolith with inline CSS/JS and CSP therefore still requires `'unsafe-inline'`.
- Public Supabase publishable credentials remain in client/server source by design; no service-role secret is included.
- Self-service deletion of the Supabase Auth user is not implemented yet.
- No dedicated server-side rate-limit store is included; provider-level/platform-level rate limiting should be configured before broad public traffic.
- Legal copy is draft, not owner-approved policy.

## 10. Deployment and rollback

See `README-V11.md`.

There is no DB migration. Rollback is a Vercel deployment rollback/promote to the prior V10 build. V11's extra `onboarding` JSON property is safe for older builds to ignore.

## 11. Owner decisions still required

1. Approve/finalize Privacy Policy and Terms.
2. Choose official support/contact channel.
3. Define account-deletion SLA and implement self-service deletion or admin workflow.
4. Decide whether AI/receipt PINs remain necessary now that POST routes require Supabase login.
5. Decide whether to start V12 refactor: split `app.html` into modules/components and remove CSP `'unsafe-inline'`.
6. Perform production-domain E2E, accessibility audit, and live two-account RLS test before declaring production-ready.
