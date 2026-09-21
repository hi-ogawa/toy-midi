---
name: math-explanations
description: Write or review conceptual math documentation for algorithms and signal processing.
---

# Mathematical Explanations

Aim for compact explanations that make a mechanism or design reconstructable. Use equations to reveal a property, explain a choice, or replace cumbersome reasoning.

## Narrative

Separate mathematical fluency from domain familiarity. Motivate unfamiliar constructions through simple examples, then trust the reader with familiar algebra. Let the subject determine the approach rather than imposing a derivation template.

Preserve the problem, assumptions, and motivation when shortening or splitting an article. Cut repeated previews, summaries, and implementation bookkeeping. Each section should have a clear payoff, including appendices. Headings should name concepts and group supporting calculations.

Distinguish chosen constructions from necessary consequences and guarantees. Keep conditions that affect the claim without reproducing every implementation boundary case.

## Equations and Figures

Use familiar abstractions to save reasoning, such as comparing window vectors with an inner product instead of expanding sample sums. Introduce notation when it earns its place.

Give examples and figures a purpose. Practical scales help readers picture a mechanism; compact SVGs embedded in Markdown can make relationships apparent at a glance. Choose the representation for that purpose, rather than displaying all available detail.

Read relevant examples in [docs/concepts](../../../docs/concepts) for calibration, not as fixed templates.

## Known Math Rendering Issues

In GitHub Markdown math, `\,` and `\;` have rendered as literal punctuation. Use `\cdot` for explicit multiplication and `\quad` for extra spacing.
