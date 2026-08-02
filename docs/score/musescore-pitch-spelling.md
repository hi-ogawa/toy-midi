# MuseScore Pitch Spelling

Research against MuseScore Studio commit `81d6e245` (2026-05-22) shows that it stores sounding MIDI pitch separately from tonal pitch class (TPC), which preserves the written note letter and accidental.

## Key-Aware Default

MuseScore's default `pitch2tpc(pitch, key, Prefer::NEAREST)` uses the exact key signature, not only whether it contains flats or sharps. Its documented examples include the complete diatonic spellings for F-sharp and G-flat major. The per-key table also contains C-flat for six-flat signatures, so E-flat minor's scale is spelled `Eb F Gb Ab Bb Cb Db` rather than replacing C-flat with B.

MIDI import constructs notes without a TPC. Once the note is attached to its staff, `Note::setNval` derives its TPC from the staff's key using `Prefer::NEAREST`. This means MuseScore can get key-diatonic spellings such as E-flat minor's C-flat right without chord analysis.

Relevant source:

- `src/importexport/midi/internal/midiimport/importmidi.cpp`, `setMusicNotesFromMidi`
- `src/engraving/dom/note.cpp`, `Note::setNval`
- `src/engraving/dom/pitchspelling.cpp`, `tpcByStepAndKey` and `pitch2tpc`

## Chromatic Notes

For non-diatonic pitches, `Prefer::NEAREST` chooses from a key-relative window on the line of fifths. The exact key therefore influences the default chromatic vocabulary, but this is still a spelling heuristic rather than harmonic analysis. A MIDI pitch in C major does not say whether pitch class 1 is C-sharp in A7 or D-flat in D-flat 7.

MuseScore's **Optimize enharmonic spelling** command goes further than a per-note key lookup. It evaluates overlapping nine-note windows and minimizes penalties for key fit, adjacent spellings, and awkward intervals. This uses local melodic context, but the code does not identify chord function or harmonic progression. Manual correction can therefore still be necessary.

Relevant source:

- `src/engraving/dom/pitchspelling.cpp`, `enharmonicSpelling`, `computeWindow`, and `Score::spellNotelist`
- `src/engraving/dom/score.cpp`, `Score::spell`

## Manual Respelling

MuseScore exposes separate **Respell pitches with sharps** and **Respell pitches with flats** commands. These intentionally call `pitch2tpc` as if the key were C, so the selected direction wins even when it conflicts with the actual key signature.

Chromatic pitch-up and pitch-down editing also updates the TPC according to edit direction, current spelling, accidental state, and key. Therefore, moving selected notes up and then down can normalize their spellings in a direction-sensitive way, but it is an editing side effect rather than harmonic interpretation.

Relevant source:

- `src/engraving/dom/score.cpp`, `Score::spellWithSharpsOrFlats`
- `src/engraving/editing/editnote.cpp`, `EditNote::upDownChromatic`
- `src/notation/internal/notationinteraction.cpp`, spelling command entry points

## Implication For Toy MIDI

Toy MIDI currently uses only the sign of MusicXML `fifths`: flat signatures select one all-flat chromatic table, while zero and sharp signatures select one all-sharp table. Matching MuseScore's basic default does not require chord analysis. The next useful step is to derive the seven diatonic spellings from the exact key signature, which would correctly export C-flat in E-flat minor.

Context-dependent chromatic spelling remains a separate problem. Improving that would require a local spelling heuristic, harmonic analysis, or an explicit per-note spelling override. MuseScore's source supports treating manual correction as normal even after applying its stronger local heuristic.
