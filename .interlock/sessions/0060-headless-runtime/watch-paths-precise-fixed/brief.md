---
interlock: brief@v1
graph: 0060-headless-runtime
node: watch-paths-precise-fixed
role: implementer
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: lint
    kind: command
    run: pnpm lint
  - id: comments
    kind: command
    run: pnpm check:comments
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: scope-guard-owner-only
    kind: command
    run: pnpm --fail-if-no-match --filter runner exec vitest run
      test/scopeGuard.test.ts test/absorbOutbox.test.ts --passWithNoTests=false
    expect_output: Tests +[1-9][0-9]* passed
  - id: runner-suite
    kind: command
    run: pnpm --fail-if-no-match --filter runner exec vitest run
      --passWithNoTests=false
    expect_output: Tests +[1-9][0-9]* passed
  - id: cli-suite
    kind: command
    run: pnpm --fail-if-no-match --filter cli exec vitest run
      --passWithNoTests=false
    expect_output: Tests +[1-9][0-9]* passed
  - id: wppf-types
    kind: command
    run: pnpm typecheck
scope:
  - .gitignore
  - .interlock/arcs.yaml
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
  - .interlock/graphs/0003-translator.yaml
  - .interlock/graphs/0004-readable-refusals.yaml
  - .interlock/graphs/0005-gate-output-way-back.yaml
  - .interlock/graphs/0006-repository-context.yaml
  - .interlock/graphs/0007-absorb-outbox.yaml
  - .interlock/graphs/0008-learning-witness.yaml
  - .interlock/graphs/0009-delivery-boundary-proof.yaml
  - .interlock/graphs/0010-learning-transfer.yaml
  - .interlock/graphs/0011-concise-opening.yaml
  - .interlock/graphs/0012-delivery-read.yaml
  - .interlock/graphs/0013-scoped-review-transfer.yaml
  - .interlock/graphs/0014-qualified-citations.yaml
  - .interlock/graphs/0015-hypothesis-context.yaml
  - .interlock/graphs/0018-learning-comparison-read.yaml
  - .interlock/graphs/0019-next-briefing-strategy.yaml
  - .interlock/graphs/0020-learning-applicability.yaml
  - .interlock/graphs/0021-current-debrief.yaml
  - .interlock/graphs/0022-context-delivery.yaml
  - .interlock/graphs/0023-debrief-validation.yaml
  - .interlock/graphs/0024-debrief-content.yaml
  - .interlock/graphs/0025-stable-examples.yaml
  - .interlock/graphs/0026-session-start-recovery.yaml
  - .interlock/graphs/0028-current-handoff.yaml
  - .interlock/graphs/0029-planning-context.yaml
  - .interlock/graphs/0031-repair-planning-context.yaml
  - .interlock/graphs/0032-derived-handoff.yaml
  - .interlock/graphs/0033-handoff-format.yaml
  - .interlock/graphs/0034-lesson-applicability.yaml
  - .interlock/graphs/0035-review-grace.yaml
  - .interlock/graphs/0036-handoff-preview.yaml
  - .interlock/graphs/0037-learning-exchange-read.yaml
  - .interlock/graphs/0038-partial-learning-proof.yaml
  - .interlock/graphs/0039-authoring-feedback.yaml
  - .interlock/graphs/0040-explicit-citation-boundary.yaml
  - .interlock/graphs/0041-citation-type-repair.yaml
  - .interlock/graphs/0043-any-runtime.yaml
  - .interlock/graphs/0044-runtime-coverage.yaml
  - .interlock/graphs/0046-loom-feed.yaml
  - .interlock/graphs/0047-worktree-commits.yaml
  - .interlock/graphs/0048-landed-tells-the-truth.yaml
  - .interlock/graphs/0049-worktree-gitdir.yaml
  - .interlock/graphs/0050-verifier-fixture-writer.yaml
  - .interlock/graphs/0051-no-detached-maintenance.yaml
  - .interlock/graphs/0052-count-tells-the-truth.yaml
  - .interlock/graphs/0053-graph-arc.yaml
  - .interlock/graphs/0054-provider-routing.yaml
  - .interlock/graphs/0055-runner-commits.yaml
  - .interlock/graphs/0056-machine-provider.yaml
  - .interlock/graphs/0058-cited-delegation.yaml
  - .interlock/graphs/0059-submodule-receipts-2.yaml
  - .interlock/graphs/0059-submodule-receipts.yaml
  - .interlock/graphs/0060-headless-runtime.yaml
  - .interlock/graphs/0061-delegation-fails-closed.yaml
  - .interlock/graphs/0062-same-access.yaml
  - .interlock/graphs/readme-interlock-concept.yaml
  - .interlock/local.example.yaml
  - .interlock/queue.yaml
  - .interlock/sessions/0001-bootstrap/attempts/brief.md
  - .interlock/sessions/0001-bootstrap/attempts/debrief.yaml
  - .interlock/sessions/0001-bootstrap/attempts/notes.yaml
  - .interlock/sessions/0001-bootstrap/debrief-schema/brief.md
  - .interlock/sessions/0001-bootstrap/debrief-schema/debrief.yaml
  - .interlock/sessions/0001-bootstrap/debrief-schema/notes.yaml
  - .interlock/sessions/0001-bootstrap/face-read/brief.md
  - .interlock/sessions/0001-bootstrap/face-read/debrief.yaml
  - .interlock/sessions/0001-bootstrap/face-read/notes.yaml
  - .interlock/sessions/0001-bootstrap/face/brief.md
  - .interlock/sessions/0001-bootstrap/face/debrief.yaml
  - .interlock/sessions/0001-bootstrap/face/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/brief.md
  - .interlock/sessions/0001-bootstrap/ledger-gaps/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger/brief.md
  - .interlock/sessions/0001-bootstrap/ledger/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger/notes.yaml
  - .interlock/sessions/0001-bootstrap/position-model/brief.md
  - .interlock/sessions/0001-bootstrap/position-model/debrief.yaml
  - .interlock/sessions/0001-bootstrap/position-model/notes.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/brief.md
  - .interlock/sessions/0001-bootstrap/runner-command-gate/debrief.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/notes.yaml
  - .interlock/sessions/0001-bootstrap/scaffold/brief.md
  - .interlock/sessions/0001-bootstrap/scaffold/debrief.yaml
  - .interlock/sessions/0001-bootstrap/self-run/brief.md
  - .interlock/sessions/0001-bootstrap/self-run/debrief.yaml
  - .interlock/sessions/0001-bootstrap/self-run/notes.yaml
  - .interlock/sessions/0001-bootstrap/verbs/brief.md
  - .interlock/sessions/0001-bootstrap/verbs/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verbs/notes.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/brief.md
  - .interlock/sessions/0001-bootstrap/verifier-hunks/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/notes.yaml
  - .interlock/sessions/0002-shapes/brief-shape/brief.md
  - .interlock/sessions/0002-shapes/brief-shape/debrief.yaml
  - .interlock/sessions/0002-shapes/brief-shape/notes.yaml
  - .interlock/sessions/0002-shapes/schemas/brief.md
  - .interlock/sessions/0002-shapes/schemas/debrief.yaml
  - .interlock/sessions/0002-shapes/schemas/notes.yaml
  - .interlock/sessions/0002-shapes/shapes-reference/brief.md
  - .interlock/sessions/0002-shapes/shapes-reference/debrief.yaml
  - .interlock/sessions/0002-shapes/shapes-reference/notes.yaml
  - .interlock/sessions/0002-shapes/substrate-protocol/brief.md
  - .interlock/sessions/0002-shapes/substrate-protocol/debrief.yaml
  - .interlock/sessions/0002-shapes/substrate-protocol/notes.yaml
  - .interlock/sessions/0003-translator/evidence/brief.md
  - .interlock/sessions/0003-translator/evidence/debrief.yaml
  - .interlock/sessions/0003-translator/evidence/notes.yaml
  - .interlock/sessions/0003-translator/first-address/brief.md
  - .interlock/sessions/0003-translator/first-address/debrief.yaml
  - .interlock/sessions/0003-translator/first-address/notes.yaml
  - .interlock/sessions/0003-translator/interpreter/brief.md
  - .interlock/sessions/0003-translator/interpreter/debrief.yaml
  - .interlock/sessions/0003-translator/interpreter/notes.yaml
  - .interlock/sessions/0003-translator/substrate-client/brief.md
  - .interlock/sessions/0003-translator/substrate-client/debrief.yaml
  - .interlock/sessions/0003-translator/substrate-client/notes.yaml
  - .interlock/sessions/0004-readable-refusals/honest-http-refusals/brief.md
  - .interlock/sessions/0004-readable-refusals/honest-http-refusals/debrief.yaml
  - .interlock/sessions/0004-readable-refusals/honest-http-refusals/notes.yaml
  - .interlock/sessions/0005-gate-output-way-back/retain-gate-evidence/brief.md
  - .interlock/sessions/0005-gate-output-way-back/retain-gate-evidence/debrief.yaml
  - .interlock/sessions/0005-gate-output-way-back/retain-gate-evidence/notes.yaml
  - .interlock/sessions/0006-repository-context/send-repository-context/brief.md
  - .interlock/sessions/0006-repository-context/send-repository-context/debrief.yaml
  - .interlock/sessions/0006-repository-context/send-repository-context/notes.yaml
  - .interlock/sessions/0007-absorb-outbox/retain-absorb-intent/brief.md
  - .interlock/sessions/0007-absorb-outbox/retain-absorb-intent/debrief.yaml
  - .interlock/sessions/0007-absorb-outbox/retain-absorb-intent/notes.yaml
  - .interlock/sessions/0008-learning-witness/fresh-b/brief.md
  - .interlock/sessions/0008-learning-witness/prove-delivery/brief.md
  - .interlock/sessions/0008-learning-witness/prove-delivery/debrief.yaml
  - .interlock/sessions/0008-learning-witness/prove-delivery/notes.yaml
  - .interlock/sessions/0008-learning-witness/source-a/brief.md
  - .interlock/sessions/0009-delivery-boundary-proof/prove-dispatch-boundary/brief.md
  - .interlock/sessions/0009-delivery-boundary-proof/prove-dispatch-boundary/debrief.yaml
  - .interlock/sessions/0009-delivery-boundary-proof/prove-dispatch-boundary/notes.yaml
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/attempts/3e0d31a5-c545-45e3-b0d6-0116e5b9d81e/brief.md
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/attempts/3e0d31a5-c545-45e3-b0d6-0116e5b9d81e/debrief.yaml
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/attempts/3e0d31a5-c545-45e3-b0d6-0116e5b9d81e/notes.yaml
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/brief.md
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/debrief.yaml
  - .interlock/sessions/0009-delivery-boundary-proof/prove-storage-boundary/notes.yaml
  - .interlock/sessions/0010-learning-transfer/fresh-test-design/brief.md
  - .interlock/sessions/0010-learning-transfer/fresh-test-design/debrief.yaml
  - .interlock/sessions/0010-learning-transfer/fresh-test-design/notes.yaml
  - .interlock/sessions/0010-learning-transfer/source-diagnosis/brief.md
  - .interlock/sessions/0011-concise-opening/project-opening-view/brief.md
  - .interlock/sessions/0011-concise-opening/project-opening-view/debrief.yaml
  - .interlock/sessions/0011-concise-opening/project-opening-view/notes.yaml
  - .interlock/sessions/0012-delivery-read/read-session-delivery/brief.md
  - .interlock/sessions/0012-delivery-read/read-session-delivery/debrief.yaml
  - .interlock/sessions/0012-delivery-read/read-session-delivery/notes.yaml
  - .interlock/sessions/0013-scoped-review-transfer/fresh-scoped-review/brief.md
  - .interlock/sessions/0013-scoped-review-transfer/fresh-scoped-review/debrief.yaml
  - .interlock/sessions/0013-scoped-review-transfer/fresh-scoped-review/notes.yaml
  - .interlock/sessions/0013-scoped-review-transfer/select-context-paths/brief.md
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/attempts/2878e20d-a4ed-4394-af7f-6b7e1abfa295/brief.md
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/attempts/2878e20d-a4ed-4394-af7f-6b7e1abfa295/debrief.yaml
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/attempts/2878e20d-a4ed-4394-af7f-6b7e1abfa295/notes.yaml
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/brief.md
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/debrief.yaml
  - .interlock/sessions/0014-qualified-citations/qualify-explicit-location/notes.yaml
  - .interlock/sessions/0015-hypothesis-context/qualify-context-hypotheses/brief.md
  - .interlock/sessions/0015-hypothesis-context/qualify-context-hypotheses/debrief.yaml
  - .interlock/sessions/0015-hypothesis-context/qualify-context-hypotheses/notes.yaml
  - .interlock/sessions/0018-learning-comparison-read/read-comparable-outcomes/brief.md
  - .interlock/sessions/0018-learning-comparison-read/read-comparable-outcomes/debrief-revision-2.yaml
  - .interlock/sessions/0018-learning-comparison-read/read-comparable-outcomes/debrief.yaml
  - .interlock/sessions/0018-learning-comparison-read/read-comparable-outcomes/notes.yaml
  - .interlock/sessions/0018-learning-comparison-read/read-comparable-outcomes/revisions/debrief-1.yaml
  - .interlock/sessions/0019-next-briefing-strategy/propose-next-briefs/brief.md
  - .interlock/sessions/0019-next-briefing-strategy/propose-next-briefs/debrief.yaml
  - .interlock/sessions/0019-next-briefing-strategy/propose-next-briefs/notes.yaml
  - .interlock/sessions/0020-learning-applicability/separate-learning-applicability/brief.md
  - .interlock/sessions/0020-learning-applicability/separate-learning-applicability/debrief-revision-2.yaml
  - .interlock/sessions/0020-learning-applicability/separate-learning-applicability/debrief.yaml
  - .interlock/sessions/0020-learning-applicability/separate-learning-applicability/notes.yaml
  - .interlock/sessions/0020-learning-applicability/separate-learning-applicability/revisions/debrief-1.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/brief.md
  - .interlock/sessions/0021-current-debrief/select-current-debrief/debrief-revision-2.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/debrief-revision-3.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/debrief-revision-4.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/debrief.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/notes.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/revisions/26e720a7b2a066d6558f6c9d9ff5a4637a7547d46702254994230c1981e27bf5.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/revisions/bf979cf1575da05d70febdd445f222e6ebd02aa7d724141d6063fea696c3b52a.yaml
  - .interlock/sessions/0021-current-debrief/select-current-debrief/revisions/e5f67d8b469c9fe15d4eda9b1877f17ab0c5fa6c7a8180f0bb2ea466e404379f.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/brief.md
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/debrief-revision-1.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/debrief-revision-2.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/debrief.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/notes.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/revisions/81ee5f0dd6dc50a26cb3d6f620309fe5ec16b96a1a2c8e3f06e6860f5305d6d3.yaml
  - .interlock/sessions/0022-context-delivery/deliver-context-slice/revisions/bb05b6ca9e1302c30d8f8d8b8b51b63a90e099d21835505de2249f36a82aa89d.yaml
  - .interlock/sessions/0023-debrief-validation/validate-current-debrief/brief.md
  - .interlock/sessions/0023-debrief-validation/validate-current-debrief/debrief.yaml
  - .interlock/sessions/0023-debrief-validation/validate-current-debrief/notes.yaml
  - .interlock/sessions/0024-debrief-content/validate-debrief-content/brief.md
  - .interlock/sessions/0024-debrief-content/validate-debrief-content/debrief.yaml
  - .interlock/sessions/0024-debrief-content/validate-debrief-content/notes.yaml
  - .interlock/sessions/0025-stable-examples/stabilize-reference-examples/brief.md
  - .interlock/sessions/0025-stable-examples/stabilize-reference-examples/debrief-candidate.yaml
  - .interlock/sessions/0025-stable-examples/stabilize-reference-examples/debrief.yaml
  - .interlock/sessions/0025-stable-examples/stabilize-reference-examples/notes.yaml
  - .interlock/sessions/0025-stable-examples/stabilize-reference-examples/revisions/0fa7e6a1edeac5bee73d65310aadfe3fc0d87cb6eb274fc2a61490c5c27f98c5.yaml
  - .interlock/sessions/0026-session-start-recovery/recover-session-start/brief.md
  - .interlock/sessions/0026-session-start-recovery/recover-session-start/debrief.yaml
  - .interlock/sessions/0026-session-start-recovery/recover-session-start/notes.yaml
  - .interlock/sessions/0028-current-handoff/record-current-handoff/brief.md
  - .interlock/sessions/0028-current-handoff/record-current-handoff/debrief.yaml
  - .interlock/sessions/0028-current-handoff/record-current-handoff/notes.yaml
  - .interlock/sessions/0029-planning-context/select-planning-context/brief.md
  - .interlock/sessions/0029-planning-context/select-planning-context/debrief.yaml
  - .interlock/sessions/0029-planning-context/select-planning-context/notes.yaml
  - .interlock/sessions/0031-repair-planning-context/repair-planning-context/brief.md
  - .interlock/sessions/0031-repair-planning-context/repair-planning-context/debrief.yaml
  - .interlock/sessions/0031-repair-planning-context/repair-planning-context/notes.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/brief.md
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/debrief-candidate-2.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/debrief-candidate-3.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/debrief-candidate-4.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/debrief-candidate.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/debrief.yaml
  - .interlock/sessions/0032-derived-handoff/derive-debrief-handoff/notes.yaml
  - .interlock/sessions/0032-derived-handoff/plan/0032-derived-handoff/brief.md
  - .interlock/sessions/0032-derived-handoff/plan/0032-derived-handoff/debrief.yaml
  - .interlock/sessions/0032-derived-handoff/plan/0032-derived-handoff/notes.yaml
  - .interlock/sessions/0033-handoff-format/repair-handoff-format/brief.md
  - .interlock/sessions/0033-handoff-format/repair-handoff-format/debrief-candidate.yaml
  - .interlock/sessions/0033-handoff-format/repair-handoff-format/debrief.yaml
  - .interlock/sessions/0033-handoff-format/repair-handoff-format/notes.yaml
  - .interlock/sessions/0034-lesson-applicability/teach-lesson-applicability/brief.md
  - .interlock/sessions/0034-lesson-applicability/teach-lesson-applicability/debrief-candidate.yaml
  - .interlock/sessions/0034-lesson-applicability/teach-lesson-applicability/debrief.yaml
  - .interlock/sessions/0034-lesson-applicability/teach-lesson-applicability/notes.yaml
  - .interlock/sessions/0035-review-grace/plan/0035-review-grace/brief.md
  - .interlock/sessions/0035-review-grace/plan/0035-review-grace/debrief.yaml
  - .interlock/sessions/0035-review-grace/plan/0035-review-grace/notes.yaml
  - .interlock/sessions/0035-review-grace/restore-post-settle-grace/brief.md
  - .interlock/sessions/0035-review-grace/restore-post-settle-grace/debrief-candidate.yaml
  - .interlock/sessions/0035-review-grace/restore-post-settle-grace/debrief.yaml
  - .interlock/sessions/0035-review-grace/restore-post-settle-grace/notes.yaml
  - .interlock/sessions/0036-handoff-preview/preview-candidate-learning/brief.md
  - .interlock/sessions/0036-handoff-preview/preview-candidate-learning/debrief-candidate.yaml
  - .interlock/sessions/0036-handoff-preview/preview-candidate-learning/debrief.yaml
  - .interlock/sessions/0036-handoff-preview/preview-candidate-learning/notes.yaml
  - .interlock/sessions/0037-learning-exchange-read/make-honest-absorb-read/brief.md
  - .interlock/sessions/0037-learning-exchange-read/make-honest-absorb-read/debrief-candidate.yaml
  - .interlock/sessions/0037-learning-exchange-read/make-honest-absorb-read/debrief.yaml
  - .interlock/sessions/0037-learning-exchange-read/make-honest-absorb-read/notes.yaml
  - .interlock/sessions/0037-learning-exchange-read/plan/0037-learning-exchange-read/brief.md
  - .interlock/sessions/0037-learning-exchange-read/plan/0037-learning-exchange-read/debrief.yaml
  - .interlock/sessions/0037-learning-exchange-read/plan/0037-learning-exchange-read/notes.yaml
  - .interlock/sessions/0038-partial-learning-proof/prove-partial-learning/brief.md
  - .interlock/sessions/0038-partial-learning-proof/prove-partial-learning/debrief-candidate.yaml
  - .interlock/sessions/0038-partial-learning-proof/prove-partial-learning/debrief.yaml
  - .interlock/sessions/0038-partial-learning-proof/prove-partial-learning/notes.yaml
  - .interlock/sessions/0039-authoring-feedback/make-authoring-actionable/brief.md
  - .interlock/sessions/0039-authoring-feedback/make-authoring-actionable/debrief-candidate.yaml
  - .interlock/sessions/0039-authoring-feedback/make-authoring-actionable/debrief.yaml
  - .interlock/sessions/0039-authoring-feedback/make-authoring-actionable/notes.yaml
  - .interlock/sessions/0040-explicit-citation-boundary/enforce-explicit-citation-boundary/brief.md
  - .interlock/sessions/0040-explicit-citation-boundary/enforce-explicit-citation-boundary/debrief-candidate.yaml
  - .interlock/sessions/0040-explicit-citation-boundary/enforce-explicit-citation-boundary/debrief.yaml
  - .interlock/sessions/0040-explicit-citation-boundary/enforce-explicit-citation-boundary/notes.yaml
  - .interlock/sessions/0040-explicit-citation-boundary/plan/0040-explicit-citation-boundary/brief.md
  - .interlock/sessions/0040-explicit-citation-boundary/plan/0040-explicit-citation-boundary/debrief.yaml
  - .interlock/sessions/0040-explicit-citation-boundary/plan/0040-explicit-citation-boundary/notes.yaml
  - .interlock/sessions/0041-citation-type-repair/repair-citation-types/brief.md
  - .interlock/sessions/0041-citation-type-repair/repair-citation-types/debrief-candidate.yaml
  - .interlock/sessions/0041-citation-type-repair/repair-citation-types/debrief.yaml
  - .interlock/sessions/0041-citation-type-repair/repair-citation-types/notes.yaml
  - .interlock/sessions/0043-any-runtime/example-profiles/brief.md
  - .interlock/sessions/0043-any-runtime/example-profiles/debrief-candidate.yaml
  - .interlock/sessions/0043-any-runtime/example-profiles/debrief.yaml
  - .interlock/sessions/0043-any-runtime/example-profiles/notes.yaml
  - .interlock/sessions/0043-any-runtime/k3-first-run/brief.md
  - .interlock/sessions/0043-any-runtime/k3-first-run/debrief-candidate.yaml
  - .interlock/sessions/0043-any-runtime/k3-first-run/debrief.yaml
  - .interlock/sessions/0043-any-runtime/k3-first-run/notes.yaml
  - .interlock/sessions/0043-any-runtime/run-with-runtime/brief.md
  - .interlock/sessions/0043-any-runtime/run-with-runtime/debrief.yaml
  - .interlock/sessions/0043-any-runtime/run-with-runtime/notes.yaml
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/brief.md
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/notes.yaml
  - .interlock/sessions/0044-runtime-coverage/face-runtime-coverage/brief.md
  - .interlock/sessions/0044-runtime-coverage/face-runtime-coverage/debrief-candidate.yaml
  - .interlock/sessions/0044-runtime-coverage/face-runtime-coverage/debrief.yaml
  - .interlock/sessions/0044-runtime-coverage/face-runtime-coverage/notes.yaml
  - .interlock/sessions/0044-runtime-coverage/fixtures-and-corpus/brief.md
  - .interlock/sessions/0044-runtime-coverage/fixtures-and-corpus/debrief-candidate.yaml
  - .interlock/sessions/0044-runtime-coverage/fixtures-and-corpus/debrief.yaml
  - .interlock/sessions/0044-runtime-coverage/fixtures-and-corpus/notes.yaml
  - .interlock/sessions/0044-runtime-coverage/fixtures-and-corpus/revisions/6e69575c69246ebc2df9ab2fea36f95b50b5777a8e9361d13332b12e2b76b5be.yaml
  - .interlock/sessions/0046-loom-feed/asked-in-words/brief.md
  - .interlock/sessions/0046-loom-feed/asked-in-words/debrief.yaml
  - .interlock/sessions/0046-loom-feed/asked-in-words/notes.yaml
  - .interlock/sessions/0046-loom-feed/landed-on-main/brief.md
  - .interlock/sessions/0046-loom-feed/landed-on-main/debrief.yaml
  - .interlock/sessions/0046-loom-feed/landed-on-main/notes.yaml
  - .interlock/sessions/0046-loom-feed/lines-in-voice/brief.md
  - .interlock/sessions/0046-loom-feed/lines-in-voice/debrief.yaml
  - .interlock/sessions/0046-loom-feed/lines-in-voice/notes.yaml
  - .interlock/sessions/0046-loom-feed/node-role/brief.md
  - .interlock/sessions/0046-loom-feed/node-role/debrief.yaml
  - .interlock/sessions/0046-loom-feed/node-role/notes.yaml
  - .interlock/sessions/0046-loom-feed/position-everything/brief.md
  - .interlock/sessions/0046-loom-feed/position-everything/debrief.yaml
  - .interlock/sessions/0046-loom-feed/position-everything/notes.yaml
  - .interlock/sessions/0046-loom-feed/role-shapes-the-session/brief.md
  - .interlock/sessions/0046-loom-feed/role-shapes-the-session/debrief.yaml
  - .interlock/sessions/0046-loom-feed/role-shapes-the-session/notes.yaml
  - .interlock/sessions/0046-loom-feed/say-into-pane/brief.md
  - .interlock/sessions/0046-loom-feed/say-into-pane/debrief.yaml
  - .interlock/sessions/0046-loom-feed/say-into-pane/notes.yaml
  - .interlock/sessions/0047-worktree-commits/common-git-writable/brief.md
  - .interlock/sessions/0047-worktree-commits/common-git-writable/debrief.candidate.yaml
  - .interlock/sessions/0047-worktree-commits/common-git-writable/debrief.yaml
  - .interlock/sessions/0047-worktree-commits/common-git-writable/notes.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/brief-follows-acceptance/brief.md
  - .interlock/sessions/0048-landed-tells-the-truth/brief-follows-acceptance/candidate.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/brief-follows-acceptance/debrief.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/brief-follows-acceptance/notes.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/landed-tells-the-truth/brief.md
  - .interlock/sessions/0048-landed-tells-the-truth/landed-tells-the-truth/debrief.candidate.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/landed-tells-the-truth/debrief.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/landed-tells-the-truth/notes.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/live-attempt-facts/brief.md
  - .interlock/sessions/0048-landed-tells-the-truth/live-attempt-facts/candidate.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/live-attempt-facts/debrief.yaml
  - .interlock/sessions/0048-landed-tells-the-truth/live-attempt-facts/notes.yaml
  - .interlock/sessions/0049-worktree-gitdir/worktree-gitdir-writable/brief.md
  - .interlock/sessions/0049-worktree-gitdir/worktree-gitdir-writable/debrief.candidate.yaml
  - .interlock/sessions/0049-worktree-gitdir/worktree-gitdir-writable/debrief.yaml
  - .interlock/sessions/0049-worktree-gitdir/worktree-gitdir-writable/notes.yaml
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/brief.md
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/candidate-2.yaml
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/candidate.yaml
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/debrief.yaml
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/notes.yaml
  - .interlock/sessions/0050-verifier-fixture-writer/writer-is-closed/revisions/8ae72112ffd0cc30cafd432f47a376808bf1ba56e46c8a9108eaceb6c8fa009a.yaml
  - .interlock/sessions/0051-no-detached-maintenance/fixtures-and-worktrees/brief.md
  - .interlock/sessions/0051-no-detached-maintenance/fixtures-and-worktrees/candidate.yaml
  - .interlock/sessions/0051-no-detached-maintenance/fixtures-and-worktrees/debrief.yaml
  - .interlock/sessions/0051-no-detached-maintenance/fixtures-and-worktrees/notes.yaml
  - .interlock/sessions/0051-no-detached-maintenance/worktree-maintenance/brief.md
  - .interlock/sessions/0051-no-detached-maintenance/worktree-maintenance/candidate.yaml
  - .interlock/sessions/0051-no-detached-maintenance/worktree-maintenance/debrief.yaml
  - .interlock/sessions/0051-no-detached-maintenance/worktree-maintenance/notes.yaml
  - .interlock/sessions/0052-count-tells-the-truth/landed/brief.md
  - .interlock/sessions/0052-count-tells-the-truth/retire/brief.md
  - .interlock/sessions/0053-graph-arc/arc-required/brief.md
  - .interlock/sessions/0053-graph-arc/arcs-v1/brief.md
  - .interlock/sessions/0053-graph-arc/briefs-before-approval/brief.md
  - .interlock/sessions/0053-graph-arc/registry-reads/brief.md
  - .interlock/sessions/0054-provider-routing/provider-routing/brief.md
  - .interlock/sessions/0054-provider-routing/provider-routing/commits.yaml
  - .interlock/sessions/0054-provider-routing/provider-routing/debrief.candidate.yaml
  - .interlock/sessions/0054-provider-routing/provider-routing/debrief.yaml
  - .interlock/sessions/0054-provider-routing/provider-routing/notes.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/brief.md
  - .interlock/sessions/0055-runner-commits/runner-commits/candidate.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/commits.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/debrief.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/fresh.candidate.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/notes.yaml
  - .interlock/sessions/0055-runner-commits/runner-commits/revisions/721431e59d00f4f6e78b1b89959725fe022f2f2c0e4981ee02f1ba234e9b068d.yaml
  - .interlock/sessions/0056-machine-provider/base-holds-graph/brief.md
  - .interlock/sessions/0056-machine-provider/base-holds-graph/commits.yaml
  - .interlock/sessions/0056-machine-provider/base-holds-graph/debrief.candidate.yaml
  - .interlock/sessions/0056-machine-provider/base-holds-graph/debrief.yaml
  - .interlock/sessions/0056-machine-provider/base-holds-graph/notes.yaml
  - .interlock/sessions/0056-machine-provider/machine-provider/brief.md
  - .interlock/sessions/0056-machine-provider/machine-provider/commits.yaml
  - .interlock/sessions/0056-machine-provider/machine-provider/debrief.candidate.yaml
  - .interlock/sessions/0056-machine-provider/machine-provider/debrief.yaml
  - .interlock/sessions/0056-machine-provider/machine-provider/notes.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/brief.md
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/commits.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/debrief.candidate-815a56b.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/debrief.candidate.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/debrief.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/notes.yaml
  - .interlock/sessions/0056-machine-provider/refusals-stay-resettable/revisions/068edc83c62543edcb6ce1f8dc69905d9f6bfda350a3c4a699a6f4642736dd18.yaml
  - .interlock/sessions/0058-cited-delegation/approve-for-the-owner/brief.md
  - .interlock/sessions/0058-cited-delegation/approve-for-the-owner/debrief-candidate.yaml
  - .interlock/sessions/0058-cited-delegation/approve-for-the-owner/debrief.yaml
  - .interlock/sessions/0058-cited-delegation/approve-for-the-owner/notes.yaml
  - .interlock/sessions/0058-cited-delegation/plan-publish/brief.md
  - .interlock/sessions/0058-cited-delegation/plan-publish/debrief-candidate-2.yaml
  - .interlock/sessions/0058-cited-delegation/plan-publish/debrief-candidate.yaml
  - .interlock/sessions/0058-cited-delegation/plan-publish/debrief.yaml
  - .interlock/sessions/0058-cited-delegation/plan-publish/notes.yaml
  - .interlock/sessions/0058-cited-delegation/plan-publish/revisions/9368135dfaf15c7bca2433daa127ab003225794ec434e54b3a1a2a20e5913e25.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/brief.md
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/debrief-candidate-2.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/debrief-candidate.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/debrief.revision-candidate.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/debrief.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/notes.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/revisions/a929bb4fb06105f5276ecc9c18d99d2389f4ef59944c419f0e103506f7b5047c.yaml
  - .interlock/sessions/0059-submodule-receipts-2/gitlinks-hash-commit/revisions/d6550e9eca9e01007c7807faec13b85201ea1b1e77cd31786f364660ad626429.yaml
  - .interlock/sessions/0059-submodule-receipts/gitlinks-hash-commit/brief.md
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/brief.md
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/debrief-candidate.yaml
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/debrief.revision-candidate.yaml
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/debrief.yaml
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/notes.yaml
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/revisions/3708d457dd183b86d278497a6e7f53142315a2fecc9c05a7cd4512e37fcf8034.yaml
  - .interlock/sessions/0059-submodule-receipts/resume-keeps-range/revisions/f8052a9f854f5e0b182b7c3d30680fb458bdb9a6d7bb82a840e9cb731ec873f3.yaml
  - .interlock/sessions/0060-headless-runtime/exec-phase-ends/brief.md
  - .interlock/sessions/0060-headless-runtime/exec-phase-ends/debrief-candidate.yaml
  - .interlock/sessions/0060-headless-runtime/exec-phase-ends/debrief.yaml
  - .interlock/sessions/0060-headless-runtime/exec-phase-ends/notes.yaml
  - .interlock/sessions/0060-headless-runtime/exec-runtime/brief.md
  - .interlock/sessions/0060-headless-runtime/exec-runtime/debrief-candidate-merge.yaml
  - .interlock/sessions/0060-headless-runtime/exec-runtime/debrief-candidate.yaml
  - .interlock/sessions/0060-headless-runtime/exec-runtime/debrief.yaml
  - .interlock/sessions/0060-headless-runtime/exec-runtime/notes.yaml
  - .interlock/sessions/0060-headless-runtime/exec-runtime/revisions/809578e35464737611e13f2ab6f2d6e8f88ed0bca9a0958b53063bda79261f02.yaml
  - .interlock/sessions/0060-headless-runtime/gates-run-on-engines-node/brief.md
  - .interlock/sessions/0060-headless-runtime/herdr-gone/brief.md
  - .interlock/sessions/0060-headless-runtime/plan-reviews-are-sessions/brief.md
  - .interlock/sessions/0060-headless-runtime/runner-marker/brief.md
  - .interlock/sessions/0060-headless-runtime/runner-marker/debrief-candidate-2.yaml
  - .interlock/sessions/0060-headless-runtime/runner-marker/debrief.yaml
  - .interlock/sessions/0060-headless-runtime/runner-marker/notes.yaml
  - .interlock/sessions/0060-headless-runtime/runner-marker/revisions/f2fc4ecbb6c454075bb2eae33fb078d81bee883b4bccc4a4d1632e3c29ecc710.yaml
  - .interlock/sessions/0060-headless-runtime/runner-records/brief.md
  - .interlock/sessions/0060-headless-runtime/scope-guard-sees-folders/brief.md
  - .interlock/sessions/0060-headless-runtime/scope-guard/brief.md
  - .interlock/sessions/0060-headless-runtime/scope-guard/debrief-candidate-final.yaml
  - .interlock/sessions/0060-headless-runtime/scope-guard/debrief-candidate.yaml
  - .interlock/sessions/0060-headless-runtime/scope-guard/debrief.yaml
  - .interlock/sessions/0060-headless-runtime/scope-guard/notes.yaml
  - .interlock/sessions/0060-headless-runtime/scope-guard/revisions/8fc5b5e70e7abb27d515f7a101f60106bf3c32c2ee8dc29dfc7029d4d177df44.yaml
  - .interlock/sessions/0060-headless-runtime/tests-read-fixtures/brief.md
  - .interlock/sessions/0060-headless-runtime/tests-read-fixtures/debrief-candidate.yaml
  - .interlock/sessions/0060-headless-runtime/tests-read-fixtures/debrief.yaml
  - .interlock/sessions/0060-headless-runtime/tests-read-fixtures/notes.yaml
  - .interlock/sessions/0060-headless-runtime/watch-paths-precise-fixed/brief.md
  - .interlock/sessions/0060-headless-runtime/watch-paths-precise/brief.md
  - .interlock/sessions/0061-delegation-fails-closed/cite-stays-consumed/brief.md
  - .interlock/sessions/0061-delegation-fails-closed/cite-stays-consumed/debrief-candidate-merged.yaml
  - .interlock/sessions/0061-delegation-fails-closed/cite-stays-consumed/debrief.yaml
  - .interlock/sessions/0061-delegation-fails-closed/cite-stays-consumed/notes.yaml
  - .interlock/sessions/0061-delegation-fails-closed/cite-stays-consumed/revisions/4a2d54500d355c7de1e8599c5c27b482e045b9164c9bcef9b6bdad65cc7a1995.yaml
  - .interlock/sessions/0061-delegation-fails-closed/fails-closed/brief.md
  - .interlock/sessions/0061-delegation-fails-closed/fails-closed/debrief-candidate.yaml
  - .interlock/sessions/0061-delegation-fails-closed/fails-closed/debrief.yaml
  - .interlock/sessions/0061-delegation-fails-closed/fails-closed/notes.yaml
  - .interlock/sessions/0061-delegation-fails-closed/fails-closed/revisions/67860d0dff6d8a518d92a69396e55ad7e6ba369990b37dfa014201f355aac55f.yaml
  - .interlock/sessions/0061-delegation-fails-closed/neutral-refusal/brief.md
  - .interlock/sessions/0061-delegation-fails-closed/neutral-refusal/debrief-candidate.yaml
  - .interlock/sessions/0061-delegation-fails-closed/neutral-refusal/debrief.yaml
  - .interlock/sessions/0061-delegation-fails-closed/neutral-refusal/notes.yaml
  - .interlock/sessions/0061-delegation-fails-closed/retraction-holds-outcome/brief.md
  - .interlock/sessions/0061-delegation-fails-closed/retraction-holds-outcome/debrief-candidate.yaml
  - .interlock/sessions/0061-delegation-fails-closed/retraction-holds-outcome/debrief.yaml
  - .interlock/sessions/0061-delegation-fails-closed/retraction-holds-outcome/notes.yaml
  - .interlock/sessions/0062-same-access/access-probe/brief.md
  - .interlock/sessions/0062-same-access/access-probe/debrief.yaml
  - .interlock/sessions/0062-same-access/access-probe/notes.yaml
  - .interlock/sessions/readme-interlock-concept/readme/brief.md
  - .interlock/sessions/readme-interlock-concept/readme/debrief.yaml
  - .interlock/sessions/readme-interlock-concept/readme/notes.yaml
  - .node-version
  - AGENTS.md
  - LICENSE
  - NOTICE
  - README.md
  - biome.json
  - docs/brand/README.md
  - docs/brand/interlock-concept-dark.svg
  - docs/brand/interlock-concept.svg
  - docs/brand/interlock-lifecycle-dark.svg
  - docs/brand/interlock-lifecycle.svg
  - docs/brand/interlock-wordmark-dark.png
  - docs/brand/interlock-wordmark.png
  - docs/design/0001-interlock.md
  - docs/design/0002-face.md
  - docs/design/0003-substrate.md
  - docs/experiments/comparable-learning/inputs/citation-acceptance-review.md
  - docs/experiments/comparable-learning/inputs/comparison-assembly.json
  - docs/experiments/comparable-learning/inputs/comparison-fixture-exceptions.json
  - docs/experiments/comparable-learning/inputs/comparison-index.md
  - docs/experiments/comparable-learning/inputs/delivery-trace.json
  - docs/experiments/comparable-learning/inputs/final-read-audit.md
  - docs/experiments/comparable-learning/inputs/hypothesis-acceptance-review.md
  - docs/experiments/comparable-learning/inputs/outcome-acceptance.md
  - docs/experiments/comparable-learning/inputs/review-a-context.md
  - docs/experiments/comparable-learning/inputs/review-a-debrief.yaml
  - docs/experiments/comparable-learning/inputs/review-a-evidence.json
  - docs/experiments/comparable-learning/inputs/review-a-notes.yaml
  - docs/experiments/comparable-learning/inputs/review-a-report.md
  - docs/experiments/comparable-learning/inputs/review-b-context.md
  - docs/experiments/comparable-learning/inputs/review-b-debrief.yaml
  - docs/experiments/comparable-learning/inputs/review-b-evidence.json
  - docs/experiments/comparable-learning/inputs/review-b-notes.yaml
  - docs/experiments/comparable-learning/inputs/review-b-report.md
  - docs/experiments/comparable-learning/inputs/review-pair-assessment.md
  - docs/experiments/comparable-learning/inputs/review-task.md
  - docs/experiments/comparable-learning/inputs/source-debrief.yaml
  - docs/experiments/comparable-learning/inputs/test-design-a-context.md
  - docs/experiments/comparable-learning/inputs/test-design-a-debrief.yaml
  - docs/experiments/comparable-learning/inputs/test-design-a-evidence.json
  - docs/experiments/comparable-learning/inputs/test-design-a-notes.yaml
  - docs/experiments/comparable-learning/inputs/test-design-a-report.md
  - docs/experiments/comparable-learning/inputs/test-design-b-context.md
  - docs/experiments/comparable-learning/inputs/test-design-b-debrief.yaml
  - docs/experiments/comparable-learning/inputs/test-design-b-evidence.json
  - docs/experiments/comparable-learning/inputs/test-design-b-notes.yaml
  - docs/experiments/comparable-learning/inputs/test-design-b-read-audit.md
  - docs/experiments/comparable-learning/inputs/test-design-b-report.md
  - docs/experiments/comparable-learning/inputs/test-design-task.md
  - docs/experiments/comparable-learning/inputs/test-pair-assessment.md
  - docs/experiments/comparable-learning/next-briefing-strategy.md
  - docs/experiments/comparable-learning/outcome-read.md
  - docs/experiments/learning-transfer/scoped-review.md
  - docs/shapes.md
  - package.json
  - packages/cli/package.json
  - packages/cli/src/backfill.ts
  - packages/cli/src/bin.ts
  - packages/cli/src/brief/validate.ts
  - packages/cli/src/debrief/derived.ts
  - packages/cli/src/debrief/preview.ts
  - packages/cli/src/debrief/recoverSessionStart.ts
  - packages/cli/src/debrief/revise.ts
  - packages/cli/src/debrief/sessionIdentity.ts
  - packages/cli/src/debrief/validate.ts
  - packages/cli/src/delegation.ts
  - packages/cli/src/delegationLock.ts
  - packages/cli/src/evidence.ts
  - packages/cli/src/face/dispatch.ts
  - packages/cli/src/face/focus.ts
  - packages/cli/src/face/keys.ts
  - packages/cli/src/face/run.ts
  - packages/cli/src/face/screen.ts
  - packages/cli/src/face/terminal.ts
  - packages/cli/src/face/world.ts
  - packages/cli/src/flags.ts
  - packages/cli/src/gate/clear.ts
  - packages/cli/src/gate/waive.ts
  - packages/cli/src/gitHostAdapter.ts
  - packages/cli/src/graph/approve.ts
  - packages/cli/src/graph/show.ts
  - packages/cli/src/graph/status.ts
  - packages/cli/src/herdrStatus.ts
  - packages/cli/src/judge.ts
  - packages/cli/src/legacyDebriefLine.ts
  - packages/cli/src/main.ts
  - packages/cli/src/node/cancel.ts
  - packages/cli/src/node/reset.ts
  - packages/cli/src/plan.ts
  - packages/cli/src/planPublish.ts
  - packages/cli/src/position.ts
  - packages/cli/src/receipt/retract.ts
  - packages/cli/src/repositoryOrigin.ts
  - packages/cli/src/run.ts
  - packages/cli/src/runtime/list.ts
  - packages/cli/src/runtime/probe.ts
  - packages/cli/src/schema/reference.ts
  - packages/cli/src/schema/validate.ts
  - packages/cli/src/session/say.ts
  - packages/cli/src/session/show.ts
  - packages/cli/src/sessions.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/citedApproval.test.ts
  - packages/cli/test/concurrentCite.test.ts
  - packages/cli/test/consumedCite.test.ts
  - packages/cli/test/debrief/derived.test.ts
  - packages/cli/test/debrief/preview.test.ts
  - packages/cli/test/debrief/recoverSessionStart.test.ts
  - packages/cli/test/debrief/revise.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/evidence.test.ts
  - packages/cli/test/face/dispatch.test.ts
  - packages/cli/test/face/fixtures/fakeBin.ts
  - packages/cli/test/face/fixtures/manyLinesBin.ts
  - packages/cli/test/face/fixtures/verifier-hunks-journal.jsonl
  - packages/cli/test/face/focus.test.ts
  - packages/cli/test/face/keys.test.ts
  - packages/cli/test/face/landedCache.test.ts
  - packages/cli/test/face/landedFixture.ts
  - packages/cli/test/face/nodeLevelKeys.test.ts
  - packages/cli/test/face/run.test.ts
  - packages/cli/test/face/world.test.ts
  - packages/cli/test/fixtureGuard.test.ts
  - packages/cli/test/gate/clear.test.ts
  - packages/cli/test/gate/waive.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/graph/status.test.ts
  - packages/cli/test/herdrStatus.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/judgeProvider.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/neutralRefusal.test.ts
  - packages/cli/test/noComments.test.ts
  - packages/cli/test/noComments/fixtures/biomeIgnoreOnly.ts
  - packages/cli/test/noComments/fixtures/hasComment.ts
  - packages/cli/test/node/cancel.test.ts
  - packages/cli/test/node/reset.test.ts
  - packages/cli/test/plan.test.ts
  - packages/cli/test/planPublish.test.ts
  - packages/cli/test/position.test.ts
  - packages/cli/test/repositoryOrigin.test.ts
  - packages/cli/test/resumeRange.test.ts
  - packages/cli/test/retractionHoldsOutcome.test.ts
  - packages/cli/test/run.test.ts
  - packages/cli/test/runtime.test.ts
  - packages/cli/test/runtimeProbe.test.ts
  - packages/cli/test/schema/reference.test.ts
  - packages/cli/test/schema/validate.test.ts
  - packages/cli/test/session/say.test.ts
  - packages/cli/test/session/show.test.ts
  - packages/cli/test/sweep.test.ts
  - packages/cli/test/verify.test.ts
  - packages/cli/tsconfig.json
  - packages/cli/vitest.config.ts
  - packages/debrief/package.json
  - packages/debrief/src/brief.ts
  - packages/debrief/src/briefGate.ts
  - packages/debrief/src/briefScopePath.ts
  - packages/debrief/src/briefSubstrate.ts
  - packages/debrief/src/custody.ts
  - packages/debrief/src/debrief.ts
  - packages/debrief/src/decision.ts
  - packages/debrief/src/discovery.ts
  - packages/debrief/src/gateRun.ts
  - packages/debrief/src/index.ts
  - packages/debrief/src/notes.ts
  - packages/debrief/src/paths.ts
  - packages/debrief/src/revise.ts
  - packages/debrief/src/role.ts
  - packages/debrief/src/roleKinds.ts
  - packages/debrief/src/roleSections.ts
  - packages/debrief/src/roles.ts
  - packages/debrief/src/sha.ts
  - packages/debrief/src/slice.ts
  - packages/debrief/src/validate.ts
  - packages/debrief/test/brief.test.ts
  - packages/debrief/test/debrief.test.ts
  - packages/debrief/test/fixtures/brief-v1.md
  - packages/debrief/test/notes.test.ts
  - packages/debrief/test/revise.test.ts
  - packages/debrief/test/roles.test.ts
  - packages/debrief/test/slice.test.ts
  - packages/debrief/tsconfig.json
  - packages/debrief/vitest.config.ts
  - packages/face/package.json
  - packages/face/src/agentStatus.ts
  - packages/face/src/asking.ts
  - packages/face/src/attemptRecord.ts
  - packages/face/src/attempts.ts
  - packages/face/src/criticalPath.ts
  - packages/face/src/document.ts
  - packages/face/src/faceReducer.ts
  - packages/face/src/faceState.ts
  - packages/face/src/float.ts
  - packages/face/src/frameRender.ts
  - packages/face/src/graphs.ts
  - packages/face/src/helpText.ts
  - packages/face/src/index.ts
  - packages/face/src/landed.ts
  - packages/face/src/landedCache.ts
  - packages/face/src/leaseState.ts
  - packages/face/src/line.ts
  - packages/face/src/mainLine.ts
  - packages/face/src/mainLineReader.ts
  - packages/face/src/moment.ts
  - packages/face/src/nodeRow.ts
  - packages/face/src/plansEntry.ts
  - packages/face/src/position.ts
  - packages/face/src/positionGate.ts
  - packages/face/src/receiptSummary.ts
  - packages/face/src/render.ts
  - packages/face/src/role.ts
  - packages/face/src/root.ts
  - packages/face/src/runtimeAttempts.ts
  - packages/face/src/runtimeLine.ts
  - packages/face/src/said.ts
  - packages/face/src/sessionColumns.ts
  - packages/face/src/topology.ts
  - packages/face/src/validate.ts
  - packages/face/src/verb.ts
  - packages/face/src/weight.ts
  - packages/face/test/approval.test.ts
  - packages/face/test/criticalPath.test.ts
  - packages/face/test/document.test.ts
  - packages/face/test/faceReducer.test.ts
  - packages/face/test/float.test.ts
  - packages/face/test/frameRender.test.ts
  - packages/face/test/landed.test.ts
  - packages/face/test/noSyncGit.test.ts
  - packages/face/test/noWriteSurface.test.ts
  - packages/face/test/position.test.ts
  - packages/face/test/render.test.ts
  - packages/face/test/root.test.ts
  - packages/face/test/runtimeAttempts.test.ts
  - packages/face/test/topology.test.ts
  - packages/face/test/verb.test.ts
  - packages/face/test/weight.test.ts
  - packages/face/tsconfig.json
  - packages/face/vitest.config.ts
  - packages/ledger/package.json
  - packages/ledger/src/applicability.ts
  - packages/ledger/src/brief.ts
  - packages/ledger/src/debrief.ts
  - packages/ledger/src/debriefKind.ts
  - packages/ledger/src/derivation.ts
  - packages/ledger/src/disposition.ts
  - packages/ledger/src/envelope.ts
  - packages/ledger/src/event.ts
  - packages/ledger/src/expectOutput.ts
  - packages/ledger/src/gate.ts
  - packages/ledger/src/graph.ts
  - packages/ledger/src/index.ts
  - packages/ledger/src/lease.ts
  - packages/ledger/src/ledger.ts
  - packages/ledger/src/mandate.ts
  - packages/ledger/src/mark.ts
  - packages/ledger/src/nearestTerm.ts
  - packages/ledger/src/note.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/src/outcome.ts
  - packages/ledger/src/personSaid.ts
  - packages/ledger/src/probe.ts
  - packages/ledger/src/projection.ts
  - packages/ledger/src/receipt.ts
  - packages/ledger/src/replay.ts
  - packages/ledger/src/role.ts
  - packages/ledger/src/session.ts
  - packages/ledger/src/sessionFacts.ts
  - packages/ledger/src/sink.ts
  - packages/ledger/src/spend.ts
  - packages/ledger/src/upcast/v1.ts
  - packages/ledger/src/upcast/v2.ts
  - packages/ledger/src/upcast/v3.ts
  - packages/ledger/src/upcast/v5.ts
  - packages/ledger/src/upcast/v6.ts
  - packages/ledger/src/upcast/v7.ts
  - packages/ledger/src/upcast/v8.ts
  - packages/ledger/src/upcast/v9.ts
  - packages/ledger/src/validate.ts
  - packages/ledger/src/walk.ts
  - packages/ledger/test/applicability.test.ts
  - packages/ledger/test/consumedCite.test.ts
  - packages/ledger/test/derivation.test.ts
  - packages/ledger/test/expectOutput.test.ts
  - packages/ledger/test/fixtures/journal-v1-approved.jsonl
  - packages/ledger/test/fixtures/journal-v1-v2-2026-09-10.jsonl
  - packages/ledger/test/fixtures/journal-v1-v3-2026-09-11.jsonl
  - packages/ledger/test/fixtures/journal-v5-run-with-runtime-2026-09-24.jsonl
  - packages/ledger/test/gate.test.ts
  - packages/ledger/test/lease.test.ts
  - packages/ledger/test/mandate.test.ts
  - packages/ledger/test/note.test.ts
  - packages/ledger/test/outboxDurability.test.ts
  - packages/ledger/test/outcome.test.ts
  - packages/ledger/test/probeEvent.test.ts
  - packages/ledger/test/projection.test.ts
  - packages/ledger/test/receipt.test.ts
  - packages/ledger/test/replay.test.ts
  - packages/ledger/test/runtime.test.ts
  - packages/ledger/test/sessionFacts.test.ts
  - packages/ledger/test/spend.test.ts
  - packages/ledger/test/unrepresentable.test.ts
  - packages/ledger/test/wiring.test.ts
  - packages/ledger/tsconfig.json
  - packages/ledger/vitest.config.ts
  - packages/runner/package.json
  - packages/runner/src/acceptanceSection.ts
  - packages/runner/src/agentName.ts
  - packages/runner/src/backfill.ts
  - packages/runner/src/briefRewrite.ts
  - packages/runner/src/claude/headroom.ts
  - packages/runner/src/claude/liveWork.ts
  - packages/runner/src/codex/environment.ts
  - packages/runner/src/codex/headroom.ts
  - packages/runner/src/contextSlice.ts
  - packages/runner/src/debriefAuthoringGuidance.ts
  - packages/runner/src/decidedNode.ts
  - packages/runner/src/dependencies.ts
  - packages/runner/src/execLauncher.ts
  - packages/runner/src/execRuntime.ts
  - packages/runner/src/gateCommand.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/gateOutput.ts
  - packages/runner/src/headroom/adapter.ts
  - packages/runner/src/herdr/adapter.ts
  - packages/runner/src/index.ts
  - packages/runner/src/interpreterBrief.ts
  - packages/runner/src/judgeWorktree.ts
  - packages/runner/src/kimi/headroom.ts
  - packages/runner/src/lease.ts
  - packages/runner/src/localConfig.ts
  - packages/runner/src/machineOutbox.ts
  - packages/runner/src/machineProvider.ts
  - packages/runner/src/narration.ts
  - packages/runner/src/openingPrompt.ts
  - packages/runner/src/openingView.ts
  - packages/runner/src/ownedCommand.ts
  - packages/runner/src/promptDelivery.ts
  - packages/runner/src/providerRouting.ts
  - packages/runner/src/questionNotes.ts
  - packages/runner/src/roleShape.ts
  - packages/runner/src/runnerCommits.ts
  - packages/runner/src/runnerMarker.ts
  - packages/runner/src/runtime.ts
  - packages/runner/src/runtimeCatalogue.ts
  - packages/runner/src/runtimeProbe.ts
  - packages/runner/src/runtimeSelection.ts
  - packages/runner/src/scope.ts
  - packages/runner/src/scopeGuard.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/sessionDrive.ts
  - packages/runner/src/sessionRange.ts
  - packages/runner/src/sessionScreen.ts
  - packages/runner/src/sessionWait.ts
  - packages/runner/src/standingGates.ts
  - packages/runner/src/startupAnswers.ts
  - packages/runner/src/sweep.ts
  - packages/runner/src/tmux/adapter.ts
  - packages/runner/src/validate.ts
  - packages/runner/src/walkSection.ts
  - packages/runner/src/worktree.ts
  - packages/runner/src/worktreeSetup.ts
  - packages/runner/src/writableRootArgs.ts
  - packages/runner/test/absorbOutbox.failure.test.ts
  - packages/runner/test/absorbOutbox.test.ts
  - packages/runner/test/absorbStorageBoundary.test.ts
  - packages/runner/test/adapterBoundary.test.ts
  - packages/runner/test/backfill.test.ts
  - packages/runner/test/backfillMaintenance.test.ts
  - packages/runner/test/baseHoldsGraph.test.ts
  - packages/runner/test/briefRewrite.test.ts
  - packages/runner/test/debriefAuthoringGuidance.test.ts
  - packages/runner/test/delegatedFailsClosed.test.ts
  - packages/runner/test/execRuntime.test.ts
  - packages/runner/test/fixtures/claude/repo-worktrees-node/completed.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/empty.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/incomplete.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/shell-background.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/shell-finished.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/subagent-background.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/subagent-claimed-done.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/subagent-finished.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/subagent-in-flight.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/subagent-reported-running.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/tool-in-flight.jsonl
  - packages/runner/test/fixtures/claude/repo-worktrees-node/unparseable.jsonl
  - packages/runner/test/fixtures/exec/appendEnvironment.mjs
  - packages/runner/test/fixtures/exec/codexProbe.mjs
  - packages/runner/test/fixtures/exec/ignoreTerm.mjs
  - packages/runner/test/fixtures/exec/reapGrandchild.mjs
  - packages/runner/test/fixtures/exec/recordEnvironment.mjs
  - packages/runner/test/fixtures/exec/writeStreams.mjs
  - packages/runner/test/fixtures/herdr-socket-schema.json
  - packages/runner/test/gateCommand.test.ts
  - packages/runner/test/gateJudge.test.ts
  - packages/runner/test/gitCeiling.test.ts
  - packages/runner/test/herdr/adapter.test.ts
  - packages/runner/test/herdr/fakeServer.ts
  - packages/runner/test/lease.test.ts
  - packages/runner/test/liveSmoke.test.ts
  - packages/runner/test/localConfig.test.ts
  - packages/runner/test/machineProvider.test.ts
  - packages/runner/test/narration.test.ts
  - packages/runner/test/openingPrompt.test.ts
  - packages/runner/test/promptDelivery.test.ts
  - packages/runner/test/providerRouting.test.ts
  - packages/runner/test/questionNotes.test.ts
  - packages/runner/test/refusalOutcomes.test.ts
  - packages/runner/test/runnerCommits.test.ts
  - packages/runner/test/runnerMarker.test.ts
  - packages/runner/test/runtimeProbe.test.ts
  - packages/runner/test/runtimeSelection.test.ts
  - packages/runner/test/runtimes.test.ts
  - packages/runner/test/scopeGuard.test.ts
  - packages/runner/test/scopeRefusal.test.ts
  - packages/runner/test/sessionBrief.test.ts
  - packages/runner/test/sessionScreen.test.ts
  - packages/runner/test/sessionStart.test.ts
  - packages/runner/test/sessionWait.test.ts
  - packages/runner/test/settled.test.ts
  - packages/runner/test/standingGates.test.ts
  - packages/runner/test/submoduleReceipts.test.ts
  - packages/runner/test/support/driveFixture.ts
  - packages/runner/test/support/gitFixture.ts
  - packages/runner/test/support/memoryLedger.ts
  - packages/runner/test/support/writableRootForms.ts
  - packages/runner/test/sweep.test.ts
  - packages/runner/test/tmux/adapter.test.ts
  - packages/runner/test/worktree.test.ts
  - packages/runner/test/worktreeMaintenance.test.ts
  - packages/runner/test/worktreeSetup.test.ts
  - packages/runner/test/writableRoot.test.ts
  - packages/runner/test/writableRootLaunch.test.ts
  - packages/runner/tsconfig.json
  - packages/runner/vitest.config.ts
  - packages/schemas/package.json
  - packages/schemas/src/frontMatter.ts
  - packages/schemas/src/index.ts
  - packages/schemas/src/reference.ts
  - packages/schemas/src/reference/artifacts.ts
  - packages/schemas/src/reference/corpus.ts
  - packages/schemas/src/reference/describe.ts
  - packages/schemas/src/reference/diff.ts
  - packages/schemas/src/reference/fence.ts
  - packages/schemas/src/reference/fields.ts
  - packages/schemas/src/reference/json.ts
  - packages/schemas/src/reference/render.ts
  - packages/schemas/src/reference/schemaFiles.ts
  - packages/schemas/src/reference/vocabulary.ts
  - packages/schemas/src/registry.ts
  - packages/schemas/src/validate.ts
  - packages/schemas/test/askedInWords.test.ts
  - packages/schemas/test/brief.test.ts
  - packages/schemas/test/commits.test.ts
  - packages/schemas/test/corpus.files.test.ts
  - packages/schemas/test/corpus.guards.test.ts
  - packages/schemas/test/corpus.item.test.ts
  - packages/schemas/test/corpus.journal.test.ts
  - packages/schemas/test/corpus.position.test.ts
  - packages/schemas/test/corpus.positions.test.ts
  - packages/schemas/test/corpus.substrate.test.ts
  - packages/schemas/test/gateDeclaration.test.ts
  - packages/schemas/test/graphRole.test.ts
  - packages/schemas/test/landed.test.ts
  - packages/schemas/test/machine.test.ts
  - packages/schemas/test/providerRouting.test.ts
  - packages/schemas/test/reference.test.ts
  - packages/schemas/test/reference/corpus.test.ts
  - packages/schemas/test/registry.test.ts
  - packages/schemas/test/roleShapes.test.ts
  - packages/schemas/test/runtimes.test.ts
  - packages/schemas/test/runtimesExample.test.ts
  - packages/schemas/test/sayIntoPane.test.ts
  - packages/schemas/tsconfig.json
  - packages/schemas/vitest.config.ts
  - packages/substrate/package.json
  - packages/substrate/src/address.ts
  - packages/substrate/src/client.ts
  - packages/substrate/src/derivationString.ts
  - packages/substrate/src/discoveryKind.ts
  - packages/substrate/src/evidence.ts
  - packages/substrate/src/httpClient.ts
  - packages/substrate/src/index.ts
  - packages/substrate/src/keyFile.ts
  - packages/substrate/src/narrate.ts
  - packages/substrate/src/noneClient.ts
  - packages/substrate/src/refusalClient.ts
  - packages/substrate/src/registry.ts
  - packages/substrate/src/responseDetail.ts
  - packages/substrate/src/sliceCount.ts
  - packages/substrate/src/validate.ts
  - packages/substrate/src/wire.ts
  - packages/substrate/test/absorb.test.ts
  - packages/substrate/test/address.test.ts
  - packages/substrate/test/capabilities.test.ts
  - packages/substrate/test/context.test.ts
  - packages/substrate/test/derivationString.test.ts
  - packages/substrate/test/discoveryKind.test.ts
  - packages/substrate/test/evidence.test.ts
  - packages/substrate/test/keyFile.test.ts
  - packages/substrate/test/learningBoundary.test.ts
  - packages/substrate/test/noneClient.test.ts
  - packages/substrate/test/responseDetail.test.ts
  - packages/substrate/test/sliceCount.test.ts
  - packages/substrate/test/support/fakeSubstrateServer.ts
  - packages/substrate/test/support/fixtures.ts
  - packages/substrate/test/wire.test.ts
  - packages/substrate/tsconfig.json
  - packages/substrate/vitest.config.ts
  - packages/verifier/package.json
  - packages/verifier/src/foundAt.ts
  - packages/verifier/src/git.ts
  - packages/verifier/src/hunkCitation.ts
  - packages/verifier/src/index.ts
  - packages/verifier/src/inverse.ts
  - packages/verifier/src/render.ts
  - packages/verifier/src/verify.ts
  - packages/verifier/src/vocabulary.ts
  - packages/verifier/test/fixtureCleanup.test.ts
  - packages/verifier/test/foundAt.test.ts
  - packages/verifier/test/git.test.ts
  - packages/verifier/test/hunkCitation.test.ts
  - packages/verifier/test/inverse.test.ts
  - packages/verifier/test/render.test.ts
  - packages/verifier/test/support/gitFixture.ts
  - packages/verifier/test/verify.test.ts
  - packages/verifier/test/vocabulary.test.ts
  - packages/verifier/tsconfig.json
  - packages/verifier/vitest.config.ts
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - runtimes.example.yaml
  - schemas/arcs@v0.json
  - schemas/brief@v0.json
  - schemas/brief@v1.json
  - schemas/commits@v0.json
  - schemas/config@v0.json
  - schemas/debrief@v0.json
  - schemas/debrief@v1.json
  - schemas/debrief@v2.json
  - schemas/event@v1.json
  - schemas/event@v10.json
  - schemas/event@v11.json
  - schemas/event@v2.json
  - schemas/event@v3.json
  - schemas/event@v4.json
  - schemas/event@v5.json
  - schemas/event@v6.json
  - schemas/event@v7.json
  - schemas/event@v8.json
  - schemas/event@v9.json
  - schemas/graph@v0.json
  - schemas/item@v1.json
  - schemas/local@v0.json
  - schemas/local@v1.json
  - schemas/machine@v0.json
  - schemas/notes@v0.json
  - schemas/parts/applies-to.json
  - schemas/parts/chosen-by.json
  - schemas/parts/debrief-derivation.json
  - schemas/parts/debrief-event.json
  - schemas/parts/decision.json
  - schemas/parts/derivation.json
  - schemas/parts/discovery.json
  - schemas/parts/disposition.json
  - schemas/parts/duration.json
  - schemas/parts/gap.json
  - schemas/parts/gate-declaration.json
  - schemas/parts/gate-run.json
  - schemas/parts/gate-v1.json
  - schemas/parts/gate.json
  - schemas/parts/held-on.json
  - schemas/parts/lease.json
  - schemas/parts/legacy-decision.json
  - schemas/parts/legacy-discovery.json
  - schemas/parts/legacy-gate-run.json
  - schemas/parts/mark-counts.json
  - schemas/parts/mark.json
  - schemas/parts/node.json
  - schemas/parts/note.json
  - schemas/parts/outbox-artifact.json
  - schemas/parts/outbox-intent.json
  - schemas/parts/outcome-v1.json
  - schemas/parts/outcome.json
  - schemas/parts/person-said.json
  - schemas/parts/provider-headroom.json
  - schemas/parts/question-note.json
  - schemas/parts/receipt-v1.json
  - schemas/parts/receipt.json
  - schemas/parts/repository.json
  - schemas/parts/session-brief.json
  - schemas/parts/session-facts.json
  - schemas/parts/session-runtime-v1.json
  - schemas/parts/session-runtime.json
  - schemas/parts/session.json
  - schemas/parts/spend.json
  - schemas/parts/standing-gate.json
  - schemas/parts/startup-answer.json
  - schemas/parts/walk.json
  - schemas/parts/writable-root-args.json
  - schemas/position@v1.json
  - schemas/position@v2.json
  - schemas/position@v3.json
  - schemas/positions@v0.json
  - schemas/positions@v1.json
  - schemas/positions@v2.json
  - schemas/probe-config@v0.json
  - schemas/queue@v0.json
  - schemas/roles@v0.json
  - schemas/runtimes@v0.json
  - schemas/runtimes@v1.json
  - schemas/runtimes@v2.json
  - schemas/session-facts@v0.json
  - schemas/session@v0.json
  - schemas/sessions@v0.json
  - schemas/substrate/absorb.request.json
  - schemas/substrate/absorb.response.json
  - schemas/substrate/capabilities.response.json
  - schemas/substrate/close.request.json
  - schemas/substrate/close.response.json
  - schemas/substrate/consult.request.json
  - schemas/substrate/consult.response.json
  - schemas/substrate/contest.request.json
  - schemas/substrate/contest.response.json
  - schemas/substrate/context.request.json
  - schemas/substrate/context.response.json
  - schemas/substrate/judge.request.json
  - schemas/substrate/judge.response.json
  - schemas/substrate/note.request.json
  - schemas/substrate/note.response.json
  - schemas/substrate/open.request.json
  - schemas/substrate/open.response.json
  - schemas/substrate/propose.request.json
  - schemas/substrate/propose.response.json
  - schemas/substrate/query.request.json
  - schemas/substrate/query.response.json
  - schemas/substrate/ratify.request.json
  - schemas/substrate/ratify.response.json
  - schemas/substrate/why.request.json
  - schemas/substrate/why.response.json
  - schemas/transcript@v0.json
  - scripts/check-readme.ts
  - scripts/noComments.ts
  - scripts/warmPosition.ts
  - test/fixtures/machine-none.yaml
  - test/support/gitFixture.ts
  - tsconfig.json
  - vitest.config.base.ts
  - vitest.setup.ts
