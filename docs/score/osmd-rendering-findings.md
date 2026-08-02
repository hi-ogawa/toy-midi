# OSMD Rendering Findings

## Context

The standalone score viewer prototype renders Toy MIDI's standard-notation and bass-TAB MusicXML with OpenSheetMusicDisplay (OSMD). The result is readable enough for the cover-recording workflow, but comparison with the current MuseScore presentation exposes several visual and behavioral differences.

The current rendering is sufficient for cover recording. The remaining priorities focus on notation correctness and rhythmic readability rather than matching MuseScore's engraving.

## Findings

- ~~**Beaming.** MuseScore groups eighth and sixteenth notes with beams, while the current OSMD rendering shows many of the same notes with individual flags.~~ Resolved with OSMD `autoBeam`; explicit MusicXML beam data is unnecessary for the viewer.
- ~~**System density and wrapping.**~~ Resolved by matching the actual score render width before comparing engraving density. The MuseScore reference was `1110px` wide, while the original OSMD capture was only `842px`. At the viewer's `1110px` default, OSMD naturally fits four measures per system with its default spacing. Score width remains adjustable from `600px` to `1600px`.
- **Section labels.** The MuseScore reference includes boxed rehearsal marks such as A, B, and C. Toy MIDI locators are not currently exported as score directions or rendered as section labels.
- **TAB rhythm decoration.** OSMD's TAB staff shows fret numbers and ties but omits much of MuseScore's TAB-side rhythmic decoration, including stems, beams, and rests. This is low priority because the linked standard staff already carries the rhythmic information.
- **General engraving polish.** OSMD uses a more prominent brace and connected barlines. MuseScore also has more compact ties, refined stem placement, denser vertical alignment, and stronger collision handling. These differences can remain deferred unless a concrete passage becomes ambiguous or visually broken.
- ~~**Measure numbering.** OSMD shows measure numbers at a different cadence from MuseScore, which primarily labels system starts in the reference presentation.~~ Resolved with `drawMeasureNumbersOnlyAtSystemStart`.
- ~~**Full-rest measures.** OSMD automatically collapses consecutive full-rest measures into numbered multi-measure rests by default.~~ Resolved by disabling `autoGenerateMultipleRestMeasuresFromRestMeasures` so individual measures preserve the score timeline and cursor progression.

## Tracked Separately

- **Playback cursor and system following.** OSMD's built-in cursor advances between score entries rather than interpolating continuously. Continuous cursor geometry and viewport following through wrapped systems are tracked in `playback-cursor-research.md` rather than prioritized as engraving work here. Following means keeping the active-system cursor visible, not enforcing an exact visible system count or fixed scroll increment.
- ~~**Key signature and accidental spelling.**~~ Resolved by #222. Toy MIDI now persists project key signatures and exports key-aware MusicXML pitch spelling; the viewer renders that exported metadata through OSMD.

## Current Prototype Assessment

The standard staff and TAB communicate the required notes, rhythms, and string/fret assignments together. The reduced TAB decoration does not remove musical information because the standard staff remains visible above it.
