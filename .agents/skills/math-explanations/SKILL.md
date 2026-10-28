---
name: math-explanations
description: Write or review conceptual math documentation for algorithms and signal processing.
---

# Mathematical Explanations

Aim for compact explanations that make a mechanism or design reconstructable. Use equations to reveal a property, explain a choice, or replace cumbersome reasoning.

## Narrative

Separate mathematical fluency from domain familiarity. Motivate unfamiliar constructions through simple examples, then trust the reader with familiar algebra. Let the subject determine the approach rather than imposing a derivation template.

Order the argument from the question a reader would ask and the computation the code performs, rather than the field's standard construction order, and introduce the standard term once the reasoning arrives at it. When revising a passage after feedback, reread the surrounding argument as a whole, since a patched sentence can keep a framing the new material no longer fits.

Preserve the problem, assumptions, and motivation when shortening or splitting an article. Cut repeated previews, summaries, and implementation bookkeeping. Each section should have a clear payoff, including appendices. Headings should name concepts and group supporting calculations.

Distinguish chosen constructions from necessary consequences and guarantees. Keep conditions that affect the claim without reproducing every implementation boundary case.

## Equations and Figures

Use familiar abstractions to save reasoning, such as comparing window vectors with an inner product instead of expanding sample sums. Introduce notation when it earns its place.

Give examples and figures a purpose. Practical scales help readers picture a mechanism; compact SVGs embedded in Markdown can make relationships apparent at a glance. Choose the representation for that purpose, rather than displaying all available detail.

Read relevant examples in [docs/concepts](../../../docs/concepts) for calibration, not as fixed templates.

## Known Math Rendering Issues

In GitHub Markdown math, `\,`, `\;`, and `\!` have rendered as literal punctuation. Use `\cdot` for explicit multiplication and `\quad` for extra spacing, and leave negative spacing out. GitHub also rejects `\operatorname`, so write a named function such as sech or sinc with `\text{sech}`. A `$` directly followed by a letter or digit doesn't close inline math, so `$n$th` renders as plain text. Write an ordinal as `$n$-th` instead.

Claude's Markdown preview also reads a `$` followed by two letters as a variable such as `$HOME`, so `$LF_s$` stays plain text there. Put a space between the first two letters, as in `$L F_s$`, which renders the same everywhere else. The preview doesn't render GitHub's ``$`…`$`` form either, so write plain `$…$`. It also leaves inline math of about 60 characters or more as plain text, so move a longer formula into a display block or split it into shorter spans.

An underscore right after a `}` can pair with a later one as Markdown emphasis, so in `$\mathbf{x}_0$ and $\mathbf{x}_\tau$` the text between them turns italic. Leave out the braces, as in `$\mathbf x_0$`.