substrate:
  address: none
walk:
  kind: none
  because: the substrate address is none, so there is nothing to ask
graph_base_sha: fe93a1711b8bb53e6149ee199a62349e2afb7edc
session: d2027535-38c3-4a97-9812-6ed4b85185a0
---

# Brief · node `watch-paths-precise-fixed` · graph `0060-headless-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0060-headless-runtime.yaml`): why this graph exists and what is out of scope.
3. `docs/design/0001-interlock.md` and `docs/shapes.md` where the acceptance touches an artifact version, and the files and
   tests the acceptance names.
4. The acceptance below, verbatim from the graph.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
- Every existing artifact, journal line and schema version still reads and validates; a version is
  published only where the acceptance says so.
- Node via `mise exec --`. Run the focused test files while you work; run the standing gates
  once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End
  every commit message with a `Co-Authored-By:` line naming the model you are.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start or stop herdr.
- Never pipe a test runner, build or install into `head`, `tail` or anything that can exit before it
  does: an early exit breaks the pipe and leaves test workers running with no owner. Write the output
  to a file under the package's ignored `test/.runs/` folder and read that file instead.
- This brief's permissions are the answer: do not ask for a permission it already grants. It grants
  committing on this branch in this worktree and filing the debrief as the last commit; do that without
  asking. Ask only about something the brief does not settle.
