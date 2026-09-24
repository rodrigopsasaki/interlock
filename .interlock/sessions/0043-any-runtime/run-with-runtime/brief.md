---
interlock: brief@v1
graph: 0043-any-runtime
node: run-with-runtime
role: worker
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
  - id: selection-proof
    kind: command
    run: pnpm --filter runner exec vitest run test/runtimeSelection.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: session-runtime-proof
    kind: command
    run: pnpm --filter ledger exec vitest run test/runtime.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: run-flag-proof
    kind: command
    run: pnpm --filter cli exec vitest run test/run.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
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
  - .interlock/graphs/readme-interlock-concept.yaml
  - .interlock/local.example.yaml
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
  - .interlock/sessions/0043-any-runtime/run-with-runtime/brief.md
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/brief.md
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml
  - .interlock/sessions/0043-any-runtime/runtime-catalogue/notes.yaml
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
  - docs/brand/interlock-concept-mobile-dark.svg
  - docs/brand/interlock-concept-mobile.svg
  - docs/brand/interlock-concept.svg
  - docs/brand/interlock-critical-path-dark.svg
  - docs/brand/interlock-critical-path-mobile-dark.svg
  - docs/brand/interlock-critical-path-mobile.svg
  - docs/brand/interlock-critical-path.svg
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
  - packages/cli/src/repositoryOrigin.ts
  - packages/cli/src/run.ts
  - packages/cli/src/runtime/list.ts
  - packages/cli/src/schema/reference.ts
  - packages/cli/src/schema/validate.ts
  - packages/cli/src/session/show.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
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
  - packages/cli/test/face/nodeLevelKeys.test.ts
  - packages/cli/test/face/run.test.ts
  - packages/cli/test/face/world.test.ts
  - packages/cli/test/gate/clear.test.ts
  - packages/cli/test/gate/waive.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/graph/status.test.ts
  - packages/cli/test/herdrStatus.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/noComments.test.ts
  - packages/cli/test/noComments/fixtures/biomeIgnoreOnly.ts
  - packages/cli/test/noComments/fixtures/hasComment.ts
  - packages/cli/test/node/cancel.test.ts
  - packages/cli/test/node/reset.test.ts
  - packages/cli/test/plan.test.ts
  - packages/cli/test/repositoryOrigin.test.ts
  - packages/cli/test/run.test.ts
  - packages/cli/test/runtime.test.ts
  - packages/cli/test/schema/reference.test.ts
  - packages/cli/test/schema/validate.test.ts
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
  - packages/debrief/src/sha.ts
  - packages/debrief/src/slice.ts
  - packages/debrief/src/validate.ts
  - packages/debrief/test/brief.test.ts
  - packages/debrief/test/debrief.test.ts
  - packages/debrief/test/fixtures/brief-v1.md
  - packages/debrief/test/notes.test.ts
  - packages/debrief/test/revise.test.ts
  - packages/debrief/test/slice.test.ts
  - packages/debrief/tsconfig.json
  - packages/debrief/vitest.config.ts
  - packages/face/package.json
  - packages/face/src/agentStatus.ts
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
  - packages/face/src/leaseState.ts
  - packages/face/src/nodeRow.ts
  - packages/face/src/plansEntry.ts
  - packages/face/src/position.ts
  - packages/face/src/positionGate.ts
  - packages/face/src/receiptSummary.ts
  - packages/face/src/render.ts
  - packages/face/src/root.ts
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
  - packages/face/test/noWriteSurface.test.ts
  - packages/face/test/position.test.ts
  - packages/face/test/render.test.ts
  - packages/face/test/root.test.ts
  - packages/face/test/topology.test.ts
  - packages/face/test/verb.test.ts
  - packages/face/test/weight.test.ts
  - packages/face/tsconfig.json
  - packages/face/vitest.config.ts
  - packages/ledger/package.json
  - packages/ledger/src/applicability.ts
  - packages/ledger/src/brief.ts
  - packages/ledger/src/debrief.ts
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
  - packages/ledger/src/note.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/src/outcome.ts
  - packages/ledger/src/projection.ts
  - packages/ledger/src/receipt.ts
  - packages/ledger/src/replay.ts
  - packages/ledger/src/session.ts
  - packages/ledger/src/sink.ts
  - packages/ledger/src/spend.ts
  - packages/ledger/src/upcast/v1.ts
  - packages/ledger/src/upcast/v2.ts
  - packages/ledger/src/upcast/v3.ts
  - packages/ledger/src/validate.ts
  - packages/ledger/test/applicability.test.ts
  - packages/ledger/test/derivation.test.ts
  - packages/ledger/test/expectOutput.test.ts
  - packages/ledger/test/fixtures/journal-v1-approved.jsonl
  - packages/ledger/test/fixtures/journal-v1-v2-2026-09-10.jsonl
  - packages/ledger/test/fixtures/journal-v3-v4-2026-09-11.jsonl
  - packages/ledger/test/gate.test.ts
  - packages/ledger/test/lease.test.ts
  - packages/ledger/test/mandate.test.ts
  - packages/ledger/test/note.test.ts
  - packages/ledger/test/outboxDurability.test.ts
  - packages/ledger/test/outcome.test.ts
  - packages/ledger/test/projection.test.ts
  - packages/ledger/test/receipt.test.ts
  - packages/ledger/test/replay.test.ts
  - packages/ledger/test/spend.test.ts
  - packages/ledger/test/unrepresentable.test.ts
  - packages/ledger/test/wiring.test.ts
  - packages/ledger/tsconfig.json
  - packages/ledger/vitest.config.ts
  - packages/runner/package.json
  - packages/runner/src/agentName.ts
  - packages/runner/src/backfill.ts
  - packages/runner/src/briefRewrite.ts
  - packages/runner/src/contextSlice.ts
  - packages/runner/src/debriefAuthoringGuidance.ts
  - packages/runner/src/dependencies.ts
  - packages/runner/src/gateCommand.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/gateOutput.ts
  - packages/runner/src/herdr/adapter.ts
  - packages/runner/src/index.ts
  - packages/runner/src/interpreterBrief.ts
  - packages/runner/src/judgeWorktree.ts
  - packages/runner/src/lease.ts
  - packages/runner/src/localConfig.ts
  - packages/runner/src/narration.ts
  - packages/runner/src/openingPrompt.ts
  - packages/runner/src/openingView.ts
  - packages/runner/src/runtime.ts
  - packages/runner/src/runtimeCatalogue.ts
  - packages/runner/src/scope.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/sessionDrive.ts
  - packages/runner/src/sessionScreen.ts
  - packages/runner/src/sessionWait.ts
  - packages/runner/src/standingGates.ts
  - packages/runner/src/startupAnswers.ts
  - packages/runner/src/sweep.ts
  - packages/runner/src/tmux/adapter.ts
  - packages/runner/src/validate.ts
  - packages/runner/src/worktree.ts
  - packages/runner/src/worktreeSetup.ts
  - packages/runner/test/absorbOutbox.failure.test.ts
  - packages/runner/test/absorbOutbox.test.ts
  - packages/runner/test/absorbStorageBoundary.test.ts
  - packages/runner/test/adapterBoundary.test.ts
  - packages/runner/test/backfill.test.ts
  - packages/runner/test/briefRewrite.test.ts
  - packages/runner/test/debriefAuthoringGuidance.test.ts
  - packages/runner/test/fixtures/herdr-socket-schema.json
  - packages/runner/test/gateCommand.test.ts
  - packages/runner/test/gateJudge.test.ts
  - packages/runner/test/gitCeiling.test.ts
  - packages/runner/test/herdr/adapter.test.ts
  - packages/runner/test/herdr/fakeServer.ts
  - packages/runner/test/lease.test.ts
  - packages/runner/test/liveSmoke.test.ts
  - packages/runner/test/localConfig.test.ts
  - packages/runner/test/narration.test.ts
  - packages/runner/test/openingPrompt.test.ts
  - packages/runner/test/runtimes.test.ts
  - packages/runner/test/sessionBrief.test.ts
  - packages/runner/test/sessionScreen.test.ts
  - packages/runner/test/sessionWait.test.ts
  - packages/runner/test/standingGates.test.ts
  - packages/runner/test/support/gitFixture.ts
  - packages/runner/test/support/memoryLedger.ts
  - packages/runner/test/sweep.test.ts
  - packages/runner/test/tmux/adapter.test.ts
  - packages/runner/test/worktree.test.ts
  - packages/runner/test/worktreeSetup.test.ts
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
  - packages/schemas/test/brief.test.ts
  - packages/schemas/test/corpus.files.test.ts
  - packages/schemas/test/corpus.guards.test.ts
  - packages/schemas/test/corpus.item.test.ts
  - packages/schemas/test/corpus.journal.test.ts
  - packages/schemas/test/corpus.position.test.ts
  - packages/schemas/test/corpus.substrate.test.ts
  - packages/schemas/test/reference.test.ts
  - packages/schemas/test/reference/corpus.test.ts
  - packages/schemas/test/registry.test.ts
  - packages/schemas/test/runtimes.test.ts
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
  - schemas/brief@v0.json
  - schemas/brief@v1.json
  - schemas/config@v0.json
  - schemas/debrief@v0.json
  - schemas/debrief@v1.json
  - schemas/debrief@v2.json
  - schemas/event@v1.json
  - schemas/event@v2.json
  - schemas/event@v3.json
  - schemas/event@v4.json
  - schemas/event@v5.json
  - schemas/graph@v0.json
  - schemas/item@v1.json
  - schemas/local@v0.json
  - schemas/notes@v0.json
  - schemas/parts/applies-to.json
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
  - schemas/parts/mark.json
  - schemas/parts/node.json
  - schemas/parts/note.json
  - schemas/parts/outbox-artifact.json
  - schemas/parts/outbox-intent.json
  - schemas/parts/outcome-v1.json
  - schemas/parts/outcome.json
  - schemas/parts/receipt-v1.json
  - schemas/parts/receipt.json
  - schemas/parts/repository.json
  - schemas/parts/session-brief.json
  - schemas/parts/session.json
  - schemas/parts/spend.json
  - schemas/parts/standing-gate.json
  - schemas/parts/startup-answer.json
  - schemas/position@v1.json
  - schemas/runtimes@v0.json
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
  - scripts/check-readme.ts
  - scripts/noComments.ts
  - tsconfig.json
  - vitest.config.base.ts
  - vitest.setup.ts
