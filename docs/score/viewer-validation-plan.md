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

## Implementation Plan

1. Extend the debug fixture with representative rhythm and barline cases.
2. Add explicit measure-ending geometry points because OSMD entry positions alone do not describe the interval from the last entry to the end barline.
3. Finalize system-boundary behavior so interpolation is horizontal only within one system.
4. Implement two-system viewport following and restart scroll restoration.
5. Run the two cover quick checks and document concrete failures in `osmd-rendering-findings.md`.
6. If the decision gate passes, move the custom cursor and follow logic from the debug route into the standalone file viewer.
7. Only then decide whether integrating the standalone viewer with Toy MIDI project state improves the workflow enough to justify coupling it to the editor.

## Cover Quick Checks

Use these completed covers as practical comparisons because together they exercise the useful variation in the current workflow:

- [ ] [tripleS - Baby Flower](https://musescore.com/user/44372771/scores/35142602), with [recorded cover](https://www.youtube.com/watch?v=cBRY91hSQmw): three flats, C minor / E-flat major, 200 BPM, eighth-note-oriented material.
- [ ] [RESCENE - LOVE ATTACK](https://musescore.com/user/44372771/scores/35265077), with [recorded cover](https://www.youtube.com/watch?v=JSxBCpMg01w): no flats, C major / A minor, 110 BPM, sixteenth-note funk material.

For each cover, load the corresponding Toy MIDI MusicXML export and quickly compare score/TAB content, system layout, cursor progression, and recording readability with the linked MuseScore score and video. Reduce any failure to a concrete fixture or rendering bug.

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
