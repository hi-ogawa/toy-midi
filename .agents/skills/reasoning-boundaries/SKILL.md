---
name: reasoning-boundaries
description: >-
  Use for an explicit architectural review where the primary question is whether
  responsibilities should remain together or be separated across a helper, hook,
  component, or module. Do not use for routine implementation, bug fixes, or code
  review merely because the change touches those constructs.
---

# Reasoning Boundaries

## Purpose

Structure code into coherent chunks that can each be understood with one primary mental model. A boundary can improve reading, debugging, changing, testing, and reviewing code even with one caller and no expected reuse.

Humans commonly encounter code linearly through files and diffs. The agent's ability to retrieve isolated lines with search does not establish that the source has a clear reading flow.

## Decision Criteria

Read enough surrounding code and the relevant diff to assess linear reading flow. Consider which unrelated facts a reader must hold at once to understand and validate the code, such as different invariants, lifecycle rules, failure modes, or verification methods.

Prefer the smallest boundary that removes a meaningful reasoning cost. An ordered section, named function, or local helper may be sufficient. A separate module is useful when the concern has an independent contract, vocabulary, or verification surface. Choose a hook when React lifecycle or state is intrinsic to the concern, and a component when rendering and interaction form one cohesive UI concept.

When protocol or lifecycle mechanics form a distinct domain, a boundary should hide that knowledge and own its invariants completely. Keep the adjacent product decisions visible where the behavior is composed. Judge the result by whether readers can understand each side without repeatedly loading the other's rules.

Keep code together when its parts share invariants, change together, and are verified together. Length, a shorter caller, an available helper name, or speculative reuse do not justify extraction. Naming and navigation costs should be smaller than the reasoning cost removed, and splitting one correctness argument across files can make it harder to follow.

## Examples

### Separating Pointer Protocol From Panel Geometry

A panel resize can mix pointer identity, capture, cancellation, and listener cleanup with product rules for anchor direction, minimum dimensions, and viewport bounds. A pointer-drag utility can own the protocol while the caller interprets movement as panel size. This boundary is useful even for one consumer because it hides a complete set of lifecycle rules.

One possible contract passes pointer events and caller-defined start data to the geometry code. That preserves the caller's choice of coordinate model. A delta-based contract may be appropriate when the mechanism intentionally owns that model. Choose based on the actual responsibility of the utility, rather than treating either event shape as a universal rule.

### Keeping Geometry Together

A resize calculation may select an anchor, convert movement to a proposed dimension, and clamp it to the available space. If these steps express one sizing rule and are verified together, keep them in one coherent chunk. Extracting each arithmetic step would add navigation without hiding an independent domain.

## Historical References

Read these only when repository examples would help resolve a boundary decision. They retain the original exploration prompts and unedited subagent responses as historical context, rather than prescribing a workflow:

- [Positive examples](references/positive-examples.md)
- [Counterexamples](references/counterexamples.md)