substrate:
  address: none
graph_base_sha: 6f6d49e8e82df6e3af8193c0d52e2c4404fb4c9a
session: ebc76154-fda0-4165-8ca5-2bde48c67fd2
---

# Brief · node `run-with-runtime` · graph `0043-any-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0043-any-runtime`, approved by Rodrigo Sasaki on 2026-09-24 (receipt
  `7ae05778c386f6f1…`). Do not edit the graph file.
- **node:** `run-with-runtime`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runtime-catalogue`, cleared at `0492fdc` and already in your history. Its
  debrief is at `.interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml`; read it
  before the code.
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0043-any-runtime/run-with-runtime`. **worktree:** this directory. Work
  only here.

## Acceptance (verbatim from the graph)

> Choose the runtime per attempt. `interlock run <graph> <node> --runtime <name>` and
> `interlock plan ... --runtime <name>` select a profile from the catalogue. Resolution order:
> the flag, then local.yaml `default_runtime`, then the legacy `runtime:` block as `default`. An
> unknown name refuses with a sentence that lists the known names. Nothing in a graph names a
> runtime; the choice is the caller's at each attempt (strategy declared, model measured).
>
> Record the choice where the session is recorded. The event that opens a session carries
> `runtime: { name, kind, model }` as typed additive fields; the persisted event shape advances
> to event@v6 with an upcaster from every prior version, and a replayed pre-v6 session reads
> its runtime as `unknown`, never invented. Every fixture journal under
> packages/ledger/test/fixtures must still replay. The runner's narration names the runtime
> when the pane opens. `interlock session show` prints it. `interlock graph show` shows the
> runtime of each node's live or latest attempt. `interlock runtime list` gains the last
> attempt per profile, outcome and when, from the projection, so "can this profile start on
> this machine" is answered by the record.
>
> Strict TypeScript, no assertions, no non-null operators. Tests pin: flag beats default beats
> legacy; an unknown name refuses with the list; the v5 fixture upcasts to `unknown`; the
> narration line; the list column. Preserve every historical artifact. Append typed notes. Run
> the focused test files and lint before handoff. No push, no merge; the human merges.

