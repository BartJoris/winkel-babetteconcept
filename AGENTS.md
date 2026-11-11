<!-- BEGIN:feature-harness -->

## Feature harness

Nieuwe features volgen de seven-layer harness in `/Users/bajoris/git/agent-harness/HARNESS.md`.

- Run artifacts: `.agent/harness/runs/<slug>/{plan.md,checks.md,progress.md}`
- Templates: `.agent/harness/templates/`
- Trigger in Cursor: `feature-harness` of “nieuwe feature”
- GSD (`gsd-*`) blijft voor milestones en roadmaps. Deze harness is voor feature-werk.
- Duurzame regels uit fouten horen in dit bestand, niet in een run-map.

Hooks en scripts (format, lint, typecheck, tests) hebben voorrang op instructietekst. Lijst ze hier als ze bestaan:

- `npx tsc --noEmit` — typecheck
- `npm run lint` — eslint
- `npm run build` — production build

## Koksijdebon / Otzy

- Handelaarsportal: `https://merchant.otzy.eu` (niet `.ey`)
- Softkey-URL hoort in server env `OTZY_SOFTKEY_URL` (inhoud Softkey-QR). Optioneel `OTZY_MERCHANT_URL`.
- Softkey-endpoints (`/api/otzy-softkey`, `/api/otzy-softkey-qr`) alleen voor ingelogde winkel-sessies.
- Geen eigen redeem-API: innen gebeurt in Otzy/Cirklo via Softkey of merchant login.

<!-- END:feature-harness -->
