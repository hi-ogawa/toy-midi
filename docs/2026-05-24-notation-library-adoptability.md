# Notation Library Adoptability Research

## Goal

Evaluate whether an existing notation library can carry the first normal-score rendering phase for the MIDI-to-score workflow, and identify what should remain internal to this project.

This is a library-adoption note, not an implementation plan. The target workflow is still:

1. Start from isolated MIDI data plus explicit import assumptions.
2. Compile that into a small internal normal-score model.
3. Validate the model against MuseScore-like notation.
4. Render enough normal notation to expose model mistakes.
5. Defer tab and video-specific presentation until the normal-score model is stable.

## Main Recommendation

Do not choose a rendering library as the core score model.

Use **MusicXML as the first interchange and validation bridge**, then run shallow rendering spikes with:

1. **OpenSheetMusicDisplay (OSMD)** as the first in-app browser rendering candidate.
2. **Verovio** as an independent SVG/time-map validator and possible long-horizontal SVG renderer.
3. **VexFlow** only if OSMD/Verovio prove too constrained and we need custom layout with a lower-level music glyph/rendering toolkit.

This keeps the project aligned with the current MuseScore workflow while avoiding an early commitment to a renderer whose internal model, layout assumptions, or cursor APIs may not fit the later video/autoscroll/tab workflow.

## Adoptability Criteria

The useful question is not "which renderer is best?" It is "which renderer can be adopted without taking over the model and blocking the target workflow?"

Criteria:

- Accepts MusicXML emitted from our score model.
- Runs in browser, or at least in Node/headless for validation snapshots.
- Produces stable SVG or inspectable drawing output.
- Exposes enough geometry to map score time to rendered x/y positions.
- Supports cursor/follow behavior, or can be layered with our own cursor.
- Can support a single continuous horizontal system, or can approximate it.
- Handles the first normal-score subset: bass clef, time signature, measures, notes, rests, ties, dots, beams/flags, and simple tuplets if needed.
- Does not force MusicXML, MEI, or a renderer-specific graph to become the internal model.
- Has acceptable license, package size, dependency age, and TypeScript/browser integration.
- Does not make future tab/string-fret rendering harder.

## MusicXML Position

MusicXML should be treated as an interchange format and test artifact, not as the internal model.

Reasons:

- It is maintained by the W3C Music Notation Community Group together with SMuFL: <https://www.w3.org/community/music-notation/>.
- MusicXML 4.0 is the latest W3C final report listed by the group, while 4.1 work is active in the community process as of May 2026: <https://www.w3.org/2021/06/musicxml40/>.
- It maps naturally to the validation workflow: our model -> MusicXML -> MuseScore/OSMD/Verovio visual output.
- It is too verbose and interchange-oriented to be a pleasant internal representation for MIDI provenance, import assumptions, segment-level layout, or later video cursor mapping.

Practical use:

- Export `.musicxml` from the compiled score model.
- Compare against MuseScore import/export for representative workflow MIDI.
- Use multiple renderers to catch whether a bug is in our model export or in one renderer.

## Candidate: OpenSheetMusicDisplay

Summary: best first browser-renderer spike.

Useful facts:

- Official docs describe OSMD as a TypeScript library for rendering MusicXML and tabs in browser or browserless/headless environments using VexFlow: <https://opensheetmusicdisplay.org/typescript-library/>.
- The GitHub README says it displays MusicXML in browser/headless Node, exposes options for page format/font/positioning, outputs SVG or PNG, and can display tablature from MusicXML: <https://github.com/opensheetmusicdisplay/opensheetmusicdisplay>.
- The API accepts MusicXML content as a string, XML document, URL, or blob, then `render()` draws it: <https://opensheetmusicdisplay.github.io/usage/typescript/>.
- It exposes cursor objects, cursor options, graphical sheet objects, and bounding-box-related APIs. The cursor can move by entry/measure and expose notes/voices under cursor: <https://opensheetmusicdisplay.github.io/classdoc/classes/Cursor.html>.
- The public API includes properties like `cursors`, `followCursor`, `graphic`, `sheet`, and `rules`: <https://opensheetmusicdisplay.github.io/classdoc/classes/OpenSheetMusicDisplay.html>.
- `EngravingRules` includes many rendering controls, including `RenderSingleHorizontalStaffline`, tab rendering flags, auto-beaming, and debug/bounding-box options: <https://opensheetmusicdisplay.github.io/classdoc/classes/EngravingRules.html>.
- Current npm check on 2026-05-24: `opensheetmusicdisplay@1.9.9`, license `BSD-3-Clause`, unpacked size about 1.8 MB.

Adoption positives:

- Directly fits a web app.
- MusicXML in, SVG/PNG out is exactly useful for first validation rendering.
- TypeScript library with a visible object model and renderer options.
- Cursor and graphical model APIs may be enough for an early playback cursor.
- Tab support from MusicXML may become useful later, even if not trusted yet for bass-specific string/fret workflow.
- BSD-3-Clause is straightforward for dependency use.

Risks:

- Current npm package depends on `vexflow@1.2.93`, while standalone VexFlow latest is `5.0.0`. That means OSMD's rendering stack may be mature but old; internal APIs may not match current VexFlow docs.
- Geometry/cursor APIs exist, but the spike must verify whether they are stable and sufficient for deterministic tick-to-x mapping.
- `RenderSingleHorizontalStaffline` exists as an option, but we should not assume it produces the exact continuous recording layout we want without testing.
- If we need precise layout control later, OSMD may become a renderer probe rather than the final renderer.

Adoption stance:

Use OSMD first for a thin prototype:

`compiled score model -> MusicXML -> OSMD SVG -> inspect geometry/cursor behavior`

Do not build our internal model around OSMD classes.

## Candidate: Verovio

Summary: strong independent validator; possible single-horizontal SVG renderer; less likely as the main in-app renderer.

Useful facts:

- Official docs describe Verovio as a music notation engraving library designed for MEI, fast/light/flexible, with no dependencies: <https://book.verovio.org/advanced-topics/layout-options.html>.
- It can render pages to SVG and render a timemap: <https://book.verovio.org/toolkit-reference/toolkit-methods.html>.
- It can return timing for elements after MIDI rendering, including score-time onset/offset and real-time onset/offset for an element: <https://book.verovio.org/toolkit-reference/toolkit-methods.html>.
- It has layout controls for page size, page breaks, no breaks, adjusted page width/height, and content spacing. Setting breaks to `none` outputs a single system containing the full content, with a warning that the SVG can become very large: <https://book.verovio.org/advanced-topics/layout-options.html>.
- Current npm check on 2026-05-24: `verovio@6.2.0`, license `LGPL-3.0-or-later`, unpacked size about 25.8 MB.

Adoption positives:

- High-quality SVG output.
- Independent implementation is useful for cross-checking OSMD/MuseScore output.
- Single-system rendering is explicitly supported through layout options.
- Timemap and element time APIs are directly relevant to playback mapping.
- Modern active package.

Risks:

- MEI is the native model; MusicXML goes through conversion/import behavior.
- LGPL-3.0-or-later requires more care than BSD/MIT dependencies, especially if bundled in the app.
- The package is much larger than OSMD.
- It may be better for generated SVG snapshots than for interactive in-app editing/playback UI.

Adoption stance:

Use Verovio as a validation renderer and timing/geometry research tool. Consider it for final SVG snapshot generation only after checking license/distribution implications and whether its single-system output stays practical for long bass covers.

## Candidate: VexFlow

Summary: lower-level fallback if we decide to own layout.

Useful facts:

- Official site describes VexFlow as HTML5 music engraving and points users to EasyScore for adding notation to apps: <https://www.vexflow.com/>.
- Current npm check on 2026-05-24: `vexflow@5.0.0`, license `MIT`, TypeScript declarations included, outputs to Canvas and SVG, unpacked size about 21.3 MB.

Adoption positives:

- MIT license.
- Browser and Node usable.
- Good fit if we want to own `score model -> layout model -> display list` but avoid drawing every glyph manually.
- Modern TypeScript package.

Risks:

- It does not consume MusicXML directly.
- It expects caller code to create notation elements and systems; this shifts layout responsibility back to us.
- It is too low-level for the first validation renderer unless OSMD/Verovio fail basic needs.

Adoption stance:

Keep as a later custom-renderer dependency candidate. It should not be the first renderer spike because it would force us to solve layout before validating the model.

## Candidate: MuseScore CLI / Export

Summary: oracle/reference path, not app renderer.

Adoption positives:

- Matches the user's current accepted workflow.
- Useful for golden references: import MIDI in MuseScore, export MusicXML/SVG/PDF, compare notation shape.

Risks:

- Desktop/external dependency, not suitable as an in-app renderer.
- GPL/application boundary means we should treat it as a reference tool, not code to integrate.

Adoption stance:

Use it for test fixture generation and comparison only.

## Candidate: LilyPond

Summary: high-quality reference engraver, likely not useful for first app integration.

Adoption positives:

- Excellent engraving output.
- Useful as a possible reference renderer for static output.

Risks:

- Text-based engraver, not a browser rendering library.
- Not aligned with interactive cursor/autoscroll needs.
- Adds another conversion target that is less central to the existing MuseScore/MusicXML workflow.

Adoption stance:

Defer unless we later need high-quality static engraving comparison.

## Candidate: MEI / MNX

Summary: important ecosystem context, not the first project contract.

MEI is powerful and pairs naturally with Verovio, but it is more semantically rich than needed for this constrained bass workflow. MNX is active in the W3C Music Notation Community Group, but MusicXML remains the pragmatic interchange path for current tools.

Adoption stance:

Do not use MEI or MNX as the first internal/export contract. Let Verovio convert MusicXML during validation and revisit only if MusicXML becomes a blocker.

## Proposed Spike Plan

First spike should answer adoption questions, not build production rendering.

1. Create or collect one tiny representative MusicXML sample equivalent to a simple bass MIDI import result.
2. Render it with OSMD in the app or a minimal local page.
3. Check whether OSMD can:
   - render with bass clef/time signature/measures/notes/rests/ties;
   - render as SVG;
   - expose note/measure bounding boxes or enough graphical model data;
   - move/follow a cursor deterministically;
   - approximate a single horizontal staffline.
4. Render the same MusicXML with Verovio.
5. Check whether Verovio can:
   - render single-system SVG with `breaks: none`;
   - expose useful element IDs in SVG;
   - produce a timemap;
   - keep output size practical for a moderately long bass line.
6. Compare both renderings against MuseScore's import/export for the same musical content.

## Decision Gate

After the spike:

- If OSMD exposes sufficient geometry and cursor control, use OSMD for the first normal-score display phase.
- If OSMD renders well but geometry is insufficient, use OSMD only as a visual validator and build our own cursor overlay from MusicXML/model timing where possible.
- If OSMD cannot support the horizontal/video workflow, keep it as a validation renderer and prototype custom layout, likely with VexFlow or direct SVG/SMuFL drawing.
- If Verovio's single-system SVG plus timemap is practical and license/distribution is acceptable, consider it for generated preview/snapshot output.
- Regardless of renderer choice, keep the internal score model independent and keep MusicXML as an export/check format.

## Current Direction

The direction remains:

`MIDI + import assumptions -> internal score model -> MusicXML export -> OSMD/Verovio validation -> renderer adoption decision`

The first library adoption decision should be based on a real spike with representative workflow content, not on API surface alone.