- Before you file the debrief, stop every background shell or Bash call you started.

## Deliverable

1. Commits satisfying the acceptance, with focused checks and standing gates run before handoff. Report unresolved acceptance honestly. The runner's gate receipts are the binding proof.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> The record of two failures watch-paths-precise shipped and the fixes they need. That node cleared on a judge
> whose gates ran on Homebrew's Node 26 against an older main, so its outcome is terminal and it cannot be run
> again; this node is where the fix and the record live. Re-tested on 2026-11-08 on the repository's pinned
> Node (v24.14.0, pnpm 10.13.1) with origin/main merged in, two runner tests failed that main itself passes:
> - packages/runner/test/scopeGuard.test.ts "does not read owner-only watched files and compares their size and
>   mtimeMs": a same-size rewrite with the mtime restored was still reported as a change ({ ownerOnly: true,
>   path: "secret.txt", root: "watch path" }).
> - packages/runner/test/absorbOutbox.test.ts "retains observed command evidence when an authored claim is
>   unrooted" ended held where it expects cleared (absorbOutbox.test.ts:124, :155), an interaction between
>   watch-paths-precise's change and what main brought in, such as fails-closed's change to delegated clearance.
> The session merges graph/0060-headless-runtime/watch-paths-precise and origin/main, each with a signed merge;
> origin/main then holds runner-marker, so execRuntime.test.ts's timed tests pass under load. It fixes both
> failures at the cause, never by loosening what counts as a change for files that are not owner-only and never
> by changing the absorbOutbox test's expectation unless the expectation itself is shown wrong. Every gate and
> test runs with the repository's pinned pnpm and Node first on PATH, and the session records node --version
> and pnpm --version in notes.yaml. Its debrief names both failures, their causes, the fix commits, the Node 26
> clear of watch-paths-precise, and the counts of each gate below. No test is excluded or skipped.

