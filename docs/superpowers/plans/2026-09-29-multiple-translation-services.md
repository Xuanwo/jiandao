# Multiple Translation Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let readers save independent translation configurations and manually select one in settings or the popup.

**Architecture:** Retain `providersConfig[]` and `translate.providerId`. Pass an explicit add/edit target through document preview, export, and save. Preserve current selection during saves and retain existing page output during switches.

**Tech Stack:** TypeScript, React, Jotai, Zod, WXT, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-29-multiple-translation-services-design.md`

## Global Constraints

- Commit the visible design changes before the implementation changes, in the same pull request.
- The stored schema and setup document fields remain unchanged.
- Neither add nor edit changes the active selection.
- Delete requires confirmation. Refuse deletion of the active service or the final entry.
- Use signed Conventional Commits with `32576256+IceCodeNew@users.noreply.github.com` as the author email.
- Use `gh` with GitHub's commit API for server-signed commits; verify the returned commit identity and signature before accepting it.
- Keep temporary reports outside the repository.
- Load `test-audit` before authoring or reviewing tests. Do not add mocks.
- Use the existing worktree. Do not modify unrelated files or merge the pull request.

## Review Focus

- A masked key pasted into Add must not borrow a secret from an existing matching endpoint (Task 2).
- A changed edit destination must not receive an implicitly reused secret (Task 2).
- A popup switch during a pending connection check must survive the save (Task 3).
- A deleted or modified editor target must not reappear through a late save (Task 3).
- A keyless current service must not hide a configured alternative in the popup (Task 4).

## File responsibilities

- `design/*.html`, `design/canvas.js`: visible states and flow.
- `src/utils/setup-document.ts`: explicit-target document conversion and preview.
- `src/utils/setup-agent-instructions.ts`: target-specific agent export.
- `src/entrypoints/options/sections/service/index.tsx`: list, editor state, checks, and persistence.
- `src/utils/config/helpers.ts`: small shared configuration operations if both surfaces need them.
- `src/entrypoints/popup/components/popup-footer.tsx`: active-service chooser.
- `src/locales/*.yml`: matching localized labels and errors.
- `docs/agent-setup.md`: agent setup procedure.
- Existing utility tests: pure document and configuration contracts.
- `scripts/e2e/multiple-services.e2e.mjs`: new browser acceptance scenarios.
- `scripts/e2e/fake-service.mjs`: deterministic local API responses and request capture.

## Task 1: Design states and signed design commit

**Files:** Modify affected service/settings/popup boards and `design/canvas.js`; create separate boards for new states.

**Interfaces:** Produces visible labels and states used by Tasks 3 and 4. No production API changes.

- [ ] Load `design`, `ux-writing`, and Chinese technical-writing guidance before changing visible content.
- [ ] Draw list rows with name/model, host, check status, current marker, and action buttons. Use the labels 「新增服务」「当前使用」「选用」「编辑」「删除」.
- [ ] Draw Add and Edit with the existing JSON editor and connection-check preview. Add copy: 「保存后不会切换当前服务」. Show disabled pending actions and failure with no save.
- [ ] Draw initial setup editing the active placeholder. Draw deletion confirmation and the reason current-service deletion is unavailable.
- [ ] Draw the popup selector with two services and its open state. Preserve footer toggles and settings access.
- [ ] Update affected existing boards, agent flow, and canvas registration. Keep boards self-contained with no external requests.
- [ ] Inspect designs in a browser at their declared sizes; compare labels and focus/selection states with the planned implementation.
- [ ] Inspect the complete design diff and staged content for secrets. Create or reuse `IceCodeNew/jiandao`, create a task branch from the current upstream base, and use `gh api graphql` with `createCommitOnBranch` to commit the spec, plan, and design files.
- [ ] Fetch the returned commit and verify `commit.verification.verified` and author identity through `gh api`. Align local history only after confirming the remote tree matches the intended local files; do not discard worktree content.

Commit subject: `design: define multiple translation service states`.

## Task 2: Explicit document identity

**Files:** Modify `src/utils/setup-document.ts`, `src/utils/setup-agent-instructions.ts`, their tests, and dependent callers.

**Interfaces:** Define the shared target in `setup-document.ts`:

```ts
export type SetupTarget =
  | { kind: "add" }
  | { kind: "edit", providerId: string }
```

Use `applySetupDocument(config, document, target)` and `describeSetupDocument(config, document, target)`. Keep their existing result types. Use `exportSetupDocument(config, providerId)` for exact-target export and `buildAgentInstructions(config, target)` for instructions.

- [ ] Load `test-audit` and `reclaim-code-entropy`. Inspect existing test fixtures and real consumers before removing endpoint matching.
- [ ] Add pure contract tests for independent same-endpoint Add, exact-ID Edit, unchanged selection, unknown ID, unique names, and target-specific export. Follow this assertion shape with existing valid config fixtures:

```ts
const result = applySetupDocument(config, document, { kind: "add" })
expect(result.config.providersConfig).toHaveLength(config.providersConfig.length + 1)
expect(result.config.translate.providerId).toBe(config.translate.providerId)
expect(result.config.providersConfig.slice(0, -1)).toEqual(config.providersConfig)
```

- [ ] Add rejection scenarios for Add with a masked key and Edit with a changed endpoint or provider plus a masked/omitted key. Assert that the input config remains unchanged.
- [ ] Run `pnpm exec vitest run src/utils/__tests__/setup-document.test.ts` and record the expected failure before implementation.
- [ ] Replace endpoint-derived identity with the explicit target. Add allocates a new ID. Edit resolves its exact ID or throws a typed setup error. Preserve `translate` unchanged.
- [ ] Reuse a stored key only for Edit with unchanged type and resolved endpoint. Require a literal key otherwise. Reuse the existing unique-name behavior and show the final name in preview.
- [ ] Update export, agent instructions, and callers together. Remove `findMatchingProvider` only after confirming no consumers remain.
- [ ] Run focused tests and schema-sync tests. The setup JSON schema must retain its field contract.

## Task 3: Settings lifecycle and safe saves

**Files:** Modify service section, localized strings, agent guide; create `scripts/e2e/multiple-services.e2e.mjs` and extend the existing local fake API only as needed.

**Interfaces:** Consumes `SetupTarget` and Task 2 helpers. Editor state is `SetupTarget | null`. Saved provider collections do not include a `translate` patch.

- [ ] Add E2E scenarios using `launchBrowser`, `configureService`, `storedConfig`, and `startFakeService`. Configure service A, add B with the same endpoint and another key/model, then reload and assert both persist and A stays active.
- [ ] Cover inactive editing and rename, target-specific agent instructions, failed connection checks, initial setup, delete confirmation, and refusal to delete the active entry. Use actual UI actions and inspect stored state and fake API requests.
- [ ] Run `pnpm test:e2e` and confirm new acceptance tests fail because the actions do not yet exist.
- [ ] Render a service list with per-entry actions. Add opens an empty editor; Edit passes its entry ID. Open the sole keyless current entry automatically on first setup.
- [ ] Export, unchanged detection, preview, and copied instructions must all use the editor target. Use the existing confirmation component for Delete.
- [ ] Implement save with a checked candidate and a fresh configuration read after the check. Compare the original target's service fields with the latest target, excluding connection-check metadata. Reject missing or changed targets.
- [ ] Persist the checked entry into the latest collection and preserve unrelated entries. Never persist the pre-check `translate` section. Surface persistence failures in the editor.
- [ ] Add controlled fake-response gates, not sleeps, to test a pending check alongside a popup switch and a target edit/deletion. Release the response and verify preserved selection or a stale-save error.
- [ ] Implement settings selection with a minimal nested patch:

```ts
await setConfig({ translate: { providerId: selectedId } })
```

Use the existing field atom if the whole-config patch type requires other translate fields. Validate that the target exists, is enabled, and has a nonempty key.

- [ ] Keep delete guards at execution time. Filter only the requested inactive ID from the latest list.
- [ ] Match `zh-CN.yml` to boards and update every locale. Update the agent guide to describe Add, exact-entry Edit, Save, and manual selection.
- [ ] Run focused browser tests, utility tests, locale parity, and type-check. Fix behavior failures without weakening assertions.

## Task 4: Popup selection and translation continuity

**Files:** Modify popup footer and E2E acceptance coverage; preserve the host config-change handler.

**Interfaces:** Consumes existing config atom and selected provider ID. Selection must not invoke page translation controls.

- [ ] Add an E2E scenario that selects B in the popup and verifies persisted selection, settings synchronization, and selection after reload.
- [ ] Cover a keyless active entry with a configured alternative, disabled entries, long service names, and keyboard selection.
- [ ] Add a page scenario that translates one visible section with A, switches to B, and requests another section. Assert that the first output stays and the later request uses B.
- [ ] Hold one fake response across a switch; release it and assert that its output uses its original request and remains visible.
- [ ] Run new scenarios to verify the missing popup selector causes failure.
- [ ] Implement the designed labeled selector with names/models and the current marker. Keep the existing status-only footer when there is no alternative.
- [ ] Persist only the chosen ID; send no connection check and no restart/toggle message.
- [ ] Run all popup and page E2E tests. Preserve existing display-mode restart tests.

## Task 5: Verification, audit, and upstream delivery

**Files:** Review all changed files and affected test/workflow surfaces. Only repair demonstrated failures.

- [ ] Run `pnpm lint`, `pnpm type-check`, `pnpm build`, `pnpm test`, and `pnpm test:e2e:built`. Install the project's declared Chromium runtime if absent. Keep screenshots and logs outside the repository.
- [ ] Run `pnpm exec vitest run --coverage` with the existing Istanbul configuration. Review uncovered changed behavior and add meaningful regression scenarios where needed.
- [ ] Run `/code-review medium` and `/simplify`; verify findings, fix defects, and rerun relevant checks. Run ripwire change-check and quality-bar against the actual diff.
- [ ] Apply scoped ablation checks to any proposed redundancy removal. Do not delete existing behavior or tests merely because static references are absent.
- [ ] Ask the user to invoke `/thermos`; the skill prohibits model invocation. Record this gate as pending until its actual output is available.
- [ ] Manually inspect the whole diff, copy/design agreement, schema compatibility, and staged secret exposure. Create the implementation commit through `gh` with the required attribution and verify its signature and author.
- [ ] Reconcile the local tree with the exact server-created commit and rerun final checks on that candidate. Do not claim older results validate a changed candidate.
- [ ] Inspect the repository PR template and create a draft upstream PR with `gh pr create`, using the fork branch and `Xuanwo/jiandao:main`.
- [ ] Inspect remote CI checks, resolve actionable failures, and rerun gates for each changed candidate. Report approval-required, skipped, or unavailable checks accurately.
- [ ] Report the PR URL, commit identity/signature verification, local and remote test results, and any pending user-run audit. Do not merge.

All commit messages end with:

```text
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

The PR description ends with:

```text
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
