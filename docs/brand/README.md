# Interlock's presentation assets

The same shape carries the identity and the explanation. An open blue loop represents a condition
that has not been met. A matching gold piece completes it when the declared evidence is accepted.
Completion permits the next action; this is not a padlock whose closed state prohibits movement.

The wordmark uses these two states as its **c** and **o**. The diagrams repeat that geometry so the
reader can learn one symbol and recognize it throughout the documentation.

## Keep the distinction visible

- Blue identifies the condition; gold identifies its completion. Labels state the meaning too,
  so color alone does not carry status.
- An open symbol does not identify a particular gate state by itself. Its label distinguishes
  waiting for judgment from other unmet conditions.
- The critical-path drawing is an illustrative dependency graph, not a live product interface.
- Light mode uses warm paper; dark mode uses muted ink paper. The blue condition and gold
  completion keep their meaning, with adjusted brightness rather than an inverted palette.

## Assets

| Asset | Purpose |
| --- | --- |
| [interlock-wordmark.png](interlock-wordmark.png) | Selected raster wordmark, including its print texture. |
| [interlock-wordmark-dark.png](interlock-wordmark-dark.png) | The same wordmark recolored for ink paper. |
| [interlock-concept.svg](interlock-concept.svg) | A condition, its matching evidence, and continuation. |
| [interlock-concept-dark.svg](interlock-concept-dark.svg) | The same geometry and explanation in dark mode. |
| [interlock-concept-mobile.svg](interlock-concept-mobile.svg) | The same explanation arranged vertically for narrow screens. |
| [interlock-concept-mobile-dark.svg](interlock-concept-mobile-dark.svg) | Narrow-screen explanation in dark mode. |
| [interlock-critical-path.svg](interlock-critical-path.svg) | A held decision on the delivery path beside work that can proceed. |
| [interlock-critical-path-dark.svg](interlock-critical-path-dark.svg) | The same dependency drawing in dark mode. |
| [interlock-critical-path-mobile.svg](interlock-critical-path-mobile.svg) | A vertical delivery path with a separate examples branch. |
| [interlock-critical-path-mobile-dark.svg](interlock-critical-path-mobile-dark.svg) | Narrow-screen dependency drawing in dark mode. |

Keep the substantive explanation in Markdown. Image text needs a nearby text equivalent and useful
alternative text; an image must not become the only place an important qualification appears.
Avoid styling the README with CSS or treating its diagrams as a substitute for real product state.

The README uses GitHub-supported `picture` sources rather than page CSS. Combined dark/narrow
sources precede dark/wide sources; the ordinary image is always a light-mode fallback. This keeps
both themes readable without requiring a single compromise palette. Text inside the diagrams has
at least 4.5:1 contrast against its paper background.

The wordmarks are generated artwork derived from the selected concept. The diagrams are editable
SVGs with complementary loop and keystone paths, without scripts or embedded HTML. Each dark SVG
differs from its light counterpart only in color: a layout fix must apply to both. The README check
guards that equivalence, source selection at the breakpoint, alternative text, and text contrast.
