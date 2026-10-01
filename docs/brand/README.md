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
- The lifecycle strip comes first in the README, under the paragraph that says what Interlock does,
  and shows where the implemented loop asks for proof: approval before work, gates after it. It is
  a map of the loop, not a picture of a product screen; real output belongs in the README as text.
  The concept strip, which explains the symbol itself, opens the section on kinds of proof.
- Light mode uses warm paper; dark mode uses muted ink paper. The blue condition and gold
  completion keep their meaning, with adjusted brightness rather than an inverted palette.

## Assets

| Asset | Purpose |
| --- | --- |
| [interlock-wordmark.png](interlock-wordmark.png) | Selected raster wordmark, including its print texture. |
| [interlock-wordmark-dark.png](interlock-wordmark-dark.png) | The same wordmark recolored for ink paper. |
| [interlock-concept.svg](interlock-concept.svg) | A condition, the evidence that fits it, and work continuing. |
| [interlock-concept-dark.svg](interlock-concept-dark.svg) | The same strip in dark mode. |
| [interlock-lifecycle.svg](interlock-lifecycle.svg) | Plan, approval, work, gates, cleared, with the two interlocks drawn as completed loops. |
| [interlock-lifecycle-dark.svg](interlock-lifecycle-dark.svg) | The same strip in dark mode. |

Keep the substantive explanation in Markdown. Image text needs a nearby text equivalent and useful
alternative text; an image must not become the only place an important qualification appears.
Avoid styling the README with CSS or treating its diagrams as a substitute for real product state.

## One drawing per theme, legible at every width

Each README picture has exactly two sources, chosen by theme alone: a
`(prefers-color-scheme: dark)` source and a `(prefers-color-scheme: light)` source, with the light
image as the `img` fallback. There is no width-based art direction. A `max-width` media query tests
the window, not the README column, which is narrower and changes with GitHub's sidebar; and
GitHub's `themed-picture` element rewrites any source that mentions `prefers-color-scheme` when a
viewer picks a fixed theme, discarding whatever width condition was combined with it. Both made
narrow portrait art appear on desktop.

So each diagram is one horizontal drawing per theme, sized for the narrowest real column. GitHub
gives a README about 294 px on a 360 px phone and 838 px on a wide desktop window. Rendered text
size is the font size times the column width over the viewBox width, so the strips use a 760-unit
viewBox with 27-unit labels: about 10 px at 294 px and 21 px at the README's 600 px display width.
Labels stay to a word or three; sentences go in the Markdown beside the image. Text inside the
diagrams has at least 4.5:1 contrast against its paper background.

The wordmarks are generated artwork derived from the selected concept, stored at 1380 px wide,
a little over twice their display width. The diagrams are editable SVGs with complementary loop
and keystone paths, without scripts or embedded HTML. Each dark SVG differs from its light
counterpart only in color: a layout fix must apply to both. `scripts/check-readme.ts` guards that
equivalence, theme-only picture sources with the light drawing as fallback, alternative text, label
size at the 294 px column, and text contrast against each drawing's own paper. No gate runs it yet;
run `node scripts/check-readme.ts` from the repository root after changing the README or an asset.
