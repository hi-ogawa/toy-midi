# MuseScore Score Model Research

## Goal

First-pass research into MuseScore's MIDI import and score model, focused on what this project should learn before designing a minimal MIDI-to-normal-score renderer.

The target behavior is not generic MIDI import. It is compatibility with the notation MuseScore already produces from MIDI files in Hiroshi's bass transcription workflow, with explicit user-provided import assumptions where MIDI alone is not enough.

This is model-level research, not implementation guidance. MuseScore is a large GPL application; we should borrow concepts and boundaries, not code.

## Sources Read

- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi.cpp`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_inner.h`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_chord.h`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_quant.h`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_meter.h`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_meter.cpp`
- `/home/hiroshi/code/others/MuseScore/src/importexport/midi/internal/midiimport/importmidi_operations.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/measure.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/segment.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/chordrest.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/chord.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/note.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/rest.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/tie.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/durationelement.h`
- `/home/hiroshi/code/others/MuseScore/docs/old_docs/ticklength.md`

## Main Finding

MuseScore does not convert MIDI directly into renderable notation. It uses a temporary MIDI-import model for inference, then materializes an engraving score model.

For this project, MuseScore is both a source of architecture ideas and the current accepted oracle for workflow MIDI files. The useful target is not "better than MuseScore"; it is "match the subset of MuseScore behavior that is already good enough for the existing workflow."

That split is still the most useful architectural idea:

1. Keep raw MIDI input in an import/intermediate model while applying explicit import assumptions and constrained inference.
2. Emit a smaller score model only after timing, measures, voices, rests, ties, and durations are resolved enough for notation rendering.
3. Render from the score model, not from raw MIDI notes.

Validation should come from representative `MIDI -> MuseScore` examples from the current workflow, not from arbitrary MIDI files.

## MuseScore's Two Model Layers

### Import Working Model

MuseScore's MIDI import stage uses `MTrack`, `MidiChord`, and `MidiNote` as mutable working structures.

Important traits:

- `MTrack` stores MIDI-derived chords keyed by musical time: `std::multimap<ReducedFraction, MidiChord> chords`.
- `MidiChord` has a `voice`, a note list, a bar index, and tuplet membership.
- `MidiNote` stores pitch, velocity, off-time, original on-time, staccato, tie pointer, and tuplet membership.
- Timing uses rational values (`ReducedFraction`) rather than only integer ticks.

This is not yet the final score. It is an inference workspace.

Terminology note: MuseScore's `Chord`/`MidiChord` means a note-bearing rhythmic event at one onset in one voice. It may contain one pitch or multiple simultaneous pitches. It is not the same thing as a chord symbol or harmonic-analysis object. For these docs and model design, `NoteEvent` or `NoteGroup` may be clearer than `Chord`.

### Engraving Score Model

After inference, MuseScore creates DOM objects:

- `Score`
- `Part` / `Staff`
- `Measure`
- `Segment`
- `ChordRest`
- `Chord`
- `Rest`
- `Note`
- `Tie`
- `Tuplet`

The key structure is `Measure -> Segment -> per-track element`.

`Segment` is especially important: it represents vertical alignment at a tick. A segment has a type, such as clef, key signature, time signature, barline, or chord/rest. A chord/rest segment can hold one element per track, where track effectively encodes staff plus voice.

For our project, this suggests that "segment" is a better normal-score rendering primitive than "note event." Rendering wants aligned time positions, not a flat note list.

## MIDI Import Pipeline Observed

At a high level, MuseScore's `convertMidi` flow is:

1. Read MIDI and merge note-on/note-off pairs.
2. Build temporary tracks and collect note events as initial single-pitch note groups.
3. Extract or infer time signatures, tempo, keys, lyrics, chord names, and instrument info.
4. Detect whether input looks like human performance.
5. Collect notes with matching onsets into note groups using timing tolerances.
6. Adjust notes to detected beats when needed.
7. Merge equal on-times and remove overlapping notes.
8. Split piano/drum material into staves or voices where appropriate.
9. Quantize note-group on-times and note off-times.
10. Detect tuplets.
11. Simplify durations.
12. Separate voices.
13. Split note groups with unequal note durations.
14. Create score instruments/staves.
15. Create measures.
16. Create rests, note groups, notes, ties, tuplets, keys, clefs, time signatures, lyrics, tempo text, and chord names.
17. Connect ties and run later notation/layout behavior.

The exact algorithms are too broad for this project, and many are unnecessary for constrained bass transcription MIDI. The sequencing still matters: measure/voice/duration inference happens before score DOM creation.

## Duration and Rest Modeling

MuseScore treats note/rest spelling as an inference problem, not just `offTime - onTime`.

Useful concepts:

- Durations are represented independent of playback tempo.
- A duration may need to be split at bar boundaries.
- Rests are synthesized for gaps between note-bearing events.
- Notes can be split into multiple written durations connected by ties.
- Rests and notes have different splitting tolerance rules.
- Meter structure affects duration spelling. For example, the duration splitter considers bar divisions, beat levels, compound meter, tuplets, and dot usage.

