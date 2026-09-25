---
interlock: brief@v1
graph: 0045-session-facts
node: plan/0045-session-facts
role: interpreter
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
  - .interlock/graphs/0044-runtime-coverage.yaml
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
  - packages/face/src/runtimeAttempts.ts
  - packages/face/src/runtimeLine.ts
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
  - packages/ledger/src/upcast/v5.ts
  - packages/ledger/src/validate.ts
  - packages/ledger/test/applicability.test.ts
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
  - packages/ledger/test/projection.test.ts
  - packages/ledger/test/receipt.test.ts
  - packages/ledger/test/replay.test.ts
  - packages/ledger/test/runtime.test.ts
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
  - packages/runner/src/promptDelivery.ts
  - packages/runner/src/runtime.ts
  - packages/runner/src/runtimeCatalogue.ts
  - packages/runner/src/runtimeSelection.ts
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
  - packages/runner/test/promptDelivery.test.ts
  - packages/runner/test/runtimeSelection.test.ts
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
  - packages/schemas/test/runtimesExample.test.ts
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
  - schemas/event@v6.json
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
  - schemas/parts/session-runtime.json
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
  address: http://localhost:8080
graph_base_sha: 69d2b149819000d26fa2c164524a5315eacf83d5
session: 4a1947d0-a065-48b4-854b-090212c5a371
---
# Brief · node `plan/0045-session-facts` · graph `0045-session-facts`

Review before approval found four defects; revise the graph, keep everything else. (1) Dogfood proof is self-reported: dogfood-codex-facts and dogfood-claude-facts gate on re-running the session/show and graph/show unit tests, which pass whether or not that dogfood session's own prompt landed. Each dogfood node's gate must read that node's OWN recorded facts through the harness, e.g. `interlock session show 0045-session-facts <node>` (or the equivalent read the facts node introduces) with expect_output requiring the prompt-received fact from the record, observed usage, and a last activity time; name the exact rendered words the facts node commits to so the gate can match them (I1). (2) prompt-delivery-facts leaves runtimes without a reader undefined: read strictly, every Kimi run and every Claude run before its reader lands would retry and be abandoned. State the fallback: with no reader for the runtime (unknown), taken keeps today's status-based rule, and the session records the basis of delivery as status rather than record so the position shows the weaker evidence; a runtime with a reader never falls back. Test both. (3) brief-authoring-path's gate (`schema reference --check`) passes even if the new documentation is never written; its gate must run the read-only check the node adds, which fails when the brief authoring path or worked example disappears. (4) Derivation says model gpt-5; this interpreter session ran on luna (codex, gpt-5.6-luna); record the model exactly. Also: the ask named Kimi Code CLI as a later reader node beside Claude; if you defer it, say so explicitly in `read` with the because (record not yet confirmed on this machine), rather than dropping it silently.

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not edit it.

## Ask

> Make the right facts about any session reachable at the right time regardless of vendor: read them from each runtime's own session record, never infer them from a screen or a status heuristic. The person's principle: interlock should make it easy to get the right type of information from any session at the right time, whichever model or vendor runs it.

## Corrected from

The graph this ask produced last time was not approved. It follows verbatim; treat it as
a starting point to correct, not as a shape to preserve where the reason above calls for a
different one.

