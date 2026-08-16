---
name: reasoning-boundaries
description: Use when implementing or reviewing code that forces readers to switch between different concepts, invariants, lifecycle rules, failure modes, or verification methods, especially when discussing extraction, cohesion, mixed concerns, code structure, or reviewability.
---

# Reasoning Boundaries

## Purpose

Structure code into coherent chunks that can each be understood with one primary mental model. These boundaries should make reading, debugging, changing, testing, and reviewing code easier even when there is only one caller and no expected reuse.

Agents can retrieve semantic slices with search tools, but humans commonly encounter code linearly through files and diffs. Do not use the agent's ability to isolate relevant lines as evidence that the source already supports a clear reading flow.

## Core Principle

Organize code so each chunk has one primary reasoning domain. Introduce a boundary when following the code requires switching between materially different concepts, invariants, lifecycle rules, failure modes, or verification methods.

A reasoning domain may have its own:

- Invariants and lifecycle rules.
- Failure modes and edge cases.
- Reasons to change.
- Testing or verification methods.
- Platform expertise or vocabulary.

Reuse is one reason to create a boundary, but it is not a prerequisite. The useful question is not "How many callers will this have?" It is "What unrelated facts must a reader hold at once to understand and validate this code?"

## Workflow

1. Read the containing file and diff in normal top-to-bottom order, not only as search results.
2. Name the reasoning domains in plain language before choosing an abstraction.
3. Identify the smallest boundary that lets each domain be understood without repeatedly loading unrelated rules.
4. Keep product policy visible where the product behavior is composed.
5. Move mechanical protocol and lifecycle details behind the contract.
6. Re-read the result linearly and check that each chunk now has one primary mental model.

Prefer boundaries that hide knowledge rather than merely move lines. The extracted side should own its invariants completely, while the caller should express intent without knowing the hidden protocol.

## Choosing The Boundary

Use the narrowest boundary that separates the reasoning:

- A local helper when the concern is specific to one module but interrupts its reading flow.
- A plain utility when the concern is a framework-independent mechanism.
- A hook when React lifecycle or state is intrinsic to the concern.
- A component when rendering and interaction form one cohesive UI concept.
- A module when the concern has an independent contract, vocabulary, or verification surface.

Reasoning boundaries are not inherently extraction or file boundaries. An ordered section, named function, local helper, type, component, or module may create a sufficient chunk. Prefer the smallest boundary that improves the reading flow, and create another file only when the concern forms a substantial independent module.

Do not force a component, hook, or generic capability merely to make the caller shorter. Match the boundary to the domain being hidden.

## Example: Pointer-Driven Resize

A pointer-driven panel resize contains at least three reasoning domains:

- DOM drag protocol owns pointer identity, capture, cancellation, event routing, and listener cleanup.
- Product geometry owns the anchor direction, initial dimensions, minimums, viewport bounds, and conversion from drag deltas to size.
- UI orchestration owns whether the panel is open and where its state lives.

A plain pointer-drag utility can own pointer identity, capture, termination, and listener cleanup while passing each pointer event plus caller-defined start data to product code. The caller retains the calculation that interprets pointer coordinates as panel width and height, including anchor direction and constraints.

This deliberately narrow contract matters. Reporting cumulative movement would also impose a coordinate model on the utility, even though gestures may interpret movement from the start, incrementally, along one axis, or in transformed coordinates. The best boundary is not the one that makes the caller shortest; it is the one that completely hides the pointer protocol without absorbing adjacent product geometry. A domain-specific panel wrapper or generic resizable-panel capability would likewise be a worse split if it only hides rendering or bakes accidental product assumptions into a shared abstraction.

The utility is justified because it owns a complete reasoning domain behind a narrow contract, not because another drag interaction might reuse it.

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

## Evaluation Questions

- Can a reader understand and validate this chunk without loading unrelated lifecycle or product rules?
- Does the boundary expose intent and hide a complete set of invariants?
- Are product decisions still visible at the composition site?
- Would a bug clearly belong to one side of the contract?
- Does the boundary improve linear reading and review, not only semantic search?
- Is the navigation cost smaller than the reasoning cost removed?

Reviewability is one practical test of the structure, not its sole purpose. A good reasoning boundary should also make the code easier to enter, debug, modify, and verify.

## Repository Examples

The original review-domain exploration prompts and unedited subagent responses are retained as historical references:

- [Positive examples](references/positive-examples.md)
- [Counterexamples](references/counterexamples.md)
