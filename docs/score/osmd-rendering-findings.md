# OSMD Rendering Findings

## Context

The standalone score viewer prototype renders Toy MIDI's standard-notation and bass-TAB MusicXML with OpenSheetMusicDisplay (OSMD). The result is readable enough for the cover-recording workflow, but comparison with the current MuseScore presentation exposes several visual and behavioral differences.

The current rendering is sufficient for cover recording. The remaining priorities focus on notation correctness and rhythmic readability rather than matching MuseScore's engraving.

## Findings

- **Beaming.** MuseScore groups eighth and sixteenth notes with beams, while the current OSMD rendering shows many of the same notes with individual flags. Determine whether OSMD auto-beaming is sufficient before changing the MusicXML exporter to emit explicit beam data.
- **System density and wrapping.** OSMD uses wider horizontal spacing and fits fewer measures into each system than MuseScore. The current result is acceptable, although future recording layout work may tune it to consistently show two useful system rows.
- **Section labels.** The MuseScore reference includes boxed rehearsal marks such as A, B, and C. Toy MIDI locators are not currently exported as score directions or rendered as section labels.
- **TAB rhythm decoration.** OSMD's TAB staff shows fret numbers and ties but omits much of MuseScore's TAB-side rhythmic decoration, including stems, beams, and rests. This is low priority because the linked standard staff already carries the rhythmic information.
- **General engraving polish.** OSMD uses a more prominent brace and connected barlines. MuseScore also has more compact ties, refined stem placement, denser vertical alignment, and stronger collision handling. These differences can remain deferred unless a concrete passage becomes ambiguous or visually broken.
- ~~**Measure numbering.** OSMD shows measure numbers at a different cadence from MuseScore, which primarily labels system starts in the reference presentation.~~ Resolved with `drawMeasureNumbersOnlyAtSystemStart`.
- ~~**Full-rest measures.** OSMD automatically collapses consecutive full-rest measures into numbered multi-measure rests by default.~~ Resolved by disabling `autoGenerateMultipleRestMeasuresFromRestMeasures` so individual measures preserve the score timeline and cursor progression.

## Tracked Separately

- **Playback cursor and system following.** OSMD's built-in cursor advances between score entries rather than interpolating continuously. Continuous cursor geometry and automatic progression through wrapped systems are tracked in `playback-cursor-research.md` rather than prioritized as engraving work here.
- **Key signature and accidental spelling.** Toy MIDI exports sharp-only chromatic spelling and a placeholder C-major key signature. Renderer work is blocked on adding project key data and key-aware MusicXML spelling, which is tracked in issue #220.

## Current Prototype Assessment

The standard staff and TAB communicate the required notes, rhythms, and string/fret assignments together. The reduced TAB decoration does not remove musical information because the standard staff remains visible above it. Beaming is the main remaining score-rendering improvement that can be investigated independently.