```yaml
interlock: graph@v0
id: 0045-session-facts
ask: |
  Make the right facts about any session reachable at the right time regardless of vendor: read them from each runtime's own session record, never infer them from a screen or a status heuristic. The person's principle: interlock should make it easy to get the right type of information from any session at the right time, whichever model or vendor runs it.

  Field evidence (graph measure-thresholds in the jev-patterns repository, runtime luna = Codex gpt-5.6-luna, run 2026-09-24 21:49 -0300 on a checkout that already contained e6a1745 and 92f9d5e):
  1. The opening prompt was dropped although delivery counted it taken. The runner logged "prompt sent", "agent working", then "agent settled with no debrief"; the Codex pane showed an empty input box under a "2 startup issues (1 MCP)" banner. Codex's own rollout (~/.codex/sessions/.../rollout-*.jsonl) did not exist until 00:54:43Z, the moment a person re-sent the identical prompt with `herdr agent prompt`; its first user message is that prompt. herdr's status transition fooled promptDelivery's taken check; the session record would not have.
  2. Spend never reached a receipt or the position. The same rollout carries token_count records (total_token_usage input/cached/output/reasoning; rate_limits used_percent over a 10080-minute window): 10.6M input tokens, 97.7% cached, 37k output. Spend exists only on gate receipts today, never on a session.
  3. The runner's screen capture blocked its own judgement in a repository other than interlock: .interlock/sessions/<graph>/<node>/screen.txt was untracked in the jev-patterns worktree and `interlock judge` held the node on "1 uncommitted path". 92f9d5e only added the path to interlock's own .gitignore; any other repository still collides. The runner must keep its own artifacts out of what it judges without relying on the target repository's ignore file.
  4. A person had to reverse-engineer brief@v1 from another repository: `interlock run` refused with "no brief; brief authoring is not the runner's" and nothing said who writes a brief, from what, or where the shape and an example live.

  Direction, not a decision: herdr already hands the runner each pane's agent_session id and session path (herdr agent list shows "agent_session": {"source":"herdr:codex","value":...}), which locates the vendor's own record. A per-runtime reader behind the adapter (I6) turns that record into a small set of vendor-neutral facts the runner, ledger and position consume: the opening prompt received, the time of last activity, and spend (usage and, where the vendor reports it, quota). A runtime whose record is unknown degrades to "unknown", never invented (I5 in spirit). Codex is the first reader because it is verified; Claude Code and Kimi Code CLI follow only once their record is confirmed on this machine, each its own node. Keep promptDelivery's retry and grace behaviour; change what counts as taken. Measure the proof by dogfood: run at least one node of this graph on luna and one on another vendor, unattended, and show the facts in the position.

  Out of scope: pricing or converting tokens to money, quota-aware failover between profiles, a watcher daemon, and any change to how gates judge.
derivation:
  kind: agent
  runtime: codex
  model: gpt-5
  session: 183bc2d2-53d0-40ba-a122-889b2b712e86
  graph_base_sha: 69d2b149819000d26fa2c164524a5315eacf83d5
read: >
  The current runtime identity already has a vendor-neutral session id and an optional record
  path, but the runner still treats herdr's state transition as proof that the opening prompt was
  received and stores no session usage. This graph first defines the additive facts and reader
  seam, then implements Codex because its record is verified, wires the facts into prompt delivery,
  the journal and position, and repairs the runner-owned screen boundary independently. Brief
  authoring is documented as a separate gap. Claude Code has its own guarded reader node: it must
  confirm the record on this machine before any parser is written, while unknown remains an honest
  result. Two final nodes run unattended on luna and the confirmed second vendor, and require the
  resulting session record and position to expose the facts. No node changes gate judgment, pricing,
  failover, or a watcher.
gates:
  - id: approved
    kind: human
nodes:
  - id: session-facts-seam
    depends_on: []
    acceptance: |
      Establish the vendor-neutral session-facts@v0 contract and the runtime-reader seam without
      naming a vendor outside its adapter. Facts are individually explicit rather than inferred:
      opening prompt received, last activity wall time, usage counters, and an optional
      vendor-reported quota window; each can be unknown. Preserve raw usage and quota observations
      without pricing or converting tokens to money. A missing, malformed, unavailable, or
      unsupported record returns unknown and does not fail the session; substrate address none
      remains usable.

      Carry the contract through strict TypeScript guards and the persisted journal/upcast seam.
      Add the smallest additive event representation needed for a session's latest facts, retain
      every prior event fixture, and make pre-facts sessions replay with unknown facts. The reader
      receives the adapter's session identity and record path; core code has no vendor file names,
      flags, status heuristics, or screen parsing. Add focused contract, guard, unknown-fallback,
      and replay tests, update the relevant event/position schema reference, and keep all existing
      artifacts readable. No gate-judgment behavior changes.
    gates:
      - id: facts-ledger-contract
        kind: command
        run: pnpm --filter ledger exec vitest run test/sessionFacts.test.ts test/replay.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: codex-session-reader
    depends_on: [session-facts-seam]
    acceptance: |
      Implement the first runtime reader in the Codex adapter only. Use the agent_session identity
      and session path supplied by herdr to read Codex's own rollout record, never pane text or
      herdr status. Recognize the exact opening prompt message, the latest activity timestamp,
      total usage fields including cached input and reasoning where present, and the reported rate
      limit window and used percentage where present. A missing rollout, incomplete line, unknown
      record shape, or absent optional field yields the corresponding unknown fact and never an
      invented value; no pricing is calculated.

      Extend the herdr adapter boundary so the path is retained without leaking herdr's wire shape
      into core. Keep the Codex parser under its runtime adapter and add committed rollout fixtures
      for both the dropped-opening-prompt evidence and the later identical resend, plus usage and
      quota observations. Tests must distinguish record evidence from an idle/working screen and
      prove the reader returns unknown rather than guessing. Preserve all other runtime adapters,
      strict TypeScript, and historical journal behavior.
    gates:
      - id: codex-reader-proof
        kind: command
        run: pnpm --filter runner exec vitest run test/sessionFacts/codex.test.ts test/herdr/adapter.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: prompt-delivery-facts
    depends_on: [codex-session-reader]
    acceptance: |
      Change prompt delivery so a prompt is taken only when the runtime reader observes the
      opening prompt in the runtime's own session record. A herdr working, blocked, or done status,
      a successful prompt RPC, or a screen line alone never counts as taken. Preserve the existing
      retry count, alternating submit behavior, startup answers, ready settle, and post-abandon
      grace interval; an unknown fact consumes neither false success nor a new retry policy and
      remains subject to those existing retry and grace outcomes.

      Wire the session identity and reader through the runner adapter boundary, record the observed
      facts for the session, and test: a working pane with no record retries; the exact record
      message succeeds; a late record succeeds during existing grace; and a missing/unknown
      record remains honest. Keep runtime-neutral core code and do not change gate execution.
    gates:
      - id: prompt-delivery-proof
        kind: command
        run: pnpm --filter runner exec vitest run test/promptDelivery.test.ts test/sessionDrive.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: session-facts-position
    depends_on: [codex-session-reader]
    acceptance: |
      Make the runner, ledger projection, session inspection, and position consume the latest
      observed session facts. Persist a session-facts observation with its event version and
      upcast it from every historical journal version; retain the latest observation per session
      without overwriting the receipt trail. Render in the current position and session drilldown
      whether the opening prompt was received, the last activity time, raw usage, and a reported
      quota or unknown when unavailable. An old session and an unknown runtime must visibly degrade
      to unknown, while a known Codex record exposes its observed values. Do not convert spend to
      money, use quota for failover, poll in a new watcher, or alter gate judgment.

      Add direct ledger, face, and CLI tests for replay, latest-observation selection, known and
      unknown rendering, empty-versus-unknown usage, and substrate address none. Keep all prior
      event and position fixtures valid and update generated schema reference if the persisted
      shape changes.
    gates:
      - id: facts-position-proof
        kind: command
        run: pnpm --filter ledger exec vitest run test/sessionFacts.test.ts test/replay.test.ts && pnpm --filter face exec vitest run test/render.test.ts test/position.test.ts && pnpm --filter cli exec vitest run test/session/show.test.ts test/graph/show.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: runner-artifact-boundary
    depends_on: []
    acceptance: |
      Keep runner-owned screen snapshots and any other diagnostic capture outside the target
      repository worktree that judgeWorktree checks. The runner may retain the capture for
      drilldown, but its path must be derived from runner-owned state and must not rely on the
      target repository's .gitignore. A fixture target repository with no interlock ignore rule
      must remain clean after capture, so `interlock judge` proceeds to the declared gates rather
      than holding on the snapshot. Preserve the existing best-effort write and last-line
      narration, and do not change what gate commands judge or their scope.

      Add a focused regression using a target repository with no .gitignore entry, assert the
      snapshot is retained at the runner-owned location, assert `git status` has no snapshot path,
      and assert the judge reaches gate execution. Keep test scratch under the package's
      `test/.runs/` directory and clean it with the repository's established plain-rm convention.
    gates:
      - id: artifact-boundary-proof
        kind: command
        run: pnpm --filter runner exec vitest run test/sessionScreen.test.ts test/judgeWorktree.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: brief-authoring-path
    depends_on: []
    acceptance: |
      Document the current brief-authoring contract where a person can find it without
      reverse-engineering another repository: who authors a brief, that it is derived from the
      graph node acceptance and gates plus standing gates, tracked scope, substrate slice and
      supplied role; the canonical path `.interlock/sessions/<graph>/<node>/brief.md`; its
      immutability after session start; and the runner's refusal when the canonical brief is
      absent. Point to the brief@v1 fields and a complete worked example in `docs/shapes.md`, and
      explain that the graph interpreter produces the graph while the session brief is written at
      the canonical path before a node is run. Keep the explanation compatible with address none,
      preserve old briefs, and do not imply that a worker self-declares its role or lowers gates.

      Update the owning design/readme or brief documentation seam and the generated shape reference
      only as needed. Add or extend a read-only documentation/reference check that fails when the
      example or authoring path disappears; no runtime, schema, authority, or gate behavior changes.
    gates:
      - id: brief-reference-proof
        kind: command
        run: pnpm interlock schema reference --check
        expect_output: 'docs/shapes\.md: fresh'

  - id: claude-session-reader
    depends_on: [session-facts-seam]
    acceptance: |
      Confirm the Claude Code session record on this machine with one unattended startup through
      the existing runtime catalogue before writing a parser. If the herdr agent_session identity
      does not resolve to a readable record, do not guess a path or infer from the pane: retain the
      common reader's unknown result, record the exact evidence gap in notes and debrief, and leave
      this node held for a corrected machine-specific plan. If the record is confirmed, implement
      only that observed Claude format behind the same reader seam, extracting opening-prompt
      receipt, latest activity, usage and optional quota, with unknown on missing or malformed data.

      Keep Claude-specific names and file parsing inside its adapter, add a committed fixture from
      the confirmed record, and test positive extraction plus unknown degradation. Do not change
      Codex behavior, pricing, failover, watcher behavior, or gate judgment. The node is not clear
      on a guessed parser; the confirmation and its recorded result are part of its proof.
    gates:
      - id: claude-reader-proof
        kind: command
        run: pnpm --filter runner exec vitest run test/sessionFacts/claude.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: dogfood-codex-facts
    depends_on: [prompt-delivery-facts, session-facts-position, runner-artifact-boundary]
    acceptance: |
      Run this node unattended with `interlock run 0045-session-facts dogfood-codex-facts
      --runtime luna`. The node must reach the runtime without a person re-sending the prompt.
      Its own Codex session record, read through the adapter, must show the opening prompt was
      received, a last activity time, and observed usage; the position must render those facts and
      an explicit unknown for any quota the record does not provide. The session record, not the
      pane or a status heuristic, is the proof of prompt delivery. The runner-owned screen capture
      must not appear as an uncommitted path in the target worktree, and the ordinary standing
      gates plus debrief validation must still be run by the harness. Preserve the record and
      position as receipts; do not add a human gate or alter gate judgment.
    gates:
      - id: codex-facts-position
        kind: command
        run: pnpm --filter cli exec vitest run test/session/show.test.ts test/graph/show.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'

  - id: dogfood-claude-facts
    depends_on: [prompt-delivery-facts, session-facts-position, runner-artifact-boundary, claude-session-reader]
    acceptance: |
      Run this node unattended with `interlock run 0045-session-facts dogfood-claude-facts
      --runtime sonnet` after the Claude reader has confirmed its record. The node must reach that
      runtime without a person re-sending the prompt. Its own Claude session record, read through
      the adapter, must show the opening prompt was received and a last activity time; the
      position must render those facts, observed usage, and quota when the record reports it or
      explicit unknown otherwise. The session record, not the pane or a status heuristic, is the
      proof of prompt delivery. The runner-owned screen capture must not appear as an uncommitted
      target-worktree path. The ordinary standing gates and debrief validation remain harness
      work, and no human gate or gate-judgment change is added.
    gates:
      - id: claude-facts-position
        kind: command
        run: pnpm --filter cli exec vitest run test/session/show.test.ts test/graph/show.test.ts
        expect_output: 'Tests +[1-9][0-9]* passed'
```

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

