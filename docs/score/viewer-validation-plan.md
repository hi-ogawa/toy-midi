# Score Viewer Validation Plan

## Goal

Decide whether OSMD plus a custom playback cursor can replace MuseScore for the current bass-cover recording workflow. The decision depends on one representative cover working at the intended recording dimensions, not on general notation coverage or MuseScore engraving parity.

Related findings:

- `osmd-rendering-findings.md` covers current engraving differences and accepted compromises.
- `playback-cursor-research.md` covers MuseScore's cursor algorithm and the browser implementation direction.

## Terminology And Layout Intent

- **Staff:** one notation staff. This viewer renders one standard bass-clef staff and one TAB staff.
- **System:** one wrapped horizontal span containing both staves, with standard notation above TAB. A system is the complete visual unit that the playback cursor spans.
- **Wrapped systems:** the vertical sequence produced when the score is wider than the available content width. Avoid using “row” as a separate layout concept; it means a wrapped system here.
- **Viewport:** the visible scroll container used for screen recording or interactive playback.
- **Visible system count:** the number of complete or partial wrapped systems that happen to fit in the viewport. Recent cover compositions usually show about two systems, but this is not a fixed renderer contract. It changes with viewport height, score width, scale, and notation content.
- **Following:** keep the viewport stationary while the complete active-system cursor is visible. When it leaves the viewport, instantly scroll enough to reveal that cursor. Following does not prescribe one-system increments or an exact number of visible systems.

The current cover-video composition uses a wide viewport sized by eye so approximately two wrapped systems are visible. Other capture dimensions may show a different count without changing score layout or playback behavior.

One system:

```text
┌──────────────────────────────────────────────────────────────┐
│ Standard notation staff                                      │
│ 𝄢  ♩   ♪ ♪   ♩       │ ♩   ♩   ♪ ♪                       │
│                                                              │
│ TAB staff                                                    │
│ G|-------------------|---------------------------------------│
│ D|------5--7---------|---------------------------------------│
│ A|--5----------------|--3---5--------------------------------│
│ E|-------------------|---------------------------------------│
└──────────────────────────────────────────────────────────────┘
```

A typical recording viewport may contain approximately two wrapped systems:

```text
┌──────────────────────────────────────────────────────────────┐
│ System 1                                                     │
│ Standard notation                                            │
│ TAB                                                          │
├──────────────────────────────────────────────────────────────┤
│ System 2                                                     │
│ Standard notation                     │ playback cursor       │
│ TAB                                   │                       │
└──────────────────────────────────────────────────────────────┘
```

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
- [x] Exercise wrapped layout with multiple systems using the built-in `/score-viewer` sample.
- [x] Keep screenshot captures as local debug artifacts under `.tmp/`.

## Immediate Validation

### System Transitions And Following

- [x] Make the cursor reach the end barline before moving to the next system by adding a synthetic geometry point at each system's final timestamp and right border.
- [x] Confirm the corrected system transition jumps directly to the next wrapped system without diagonal interpolation.
- [ ] Confirm the cursor height and vertical position update to the new system.
- [ ] Update the cursor to the new system before deciding whether to scroll so it remains visible at every system boundary.
- [ ] Keep the viewport stationary while the complete cursor rectangle is visible, including when the active system is the lowest visible system.
- [ ] When the complete cursor rectangle is outside the viewport, instantly scroll so the active system starts near the top-left content origin.
- [ ] Confirm following works with different viewport heights and does not depend on exactly two visible systems.
- [ ] Confirm following does not jitter or issue a scroll operation on every animation frame.
- [ ] Confirm pause and resume preserve the current system and cursor position after scrolling.
- [ ] Confirm restart returns the cursor and viewport to the beginning.

Pass criterion: uninterrupted sample playback progresses through at least three wrapped systems with stable cursor movement and MuseScore-like viewport containment. The cursor remains fully visible, and the viewport changes only when required to reveal the active system.

