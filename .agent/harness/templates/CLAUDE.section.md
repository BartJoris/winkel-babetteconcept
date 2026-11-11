<!-- BEGIN:feature-harness -->

## Feature harness

Nieuwe features volgen de seven-layer harness in `/Users/bajoris/git/agent-harness/HARNESS.md`.

- Run artifacts: `.agent/harness/runs/<slug>/{plan.md,checks.md,progress.md}`
- Templates: `.agent/harness/templates/`
- Trigger in Cursor: `feature-harness` of “nieuwe feature”
- GSD (`gsd-*`) blijft voor milestones en roadmaps. Deze harness is voor feature-werk.
- Duurzame regels uit fouten horen in dit bestand, niet in een run-map.

Hooks en scripts (format, lint, typecheck, tests) hebben voorrang op instructietekst. Lijst ze hier als ze bestaan:

- (project hooks — vul aan)

<!-- END:feature-harness -->
