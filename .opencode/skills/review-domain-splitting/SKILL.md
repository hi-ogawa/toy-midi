---
name: review-domain-splitting
description: Use when implementing or reviewing a change that mixes code with different correctness arguments, invariants, failure modes, or verification methods, especially when discussing extraction, cohesion, mixed concerns, review domains, or human-review structure.
---

# Review-Domain Splitting

## Purpose

Structure code so a human can review each concern with one coherent mental model. Treat reviewability as a reason to create a boundary even when there is only one caller and no expected reuse.

Agents can retrieve semantic slices with search tools, but humans commonly encounter code linearly through files and diffs. Do not use the agent's ability to isolate relevant lines as evidence that the source is already well structured.

## Core Principle

Split adjacent code when its parts require materially different correctness arguments.

A review domain may have its own:

- Invariants and lifecycle rules.
- Failure modes and edge cases.
- Reasons to change.
- Testing or verification methods.
- Platform expertise or vocabulary.

Reuse is one reason to extract code, but it is not a prerequisite. The useful question is not "How many callers will this have?" It is "What unrelated facts must a reviewer hold at once to validate this change?"

## Workflow

1. Read the containing file and diff in normal top-to-bottom order, not only as search results.
2. Name the correctness domains in plain language before choosing an abstraction.
3. Identify the smallest contract that lets each domain be reviewed independently.
4. Keep product policy visible where the product behavior is composed.
5. Move mechanical protocol and lifecycle details behind the contract.
6. Re-read the resulting diff linearly and check that each section now has one primary correctness argument.

Prefer boundaries that hide knowledge rather than merely move lines. The extracted side should own its invariants completely, while the caller should express intent without knowing the hidden protocol.

## Choosing The Boundary

Use the narrowest boundary that separates the reasoning:

- A local helper when the concern is specific to one module but interrupts its reading flow.
- A plain utility when the concern is a framework-independent mechanism.
- A hook when React lifecycle or state is intrinsic to the concern.
- A component when rendering and interaction form one cohesive UI concept.
- A module when the concern has an independent contract, vocabulary, or verification surface.

Do not force a component, hook, or generic capability merely to make the caller shorter. Match the boundary to the domain being hidden.

## Example: Pointer-Driven Resize

A pointer-driven panel resize contains at least three review domains:

- DOM drag protocol owns pointer identity, capture, cancellation, event routing, and listener cleanup.
- Product geometry owns the anchor direction, initial dimensions, minimums, viewport bounds, and conversion from drag deltas to size.
- Editor orchestration owns whether the panel is open and where session UI state lives.

A plain pointer-drag utility can report cumulative movement while hiding the DOM protocol. The editor can retain the small calculation that turns movement into the score preview's width and height. A score-specific panel wrapper or generic resizable-panel capability would be a worse split if it only hides JSX or bakes accidental product assumptions into a shared abstraction.

The utility is justified by the separate correctness domain, not by a prediction that another drag interaction will reuse it.

## Guardrails

Do not split code merely because:

- A block is long.
- A helper name can be invented.
- The extracted code might someday be reused.
- A shorter caller looks cleaner in isolation.

Keep code together when its parts share the same invariants, change together, and are verified together. Every boundary adds naming and navigation cost, so it should remove a larger reasoning cost.

Watch for these failure modes:

- Reuse-only reasoning: rejecting a boundary because it has one consumer.
- Search-view bias: accepting a mixed file because tools can retrieve the relevant lines.
- Wrapper extraction: moving markup without hiding a distinct correctness domain.
- False generalization: promoting domain-specific policy into a generic primitive.
- Fragmentation: distributing one correctness argument across several files.

## Review Questions

- Can a reviewer validate this section without loading unrelated lifecycle or product rules?
- Does the boundary expose intent and hide a complete set of invariants?
- Are product decisions still visible at the composition site?
- Would a bug clearly belong to one side of the contract?
- Does the split improve a linear file and diff review, not only semantic search?
- Is the navigation cost smaller than the reasoning cost removed?
