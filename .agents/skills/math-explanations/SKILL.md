---
name: math-explanations
description: Use when writing or reviewing conceptual mathematical explanations of algorithms or signal processing, including equations and explanatory figures. Not for routine code comments or implementation reference documentation.
---

# Mathematical Explanations

Use mathematics to make an idea easier to understand or reconstruct. Each equation should explain a choice, reveal a useful property, or compress reasoning that would otherwise be cumbersome.

## Develop the Reader's Model

Start with the mechanism the reader can picture and the question the explanation should resolve. Introduce notation after establishing what it names and why it matters. Read the document in order to check what the reader knows at each step, even when the implementation makes every symbol obvious to you.

Choose the narrative around the subject. A filter derivation can proceed by imposing response constraints and showing which coefficients they determine. A time-stretching explanation can proceed through patch placement, a bad join, alignment search, and blending. Do not turn every explanation into a derivation from first principles merely because another document benefited from that structure.

Distinguish requirements, design choices, and consequences. Showing that a choice works does not explain why to choose it, establish that it is necessary, or prove it optimal. State the useful property and its conditions. For example, complementary weights preserve identical overlapping samples, but do not guarantee constant power for different waveforms.

## Let Notation Save Reasoning

Borrow familiar mathematical objects when they simplify the explanation. A window of samples can be a vector, and waveform similarity can be a normalized inner product. Expand into indexed sums only when the expansion teaches something the abstraction hides.

Use the smallest formulation that answers the current question. For a crossfade, `f + a(g - f)` focuses attention on introducing a difference through one changing weight. A full window split into incoming and outgoing halves is useful only when that construction itself needs explaining.

Keep the conceptual model faithful without reproducing every implementation detail. A search interval around a nominal position may be sufficient without separately naming both endpoints. Rounding, buffer cursors, tie-breaking, and exact boundary rules belong in implementation documentation when they do not affect the idea being taught. Briefly distinguish an idealized formulation from an approximation used in code when that difference matters.

## Give Examples and Figures a Job

Keep practical scale where it helps the reader picture the mechanism. A 20 ms patch and a 10 ms hop convey information that abstract sample counts do not. Clearly distinguish small teaching examples from actual settings. Avoid unexplained precision that adds numbers without understanding.

Use examples to resolve a question or expose a failure, rather than merely tracing state. Continue an existing example when it helps connect sections instead of introducing another set of parameters.

Make figures reveal the relevant operation or property. Show waveform patches copied unchanged into different positions, or a single interpolation curve with flat endpoint slopes. Label axes, variables, and what the curves represent. Distinguish weights from audio amplitudes, and nominal positions from adjusted ones. Avoid displaying every implementation concept at once. Render and inspect authored figures before delivering them.

## Keep the Explanation Focused

Maintain one main line of reasoning. Remove repeated explanations and sidebars that interrupt it. When moving from an algorithm to an application, state what new goal the application serves before introducing its equations or integration details.

Appendices still need a clear payoff for their length. A graph and one derivative term may explain a fade's benefit better than a survey of window theory. Link to deeper references instead of reproducing them. Do not preserve low-value material merely by moving it to an appendix.

## Review Before Finishing

- What understanding would the reader lose if this equation, symbol, paragraph, or figure were removed?
- Does each new concept answer a question raised by the preceding explanation?
- Are familiar abstractions simplifying the math, or are we spelling out computation unnecessarily?
- Are claims conditional where needed, and are choices distinguished from guarantees?
- Do examples and figures add understanding rather than repeat prose or expose bookkeeping?
- Does the full document still flow after local edits, including contributions made in parallel?

## Calibration Examples

Read examples only when they help decide the explanatory approach. Treat them as illustrations of these criteria, not fixed templates.

- [WSOLA time stretching](../../../docs/concepts/wsola-time-stretching.md) uses patch placement and alignment to motivate a compact mathematical model. Its Hann appendix gives one focused reason for a design choice.
- `docs/concepts/biquad-filter-prototypes.md`, introduced in [PR #472](https://github.com/hi-ogawa/toy-midi/pull/472), builds filter forms from desired response properties. Its constraint-driven derivation is appropriate because each algebraic step narrows the design. The file may not be present in every checkout.