<!-- interlock: debrief-authoring-guidance@v1:start -->
## Debrief authoring

`found_at`, `rests_on`, and `hunks` say what supports a claim. Optional `applies_to` says
where you judge a rooted lesson useful; it never supplies support or ratifies a claim.

Review notes for discoveries worth handing on. For an explicit `found_at` path and line or
range, write one separate exact quotation from that range at the authored head. A bare ranged
path does not establish the discovery:

```yaml
discoveries:
  - id: exact-range
    what: The evidence records a durable exact excerpt.
    found_at: 'evidence.ts:2-3 "durable exact excerpt"'
    mattered_because: A later session can re-read the cited source.
```

No discovery, no justified applicability, an unrooted claim, and declining a received hypothesis
are all valid. Do not invent claims, infer applicability, rewrite citations, or promote notes
automatically.

Prefer a justified narrow path:

```yaml
applies_to: { kind: path, path: packages/substrate/src/evidence.ts }
```

Use repository scope only with an explicit cross-cutting reason:

```yaml
applies_to: { kind: repository }
```

Omit `applies_to` when no target is warranted. Keep the real decision and its why, and say what
a future session can act on. It changes neither authority nor gates, and does not establish better
judgment. Treat received context as a hypothesis: check, reject, or leave it unused.

Before filing, optionally inspect an authored candidate read-only with `interlock debrief preview --file <candidate>`.

Before you stop to wait for a person in your pane, append a question note to notes.yaml, then
ask in the pane as you do today. `asked` is the question in the words you would say to the
person; optional `options` are the short answers you would accept. The position shows exactly
these words while you wait, and nothing else:

```yaml
  - kind: question
    at: "2026-11-05T01:30:00Z"
    asked: Should the walk stay empty when the substrate address is none?
    options: [yes, no]
```
<!-- interlock: debrief-authoring-guidance@v1:end -->

<!-- interlock: role-walk@v0:start -->
## Walk

Role: implementer.

This walk is empty: the substrate address is none, so there is nothing to ask. Nothing here errors; the session runs without a substrate.
When an address is set, the whole substrate is open to the session through it, and any role may walk anywhere it wants.
<!-- interlock: role-walk@v0:end -->
