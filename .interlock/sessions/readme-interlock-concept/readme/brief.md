---
interlock: brief@v1
graph: readme-interlock-concept
node: readme
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: readme-whitespace
    kind: command
    run: git diff 1aef03d --check
  - id: readme-assets
    kind: command
    run: >-
      node --input-type=module -e "import {readFileSync,existsSync} from 'node:fs';
      const text=readFileSync('README.md','utf8');
      const files=['docs/brand/interlock-wordmark.png','docs/brand/interlock-concept.svg','docs/brand/interlock-concept-mobile.svg','docs/brand/interlock-critical-path.svg'];
      if(files.some(file=>!existsSync(file)||!text.includes(file)))throw Error('A README asset is missing or unused');
      if(/<style|<script|style=|class=|file:\/\/|127\.0\.0\.1|\/Users\//i.test(text))throw Error('README contains local-only styling or paths');
      console.log('README assets and markup checked');"
    expect_output: README assets and markup checked
scope:
  - README.md
  - docs/brand
  - scripts/check-readme.ts
  - .interlock/sessions/readme-interlock-concept/readme
substrate:
  address: none
---

## Acceptance

Convert the selected local presentation to supported GitHub Markdown, retaining the wordmark,
keystone explanation, proof and control narrative, and critical-path diagram. Keep explanatory
text as text. Refresh status against the branch's code. Inspect the result on GitHub and open
a draft pull request, without merging or modifying the active development checkout.

## Context slice

Use the selected wordmark and existing SVG diagrams. The design notes and implementation are
the authority for product claims. The CLI now has node cancel, node reset, and gate waive.
Do not quote session histories or the supplied private report in presentation copy.

## Constraints

No runtime behavior changes, new dependencies, or weakening of the repository's standing gates.
The local HTML is a presentation reference, not a GitHub rendering. Replace its custom layout
with native Markdown and allowed HTML. Public links must be repository-relative or canonical.

This is directly authored documentation; the harness backfill path will independently execute
the gates against the committed branch. It must not be described as a runner-launched session.

## Deliverable

README.md, the referenced brand assets and their usage note, the README check, and this session's
notes and authored debrief. Push only this branch and open a draft PR under the user's authority.