## Why this node exists

`runtime-catalogue` built the catalogue and `mergeRuntimes` (packages/runner/src/runtimeCatalogue.ts):
a `ReadonlyMap<string, ResolvedRuntime>` plus `defaultRuntime`. Nothing reads it yet: the
runner still starts `local.yaml`'s `runtime:` block on every attempt. After this node the person
at the door says `--runtime luna` and the record says which runtime a node ran on. The next node
of this graph is run with `--runtime luna` and the one after it with `--runtime k3`; if either
cannot be told apart in `session show` and `graph show`, this node is not done.

## Words

An entry of the catalogue is **a runtime**; the graph's "profile" is not a word here (see the
previous debrief's `open`). A node's **attempt** is one session on it; "live or latest attempt"
means the session with a live lease if any, else the most recent session. Never introduce
"profile". If you need a word that does not exist, record a gap in the debrief's `open`.

## Gates

Standing gates run by the runner at judgement: `typecheck`, `lint`, `comments`, `test`,
`debrief-valid`. Node gates, run by the runner and by you before handoff:

- `selection-proof` — `pnpm --filter runner exec vitest run test/runtimeSelection.test.ts`
- `session-runtime-proof` — `pnpm --filter ledger exec vitest run test/runtime.test.ts`
- `run-flag-proof` — `pnpm --filter cli exec vitest run test/run.test.ts` (exists; extend it)