### Recording Frame

Exact capture dimensions are not a contract because the MuseScore window has been sized by eye and the tab layer is scaled later in Kdenlive. Preserve a wide aspect ratio close to recent captures:

- `1244x628` (`1.98:1`)
- `1244x602` (`2.07:1`)
- `1394x652` (`2.14:1`)

Use approximately `2:1` as the default. Keep width and height configurable for screen capture and offline silent video export. The viewport often contains about two wrapped systems at these dimensions, but the target is the overall composition rather than an exact system count.

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

1. Extend the built-in sample with representative rhythm and barline cases.
2. Add explicit measure-ending geometry points because OSMD entry positions alone do not describe the interval from the last entry to the end barline.
3. Finalize system-boundary behavior so interpolation is horizontal only within one system.
4. Implement cursor-rectangle viewport containment and restart scroll restoration.
5. Run the two cover quick checks and document concrete failures in `osmd-rendering-findings.md`.
6. Run the same cursor and follow implementation against uploaded MusicXML without sample-specific assumptions.
7. Only then decide whether integrating the standalone viewer with Toy MIDI project state improves the workflow enough to justify coupling it to the editor.

## Cover Quick Checks

Use these completed covers as practical comparisons because together they exercise the useful variation in the current workflow:

- [ ] [tripleS - Baby Flower](https://musescore.com/user/44372771/scores/35142602), with [recorded cover](https://www.youtube.com/watch?v=cBRY91hSQmw): three flats, C minor / E-flat major, 200 BPM, eighth-note-oriented material.
- [ ] [RESCENE - LOVE ATTACK](https://musescore.com/user/44372771/scores/35265077), with [recorded cover](https://www.youtube.com/watch?v=JSxBCpMg01w): no flats, C major / A minor, 110 BPM, sixteenth-note funk material.

For each cover, load the corresponding Toy MIDI MusicXML export and quickly compare score/TAB content, system layout, cursor progression, and recording readability with the linked MuseScore score and video. Reduce any failure to a concrete fixture or rendering bug.

## In-Scope Follow-Ups

These remain part of the broader score presentation workflow but are not required to decide whether the current browser viewer can replace MuseScore for screen recording:

- Project-scoped score player routing at `/project/<id>/score`. The route should load the persisted project read-only, generate MusicXML in memory, and open the same score player without a download/upload or `sessionStorage` handoff. `/score-viewer` should remain available for standalone MusicXML files and generated samples. Opening the project score from the editor must flush pending autosave first so a new tab reads the latest project state.
- Offline silent tab-video rendering for use as the scrolling score layer in Kdenlive. The intended production path should extract static score viewport SVG or raster backgrounds from OSMD, export piecewise cursor geometry, apply the same cursor-containment viewport rule as interactive playback, composite frames at exact timestamps, and encode without real-time screen capture. Per-frame Playwright screenshots are only a correctness spike, not the production renderer.

## Out Of Scope

- Tempo changes and a general tempo map.
- Repeats, jumps, and alternate endings.
- Audio playback or synchronization with Toy MIDI's transport.
- Audio rendering, mixing, muxing, or synchronization in exported tab video. The cover workflow records and mixes audio separately, then synchronizes the silent tab layer in Kdenlive.
- Editing notation in the score viewer.
- MuseScore-equivalent TAB rhythm decoration.
- General instruments and staff configurations beyond the current bass score/TAB pair.

## Decision Outcomes

- **Proceed with OSMD:** the real cover passes, and remaining differences are cosmetic or passage-specific.
- **OSMD plus targeted overlays:** notation is usable, but cursor, labels, or a small number of visual elements require independent browser overlays.
- **Evaluate another renderer:** required musical information is missing or OSMD layout cannot sustain the wide scrolling-score recording composition.
- **Retain MuseScore rendering:** no browser renderer path meets the workflow without building a custom engraving system disproportionate to the goal.