For this project, the minimum viable model should include written duration fragments, not only original note start/end.

## Concepts Worth Borrowing

- **Two-stage conversion**: import inference model first, notation score model second.
- **Rational musical time**: use fractions or an equivalent exact time representation for score semantics.
- **Measure map**: explicit measures with actual tick ranges and nominal time signatures.
- **Segment model**: aligned events at the same musical position.
- **Note/rest event concept**: note-bearing events and rests both occupy rhythmic duration slots.
- **Voice as a first-class dimension**: even if MVP mostly uses one voice.
- **Rests as generated score events**: gaps should be represented, not implied.
- **Ties as links between written note fragments**: needed after duration splitting.
- **Source provenance**: keep original note IDs/times through inference, like MuseScore keeps original on-time for lyric/chord-name mapping.
- **Import options as assumptions**: quantization level, tuplets, dots, max voices, and pickup handling are not purely objective facts.
- **Golden reference examples**: use MuseScore's imported notation for representative workflow MIDI as acceptance data.

## Concepts to Defer

- Full automatic voice separation.
- Tuplet detection beyond explicit or simple triplet cases.
- Human-performance beat detection.
- Pickup measure inference.
- Key detection and enharmonic spelling sophistication.
- Lyrics, chord symbols, tempo text, drum tracks, grand staff splitting.
- General engraving layout parity with MuseScore.
- MuseScore-style editing DOM behavior.

These are important in a general notation program, but too broad for the first score renderer.

For this use case, several of these can likely be avoided because the score tool can ask for explicit import assumptions such as time signature and quantization. They should only re-enter scope if real MuseScore reference examples require them.

## Implications for the Score Tool

The future model should probably be scoped as a constrained score compiler:

1. Input is isolated MIDI data, not toy-midi internal project data.
2. MuseScore's import output for representative workflow MIDI is currently accepted as correct.
3. Time signature, tempo handling, quantization, and related import assumptions should be explicit user/tool inputs where possible.
4. The first model should assume one part, one staff, and one voice unless a real reference case proves otherwise.
5. The compiler should generate measures, segments, note-bearing events, rests, duration fragments, and ties.
6. Rendering should consume this compiled score model.
7. Tab-specific fields such as string/fret can remain note metadata, but should not shape the first normal-notation model.

The main simplification versus MuseScore is that this tool does not need to infer every musical assumption from MIDI. It can ask the user for import settings before compiling the score model.

The practical research path should be example-driven:

1. Collect a few representative MIDI files from the current workflow.
2. Import them into MuseScore.
3. Inspect the resulting normal notation.
4. Treat those outputs as golden references for model behavior.
5. Only add inference features needed to match those references.

## Minimal First Model Shape

At the scoping level, the first useful model needs these concepts:

- Score
- Part
- Staff
- Measure
- Segment
- Voice
- NoteEvent, with one or more pitches
- Note
- Rest
- Duration
- Tie
- Source reference back to MIDI events/notes

The most important relationship is:

`Measure -> Segment -> Voice event -> NoteEvent/Rest -> Note`

This mirrors the MuseScore idea without taking on its full DOM.

## Suggested First Research Prototype Boundary

The first prototype should not render raw MIDI directly. It should parse MIDI plus explicit import assumptions into a score model, then validate that model against MuseScore reference output for representative workflow MIDI.

It should:

1. Take a small MIDI fixture plus explicit import assumptions.
2. Normalize it into measures.
3. Represent note-bearing events as one onset/duration with one or more pitches.
4. Fill gaps with rests.
5. Split note events at notation boundaries, especially measure boundaries, and represent the resulting pieces as tied fragments.
6. Emit a score model that a normal-notation renderer can walk deterministically.
7. Compare the resulting notation shape against MuseScore's imported output.

This is enough to validate the model before touching tab notation or video.

## Decisions So Far

- Represent time with both MIDI source timing and score-model musical time.
- Keep MIDI ticks/events as source/provenance input.
- Use exact musical fractions, or an equivalent rational representation, for the compiled score model after import normalization.
- Treat import assumptions as explicit score-tool inputs, not toy-midi project data.
- Initial import settings should include at least time signature and quantization/smallest note value.
- Use bass-oriented defaults where reasonable, such as bass clef/instrument defaults.
- Keep less common settings such as pickup handling, tuplets, and tempo fallback as import settings or later advanced options rather than hidden inference.
- For tuplets, follow MuseScore's import behavior for representative workflow MIDI instead of inventing a separate first-pass policy.
- Use one part, one staff, and one voice for the initial bass score model; do not infer part/staff/voice splitting.
- For duration spelling, follow MuseScore's imported notation for representative workflow MIDI rather than choosing a separate readability-vs-literal policy.
- For the first validation renderer, prefer dumping the score model as MusicXML and testing it in existing renderers instead of building a custom notation renderer immediately.
