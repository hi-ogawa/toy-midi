# MuseScore Renderer Research

## Goal

First-pass research into MuseScore's renderer side, focused on what this project should learn before designing a minimal normal-score renderer.

The target is not MuseScore engraving parity. The useful target is a renderer architecture that can consume the compiled score model from the MIDI import research, expose model mistakes early, and later support the video workflow: continuous horizontal score, playback cursor, and predictable screen recording.

This is renderer-level research, not implementation guidance. MuseScore is a large GPL application; we should borrow concepts and boundaries, not code.

## Sources Read

- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/iscorerenderer.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/layoutoptions.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/scorerenderer.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/scorelayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/scorepageviewlayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/scorehorizontalviewlayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/systemlayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/measurelayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/segmentlayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/horizontalspacing.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/chordlayout.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/paint.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/rendering/score/tdraw.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/engravingitem.h`
- `/home/hiroshi/code/others/MuseScore/src/engraving/dom/engravingitem.cpp`
- `/home/hiroshi/code/others/MuseScore/src/engraving/infrastructure/shape.h`
- `/home/hiroshi/code/others/MuseScore/src/notationscene/qml/MuseScore/NotationScene/playbackcursor.cpp`
- `/home/hiroshi/code/others/MuseScore/src/notationscene/qml/MuseScore/NotationScene/abstractnotationpaintview.cpp`
- `/home/hiroshi/code/others/MuseScore/src/notationscene/qml/MuseScore/NotationScene/continuouspanel.cpp`

## Main Finding

MuseScore separates score rendering into three practical layers:

1. **Score DOM**: musical and notation objects such as score, staff, measure, segment, chord/rest, note, rest, tie, clef, time signature, and barline.
2. **Layout data on DOM items**: resolved positions, bounding boxes, collision shapes, widths, generated layout artifacts, page/system ownership, and visibility.
3. **Painting**: draw already-laid-out items onto a painter using their page/canvas positions.

The important boundary is that painting is not responsible for deciding notation structure or horizontal spacing. The layout pass resolves those details first. For this project, that suggests a similar split:

`compiled score model -> layout model -> drawable primitives -> SVG/canvas paint`

The first custom renderer should not draw directly from MIDI-derived note events. It should draw from a layout model derived from measures, segments, rests, note events, ties, clefs, time signatures, and barlines.

## Renderer Entry Points

MuseScore exposes an `IScoreRenderer` interface with these main responsibilities:

- `layoutScore(score, startTick, endTick)`
- `paintScore(painter, score, options)`
- `paintItem(painter, item, options)`

The concrete `ScoreRenderer` delegates:

- score layout to `ScoreLayout::layoutRange`
- whole-score painting to `Paint::paintScore`
- single-item painting to `Paint::paintItem`
- item-specific layout and drawing to dispatch tables (`TLayout`, `TDraw`)

This is a useful shape for us even if our objects are much smaller. A renderer service can own layout and paint orchestration, while individual element layout/draw functions remain simple and testable.

## Layout Modes

MuseScore has several layout modes:

- `PAGE`: normal page layout with systems and pages.
- `LINE`: panoramic continuous view, one long system.
- `SYSTEM`: vertical system view.
- `FLOAT`: reflow mode.
- `HORIZONTAL_FIXED`: horizontal fixed/practice-style mode.

For this project, the relevant first custom-renderer mode is closest to `LINE`: one continuous horizontal system, optimized for playback and screen recording. Page layout can remain out of scope unless needed for MusicXML/PDF comparison later.

## Layout Pipeline Observed

At a high level, `ScoreLayout::layoutRange` chooses the layout strategy by mode:

- page-like modes go through `ScorePageViewLayout`.
- continuous horizontal modes go through `ScoreHorizontalViewLayout`.
- vertical system mode goes through `ScoreVerticalViewLayout`.

The page and horizontal paths share the same important sub-passes:

1. Initialize layout context and range.
2. Reset or reuse pages/systems/layout data.
3. Collect measures into a system.
4. Layout each measure enough to know item shapes.
5. Compute pre-spacing information such as chord properties, articulations, accidentals, ledger lines, and shapes.
6. Create or update generated barlines, system headers, and trailers.
7. Compute horizontal spacing from segments.
8. Optionally squeeze or justify a system.
9. Finalize measure elements after spacing is known.
10. Layout staff lines, beams, ties/slurs, spanners, and system-level vertical positions.
11. Paint page items.

For our first renderer, this can be reduced substantially:

1. Build measures and segments from the compiled score model.
2. Assign glyph-level sizes for clef, time signature, barline, noteheads, stems, flags, rests, dots, ties.
3. Layout note/rest elements inside each segment.
4. Compute segment x positions.
5. Compute staff y positions.
6. Emit drawable primitives.
7. Map playback tick to x position.

## Horizontal Spacing

MuseScore's horizontal spacing is segment-based. `HorizontalSpacing` walks measures, gathers segments, and assigns x positions. Important ideas:

- Segments, not notes, are the spacing unit.
- Chord/rest segments get a natural width derived from rhythmic duration.
- The duration-to-width relationship is not linear; MuseScore uses a configurable exponential-ish stretch based on a reference quarter note.
- Non-chord/rest segments such as clefs, keys, time signatures, and barlines participate through minimum left/right shape extents.
- Collision shapes and minimum horizontal distances can push later segments to the right.
- After spacing, measure widths are recomputed from segment positions.
- In page layout, a full system may be squeezed or justified to the target width.

For our first renderer, the core borrow is simple:

- Keep `Segment` as the x-axis unit.
- Give each segment a natural width from its duration.
- Add fixed/minimum padding for notation shapes.
- Defer advanced collision solving, justification, lyrics, multi-staff spacing, and cross-staff cases.

This should be enough for bass-line normal notation and for exposing model mistakes like wrong rests, wrong duration splits, or bad ties.

## Measure And Element Layout

MuseScore's measure layout does more than visual placement. It also creates or updates generated notation objects during layout:

- stems
- beams
- barlines
- courtesy signatures
- system headers/trailers
- note line/accidental state
- rest centering
- ledger lines
- tie/slur positions

This is too much behavior for our first custom renderer. The practical lesson is to separate two kinds of work:

- **Score compilation** should create the notation facts we care about: measures, segments, notes, rests, written durations, ties, clef, time signature, barlines.
- **Renderer layout** should only create visual derivatives: notehead positions, stems, flags/beams if supported, rest glyph positions, tie curves, and x/y coordinates.

We should avoid a layout pass that mutates musical meaning. If the renderer discovers missing rests or ties, that is a model bug, not renderer responsibility.

## Shape And Layout Data

Every MuseScore `EngravingItem` carries layout data:

- position relative to parent
- magnification
- shape/bounding box
- skip-draw flag
- page/canvas derived positions

`Shape` is more precise than a rectangle: it can hold multiple shape elements and is used for collision and spacing.

For our first renderer, a simpler equivalent is enough:

- local bounding box per drawable/layout item
- absolute page/canvas position after layout
- optional collision box for spacing
- stable item id/source id for debugging and playback mapping

We do not need MuseScore's full shape system initially, but the concept of "layout data is separate from score semantics" is important.

## Painting Pipeline

MuseScore painting is comparatively direct after layout:

1. `Paint::paintScore` iterates pages.
2. It selects page items intersecting the viewport.
3. It sorts items by drawing order.
4. `Paint::paintItem` translates the painter to the item's page position.
5. `TDraw::drawItem` dispatches by element type.

This suggests our renderer should produce a flat display list after layout:

- staff lines
- barlines
- clef/time signature
- rests
- noteheads
- stems/flags or beams
- dots
- ties
- playback cursor overlay

SVG is probably the easiest first paint target because score output is inspectable and DOM snapshots can be tested. Canvas may still be appropriate later for video performance, but it should not determine the first model/layout design.

## Playback Cursor And Viewport Mapping

MuseScore's playback cursor is resolved from tick to layout coordinates, not from audio time directly.

The observed cursor logic:

1. Convert playback tick to score fraction.
2. Find the measure containing that tick.
3. Walk visible chord/rest segments in the measure.
4. Find the segment interval surrounding the tick.
5. Linearly interpolate x between the current segment and next visible chord/rest segment, or the end barline.
6. Build a cursor rectangle covering the visible staves in the system.
7. In continuous line mode, optionally smooth-pan the viewport around the cursor.

This is directly relevant to the video workflow. Our layout model should expose:

- measure tick range
- segment tick and x position
- measure end x position or end barline x
- system/staff vertical bounds
- tick-to-x interpolation

This can be implemented independently of audio playback and tested with synthetic ticks.

## Continuous Panel

MuseScore's continuous horizontal view also has a "continuous panel" that redraws current clef/key/time/staff-name information at the left side while the score scrolls.

That is useful later, but not part of the first renderer. For a single bass staff, fixed clef and time signature at the beginning may be enough. If screen recording makes off-screen context annoying, a lightweight sticky clef/time-signature panel can be added after the basic cursor/autoscroll path works.

## Concepts Worth Borrowing

- **Layout before paint**: resolve positions and shapes before drawing.
- **Segment-based x-axis**: align notation by score segments, not by flat notes.
- **View modes**: treat continuous horizontal layout as a first-class layout mode.
- **Layout data sidecar**: keep visual positions/bounds separate from score semantics.
- **Display list**: render from flattened drawable items after layout.
- **Duration-driven spacing**: derive natural spacing from written rhythmic duration.
- **Tick-to-x mapping**: playback cursor should use laid-out segments and interpolation.
- **Viewport as separate concern**: autoscroll follows cursor rectangles; it is not part of score layout.
- **Golden visual references**: compare model/render output against MuseScore imported examples.

## Concepts To Defer

- Page layout and print-quality engraving.
- Full collision avoidance.
- Multi-staff vertical spacing.
- Hide-empty-staves behavior.
- System justification/squeezing.
- Lyrics, dynamics, articulations, rehearsal marks, frames, and other annotations.
- Cross-staff notation.
- Full beam and tuplet bracket engraving.
- Editing, selection, drag/drop, accessibility, and inspector behavior.
- MuseScore's continuous left panel unless needed for recording ergonomics.

## Implications For The Score Tool

The first renderer should be a validation renderer, not an engraving engine.

Recommended boundary:

1. Input: compiled score model, not raw MIDI.
2. Layout mode: one horizontal system.
3. Supported notation: bass clef, time signature, measure barlines, notes, rests, stems/flags or simple beams, dots if needed, ties.
4. Layout output: measures, segments, drawable primitives, and tick-to-x mapping.
5. Paint output: SVG first, with optional canvas later.
6. Validation: compare exported MusicXML and/or rendered screenshots against MuseScore references from representative workflow MIDI.

The renderer should make model bugs visible. If the model emits wrong rests, ties, duration spelling, or segment timing, the renderer should show that plainly rather than trying to repair it.

## Minimal First Custom Renderer Shape

At the scoping level, a minimal renderer can be:

```text
CompiledScore
  -> LayoutScore
     -> LayoutMeasure[]
        -> LayoutSegment[]
        -> Drawable[]
     -> tickToX(tick)
  -> SvgRenderer
```

The smallest useful display list:

- staff lines across the full horizontal score
- measure barlines
- initial clef
- initial time signature
- noteheads positioned by pitch line
- rests positioned by duration
- stems and flags for unbeamed notes
- dots if the score model emits dotted durations
- tie curves between tied fragments
- playback cursor rectangle

This is intentionally smaller than MuseScore. It is enough to validate the model before tab notation, polished engraving, or video-specific export.

## Follow-Up Research

- Survey MusicXML ecosystem and renderer options for validating the model before building a custom notation renderer.
- Inspect how MuseScore exports MusicXML for simple imported MIDI examples.
- Collect representative workflow MIDI files and compare MuseScore import, MusicXML export, and candidate renderer output.
- Decide whether first visual validation should be MusicXML-renderer-based, custom SVG-based, or both.