Create exactly the two new files the gates name; a gate whose file is missing fails closed.

## Read first

1. `AGENTS.md`: vocabulary, I3, I6, I8, and Compatibility: persisted journal events carry their
   shape version from the first byte; replay routes through a versioned upcast seam; an unknown
   shape is a typed refusal distinct from a truncated tail; evolution is additive.
2. `.interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml` and `notes.yaml`: what
   the previous session built and why, including `ResolvedRuntime` (not `Runtime`, which is the
   pane-driving adapter interface in `packages/runner/src/runtime.ts`).
3. `packages/runner/src/runtimeCatalogue.ts` and `localConfig.ts`: `loadRuntimeCatalogue`,
   `mergeRuntimes`, `MergedRuntimes.defaultRuntime`, `DEFAULT_RUNTIME_NAME`, `LocalConfig.runtime`.
4. `packages/runner/src/sessionDrive.ts`: the one driver that leases, prepares the worktree,
   writes the brief, opens the pane, starts the agent, prompts and waits. Find where it takes
   `localConfig.runtime` (kind, args, startupAnswers, startupTimeoutMs) and hand it a
   `ResolvedRuntime` instead. `packages/cli/src/run.ts` and `packages/cli/src/plan.ts` are its
   two callers; `packages/cli/src/flags.ts` has `parseFlag`.
5. `packages/ledger/src/event.ts` (`session-started` carries `Session`; `lease-taken`,
   `session-narrated`), `session.ts` (the `Session` type and `isSession`), `envelope.ts`
   (`EVENT_SHAPE`, `shapeTag`, `upcastTable`), `upcast/v1.ts`, `v2.ts`, `v3.ts` (how prior
   shapes upcast; find how v4 and v5 are handled), `replay.ts` or wherever replay refuses on an
   unknown shape. `schemas/event@v5.json` is the current schema; the fixtures under
   `packages/ledger/test/fixtures/` are real journals.
6. `packages/ledger/src/projection.ts` (or the module that builds `SessionView` and node
   attempts): where a session's data becomes readable.
7. `packages/cli/src/session/show.ts`, `packages/cli/src/graph/show.ts`,
   `packages/face/src/nodeRow.ts`, `attempts.ts`, `sessionColumns.ts`, `position.ts`: how a node
   row and a session are rendered; the runtime joins these reads.
