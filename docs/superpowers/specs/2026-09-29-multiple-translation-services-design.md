# Multiple translation services

## Purpose

Readers can save several named translation service configurations and select one in settings or the extension popup. Configurations can share a provider type and endpoint, with different keys, models, or request settings.

## Configuration contract

Keep the existing `providersConfig` collection and `translate.providerId` selection. Preserve stored IDs, credentials, and the active selection on upgrade. The stored schema and setup document fields remain unchanged.

The settings action determines the target:

- Add creates a new ID, even when another entry has the same provider type and endpoint.
- Edit addresses one stored ID. An unknown or deleted target produces an error; it never becomes an add operation.
- Preview, export, copied agent instructions, and save use the same target.
- Add requires a literal API key. It cannot reuse a masked key from another entry.
- Edit may retain its target's key when the document omits or masks the key. Key reuse requires an unchanged provider type and resolved endpoint. A changed destination requires a literal key.
- Preserve the existing unique-name allocation behavior. Preview must show the name that save will use, including any suffix needed for uniqueness.

The document continues to describe one service. Internal IDs are not part of the agent-facing JSON contract.

## Settings behavior

Show saved services with their names, models, destination hosts, connection status, and a current-service marker. Preserve masked credential display.

Provide Add service and per-entry Select, Test, Edit, and Delete actions. Edit uses the existing JSON editor. Readers can change the `name` field to rename a service; this uses the same connection check as other edits.

Add opens an empty editor. Edit opens the selected entry's masked document. Preview identifies whether the operation adds a service or changes the selected entry.

Save checks the proposed connection first. A failed check saves nothing and leaves the editor available with an error. A successful check saves that entry and its check result. Neither add nor edit changes the active selection.

For a fresh installation, open the editor for the sole active, keyless default entry. Saving configures that entry in place and retains its ID, even if the document specifies another provider type. Translation is then available without a separate selection step.

Delete requires confirmation. Refuse deletion of the active service or the final entry. Readers must select another service before they delete the active one. Validate these constraints when the operation executes, not only when buttons render.

Only enabled configurations with a nonempty key can be selected. A stored failed connection check does not permanently prevent selection: the endpoint may have recovered. Unconfigured entries remain editable.

## Popup and page behavior

Use the footer for a labeled, keyboard-accessible service selector when another configured service is available. Options identify services by name and model. Retain the existing compact status for a single service and the setup guidance for an unconfigured current service. The selector must remain available if a configured alternative exists while the current entry lacks a key.

Selection changes only `translate.providerId`. It sends no connection-test request, does not toggle page translation, and does not restart translation.

Existing translated content remains visible. Requests already dispatched retain their provider snapshots. Subsequent translation operations read the selected provider. A page can therefore contain results from more than one service until the reader explicitly translates it again.

Do not change display-mode restart behavior, queue cancellation, cache policy, or provider adapters for this feature.

## Save consistency and errors

Connection checks are asynchronous. Build and test a candidate for the explicit editor target. Before save, read the latest configuration and merge only the checked entry into it. Do not persist the old collection or translation settings captured before the check.

If the target was deleted or its service configuration changed during the check, refuse the stale save and ask the reader to reopen the editor. Connection-status metadata alone does not constitute a conflicting service edit. Preserve unrelated additions, edits, and the latest active selection.

A storage error must leave an actionable error state. Do not report a successful save before persistence succeeds. Avoid printing credentials in errors or adding them to logs.

Use the existing storage synchronization mechanism. This feature does not promise atomic transactions across simultaneous extension contexts.

## Design and documentation

`design/` remains the source of truth for visible behavior. Update affected existing boards and register new self-contained HTML boards in `design/canvas.js`.

Draw actual states for the service list, add, edit, pending save, failed check, deletion confirmation, protected active deletion, initial setup, and popup selection. Artboard copy must match `src/locales/zh-CN.yml` after implementation. Keep all locale keys aligned.

Update the agent setup flow in `design/` before changing its implementation or guide. Copied instructions must refer to the entry under edit, or to a new service for Add. Explain that adding saves without selection and that masked keys belong to the selected edit target.

Commit the visible design changes before the implementation changes, in the same pull request.

## Implementation boundaries

Primary production sites:

- `src/utils/setup-document.ts`: explicit operation target, key reuse, preview, and export.
- `src/entrypoints/options/sections/service/index.tsx`: list, editor target, save, selection, and deletion.
- `src/entrypoints/popup/components/popup-footer.tsx`: service selector.
- `src/utils/setup-agent-instructions.ts`: target-specific agent handoff.
- `src/utils/config/helpers.ts`: shared selection or deletion validation where real callers require it.
- `src/locales/`: visible labels and errors.
- `docs/agent-setup.md`: setup procedure.

Update dependent callers and tests. Do not add provider routing, failover, simultaneous translation, a new settings form, or a new storage schema.

## Acceptance and verification

Write behavior tests with descriptions that start with `user` and use Given / When / Then. Prefer the browser E2E path for user workflows. Use isolated fake service endpoints where external APIs are needed; do not add mocks. Load `test-audit` before authoring or reviewing tests.

Required scenarios:

- Save two configurations with the same type and endpoint but different keys or models; both remain independent after reload.
- Add a configuration without changing the active service.
- Edit or rename an inactive entry without changing the active service or another entry.
- Preview and agent export address the selected editor target rather than the active service.
- Reject masked-key reuse during Add and across a changed provider destination.
- Preserve the existing configuration after a failed connection check.
- Configure the first-install default entry and make translation available.
- Select a service from settings and from the popup; persist the choice across reloads.
- Keep existing page output and dispatched requests unchanged across selection; use the new service for subsequent requests.
- Confirm deletion of an inactive service; refuse active or final-entry deletion.
- Preserve a popup selection made while a settings connection check is pending.
- Reject a stale edit whose target changed or disappeared during the check.
- Surface storage failures without a false success state.

Run `pnpm test`, lint, type-check, build, and the built-extension E2E suite. Use the project's coverage configuration and inspect coverage for changed behavior. Review the complete diff and run `/code-review medium` and `/simplify`; repair verified findings and rerun affected checks. The user must invoke `/thermos`, because that skill does not allow model invocation.

## Delivery

Use signed Conventional Commits with `32576256+IceCodeNew@users.noreply.github.com` as the author email. Inspect staged content for secrets before every commit. Keep temporary reports outside the repository.

Create or reuse the user's fork and open a draft pull request against `Xuanwo/jiandao:main`. Include the earlier design commit and the implementation. Report local checks and remote checks separately, with results tied to the final candidate commit. Do not merge the pull request.