## Read first

1. `docs/shapes.md`, the graph@v0 section: its fields and a worked example.
2. Every file under `.interlock/graphs/`: real, cleared graphs as the corpus of what a
   well-shaped one looks like -- an ask, a derivation, a read, a human `approved` gate,
   nodes whose acceptance is a sentence a gate can judge, gates that pair an exit code with
   an `expect_output`.

## What you produce

- `.interlock/graphs/0045-session-facts.yaml`, a `graph@v0` document: `id: 0045-session-facts`, the `ask`
  field carrying the request above verbatim, a `derivation` naming this session, and a
  `read` paragraph explaining how you decomposed it.
- Nodes small enough that losing one costs one node's worth of redone work; every node's
  `acceptance` is a sentence a gate can judge pass or fail, not a description of intent.
- Every gate pairs a command's exit code with, where the acceptance calls for it, an
  `expect_output` pattern; a graph-level `approved` gate of kind `human` is required and is
  the only human gate unless the ask itself names another decision only a person can make.
- You never lease or run a node of the graph you produce; that is a separate, later act by a
  person.

## Deliverable

1. `.interlock/graphs/0045-session-facts.yaml`, loading cleanly against the graph loader and its
   schema.
2. `notes.yaml` beside this brief, committed as you go.
3. `debrief.yaml` beside this brief as your final commit.

When the debrief is committed, stop and wait.
