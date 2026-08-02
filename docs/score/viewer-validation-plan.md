# Score Viewer Validation Plan

## Goal

Decide whether OSMD plus a custom playback cursor can replace MuseScore for the current bass-cover recording workflow. The decision depends on one representative cover working at the intended recording dimensions, not on general notation coverage or MuseScore engraving parity.

Related findings:

- `osmd-rendering-findings.md` covers current engraving differences and accepted compromises.
- `playback-cursor-research.md` covers MuseScore's cursor algorithm and the browser implementation direction.

## Current Prototype Baseline

- [x] Render Toy MIDI MusicXML with linked standard notation and bass TAB.
- [x] Preserve explicit string and fret assignments in the rendered TAB.
- [x] Render individual full-rest measures instead of collapsed multi-measure rests.
- [x] Beam supported rhythms through OSMD auto-beaming.
- [x] Show measure numbers only at system starts.
- [x] Build cursor geometry from OSMD timestamps, entry positions, and system bounds.
- [x] Render a thin custom cursor across the standard and TAB staves.
- [x] Interpolate cursor x-position continuously between adjacent score entries.
- [x] Pause, resume, and restart the visual playback clock.
- [x] Exercise wrapped layout with multiple systems in `/score-viewer-debug`.
- [x] Keep screenshot captures as local debug artifacts under `.tmp/`.

## Immediate Validation

### System Transitions And Following

- [ ] Confirm the cursor reaches the end of a system before moving to the next system.
- [ ] Confirm a system transition jumps directly to the next row without diagonal interpolation.
- [ ] Confirm the cursor height and vertical position update to the new system.
- [ ] Confirm vertical scrolling occurs only when the active system leaves the recording viewport.
- [ ] Keep two useful system rows visible before and after scrolling.
- [ ] Confirm following does not jitter or issue a scroll operation on every animation frame.
- [ ] Confirm pause and resume preserve the current system and cursor position after scrolling.
- [ ] Confirm restart returns the cursor and viewport to the beginning.

Pass criterion: an uninterrupted debug playback progresses through at least three wrapped systems with stable cursor movement and predictable one-system vertical progression.

### Representative Rhythm Geometry

Replace or supplement the uniform eighth-note debug score with a deterministic fixture containing:

- [ ] Quarter, eighth, and sixteenth notes.
- [ ] Dotted durations.
- [ ] Rests between notes and at measure boundaries.
- [ ] Ties within a measure.
- [ ] Ties across a barline.
- [ ] A note or rest ending at the final barline of a system.

Validate:

- [ ] Cursor speed reflects the duration between score entries.
- [ ] Cursor continues through rests instead of disappearing or stopping.
- [ ] Cursor reaches the measure-ending barline before entering the next measure.
- [ ] Tied notation does not produce a backward jump or duplicate pause.
- [ ] Short subdivisions remain visibly continuous rather than stepping between entries.

Pass criterion: cursor movement remains monotonic and rhythmically proportional across every fixture case, including the final interval in each measure.

### Real Cover Decision Gate

- [ ] Export a representative annotated cover from Toy MIDI.
- [ ] Load the exported MusicXML without manual modification.
- [ ] Confirm all required notes, rests, ties, accidentals, and explicit TAB positions render correctly.
- [ ] Tune viewer width and OSMD spacing for the intended rectangular recording composition.
- [ ] Confirm the viewport consistently presents two useful system rows.
- [ ] Play through the complete cover and inspect every system transition.
- [ ] Confirm the cursor remains synchronized with the exported tempo for the full duration.
- [ ] Record a short desktop-capture sample and compare readability with the current MuseScore capture.
- [ ] Record any passage-specific engraving ambiguity as a concrete issue rather than pursuing general parity.

Pass criterion: the exported cover can be recorded directly from the browser without opening MuseScore or correcting the rendered score.

## Implementation Plan

1. Extend the debug fixture with representative rhythm and barline cases.
2. Add explicit measure-ending geometry points because OSMD entry positions alone do not describe the interval from the last entry to the end barline.
3. Finalize system-boundary behavior so interpolation is horizontal only within one system.
4. Implement two-system viewport following and restart scroll restoration.
5. Run the real-cover decision gate and document the result in `osmd-rendering-findings.md`.
6. If the decision gate passes, move the custom cursor and follow logic from the debug route into the standalone file viewer.
7. Only then decide whether integrating the standalone viewer with Toy MIDI project state improves the workflow enough to justify coupling it to the editor.

## Deferred Work

Do not expand the prototype for these cases until a real exported cover requires them:

- Tempo changes and a general tempo map.
- Repeats, jumps, and alternate endings.
- Audio playback or synchronization with Toy MIDI's transport.
- Direct video rendering or export.
- Editing notation in the score viewer.
- MuseScore-equivalent TAB rhythm decoration.
- General instruments or arbitrary staff configurations.
- Key-aware spelling and key signatures, which are tracked separately in issue #220.

## Decision Outcomes

- **Proceed with OSMD:** the real cover passes, and remaining differences are cosmetic or passage-specific.
- **OSMD plus targeted overlays:** notation is usable, but cursor, labels, or a small number of visual elements require independent browser overlays.
- **Evaluate another renderer:** required musical information is missing or OSMD layout cannot sustain the two-system recording composition.
- **Retain MuseScore rendering:** no browser renderer path meets the workflow without building a custom engraving system disproportionate to the goal.