8. `packages/cli/src/runtime/list.ts`: the list this node extends.

## What this node builds

- **One resolution function** in the runner package: given `MergedRuntimes` and an optional
  requested name, return the `ResolvedRuntime` to start, or a refusal. Order: the requested
  name, then `defaultRuntime`, then the entry named `default` (the legacy block). No name
  resolvable is a refusal naming what was looked for and what exists. An unknown requested name
  refuses with a sentence that lists the known names. `run` and `plan` both call this one
  function; neither grows its own copy.
- **`--runtime <name>`** on `interlock run <graph> <node>` and `interlock plan ...`. Refusals
  print as sentences and exit non-zero before anything is leased: a bad runtime name must not
  cost a lease.
- **The runtime on the session.** `Session` gains an additive field, typed as a union with two
  arms: declared, carrying `name`, `kind` and the declared `model` (which may be undeclared for
  the legacy block, since its args are opaque; say so in the type, do not invent a label), and
  `unknown`, the reading of every session recorded before this shape. `session-started` carries
  it. `EVENT_SHAPE` advances to `event@v6`; `schemas/event@v6.json` is added beside the others;
  the upcast seam gains the step that reads a pre-v6 session as `unknown`; every fixture journal
  still replays and its verdicts are unchanged. Add one fixture that contains real `event@v5`
  lines with a `session-started` event: copy lines from this repository's own journal at
  `.interlock/ledger/journal.jsonl` (read it; never write it; the runner is its only writer).
  Update `docs/shapes.md` through `interlock schema reference` as the previous node did.
- **Narration.** When the pane opens, one narrated line names the runtime: name, kind, model
  or "model undeclared". It lands in the journal like every other narrated line.
- **Reads.** `interlock session show` prints the runtime under Context beside derivation.
  `interlock graph show` shows, per node, the runtime of the live or latest attempt, or nothing
  when there is none, or `unknown` for a pre-v6 attempt. `interlock runtime list` gains one
  column per runtime: the last attempt on it, as the node's outcome or lease state and the
  time, from the projection; "never run" when the record has none. The TUI (`interlock face`)
  may show the runtime where its shared view-model already carries the attempt; do not build a
  new frame for it.
- **Two small repairs from the previous node, in scope because you touch the same files:**
  `loadRuntimeCatalogue` rethrows any read error other than ENOENT as a stack trace; a present
  but unreadable file must refuse with a sentence naming the path and the error code. And
  `interlock runtime list`'s empty message says "local.yaml has no runtime block" when
  `local.yaml` is in fact absent; say which it is.

## Out of scope

Any vendor name or flag in code or tests. Any PATH or executable probe. Quota or failover
between runtimes. Node-level allowed runtimes in the graph. The daemon or watcher. Changing how
gates are judged or receipts are addressed. Do not edit `AGENTS.md`, the design notes, the
graph, the previous session's files, or this brief. Do not write to `.interlock/ledger/`.

## Constraints

- **Comments: none in `packages/*/src`.** The `comments` standing gate counts them.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Add no dependency.
- Biome is the formatter and linter (`pnpm lint`); keep `biome.json` untouched.
- Node pinned by `.node-version`; run everything through `mise exec --`. Run the focused test
  files while you work; run the standing gates once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End every
  message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- No files outside this worktree except the temporary directories your tests create under their
  own scratch. No `/tmp`. No `rm -rf`. Never start or stop herdr. Never touch
  `~/.config/interlock`.

## Deliverable

1. Commits satisfying the acceptance; all gates green, run by you before handoff:
   `mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm check:comments`,
   the three node gate commands, and `mise exec -- pnpm interlock debrief validate
   0043-any-runtime run-with-runtime`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work, committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit, `head_sha` = last code commit,
   a because on every decision, decisions a manifest of the diff, `open` carrying the shapes'
   gap log. In the debrief, quote verbatim: one `interlock session show` output that prints a
   runtime, one `graph show` line that shows one, and the `runtime list` output with its new
   column, all taken from a test fixture or a scratch journal, never from the real journal.

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
<!-- interlock: debrief-authoring-guidance@v1:end -->
