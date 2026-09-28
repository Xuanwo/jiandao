# AGENTS.md

## Design First

`design/` is the source of truth for everything a reader sees or does: the
popup, the in-page translation UI, the settings page, and the agent setup flow
including the setup document. It mirrors the design canvas at
https://claude.ai/artifact/NEQ1EikX7usWo1ZrxhRqoV. Each `.dc.html` file is one
artboard; `canvas.json` holds the canvas layout and titles. The canvas stores
the same files under `project/`.

- Every change lands in `design/` first, then the implementation is changed to
  match it. This covers layout, states, copy, interaction flow and the setup
  document. Changes with no visible effect, such as internal refactors, tests,
  CI or dependencies, need no design change but must not make the
  implementation diverge from the design.
- Update the canvas and `design/` together, so both show the same version. The
  design change goes in the same pull request as the implementation, in an
  earlier commit.
- Draw real states with the real copy. Text in an artboard matches
  `src/locales/zh-CN.yml` after implementation; a new state gets its own
  artboard instead of a note.
- When the implementation and the design disagree, the design wins: change the
  implementation, or, if the design is wrong, change the design first.

## Testing Notes

- Run the local test suite with `pnpm test`.
