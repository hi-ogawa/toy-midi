# Score Model and Renderer Scope

## Problem Context

Explore a future score renderer as a focused extension of the transcription workflow.

The current real workflow is:

1. Transcribe bass in toy-midi.
2. Export MIDI.
3. Import that MIDI into MuseScore.
4. Let MuseScore infer normal notation.
5. Add a linked part with tab.
6. Manually adjust string/fret choices.
7. Record MuseScore playback with desktop screen recording.

For this use case, MuseScore's MIDI import result is already good enough. The goal is not to solve arbitrary MIDI-to-score inference. The goal is to bring the useful parts of the current MuseScore-based workflow into toy-midi.

The first score MVP should operate from toy-midi's note data plus project settings, not from re-parsed MIDI. MIDI remains an equivalent interchange/export path for this workflow, but using toy-midi's `Note[]`, tempo, and time signature directly should make the first implementation and tests simpler.

The current optimistic path is MusicXML-first: convert toy-midi project data into normal score notation, render it with an existing browser notation renderer, then add bass-tab and video-oriented workflow pieces.

## Current Scope

1. Export MusicXML from toy-midi note data and project settings.
2. Integrate browser rendering for generated MusicXML.
3. Use that rendered score as the first normal-notation preview inside toy-midi.

## Current Optimistic MVP Plan

Happy-path MVP direction:

1. Export MusicXML directly from toy-midi project data.
   - Convert `Note[]`, tempo, and time signature into minimal normal notation.
   - Emit MusicXML with one part, one staff, one voice, bass clef, measures, rests, notes, and ties.
2. Render notation inside toy-midi.
   - Integrate a browser MusicXML renderer, likely OSMD.
   - Render generated MusicXML on the fly from current project state.
   - Show this as the first normal-score preview.
3. Shape the score-preview app workflow.
   - Decide preview placement, refresh behavior, scroll behavior, and export/download controls.
   - Keep this focused on normal notation first.
4. Add bass tab metadata and rendering.
   - Extend toy-midi note metadata with string/fret choices.
   - Render linked bass tab from the same musical data.
   - Support manual string/fret adjustment in the toy-midi workflow.
5. Add video-oriented presentation.
   - Continuous horizontal score/tab layout.
   - Playback cursor and autoscroll.
   - Screen-recording-friendly display mode.

## Important Boundaries

- Do not re-parse exported MIDI as the first score feature input.
- Do not build a custom normal-notation renderer before trying MusicXML rendering.
- Do not scope this as a MuseScore clone.
- Keep tab notation downstream of normal notation export/rendering.
- Keep video workflow concerns downstream of score/tab preview.

## Research Notes

Research note: [2026-05-24-musescore-score-model-research.md](2026-05-24-musescore-score-model-research.md)
Renderer research note: [2026-05-24-musescore-renderer-research.md](2026-05-24-musescore-renderer-research.md)
Notation library adoptability note: [2026-05-24-notation-library-adoptability.md](2026-05-24-notation-library-adoptability.md)
