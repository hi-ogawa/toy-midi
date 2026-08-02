# Playback Cursor Research

## Context

The standalone score viewer prototype uses OpenSheetMusicDisplay (OSMD) to render standard notation and bass TAB from Toy MIDI MusicXML. OSMD's built-in cursor can iterate through score entries, but it does not provide the continuous system-spanning playback cursor used by MuseScore during cover recording.

This note records the relevant MuseScore implementation and the resulting direction for the browser viewer. MuseScore source was inspected from the local `MuseScore` checkout. The implementation is GPL-3.0, so this research informs behavior and architecture rather than supplying code to copy.

## MuseScore Cursor Geometry

MuseScore resolves the playback cursor rectangle from the current score tick in `src/notationscene/qml/MuseScore/NotationScene/playbackcursor.cpp`.

The algorithm:

1. Find the measure containing the playback tick and its system.
2. Walk visible chord/rest segments in the measure.
3. For each segment, read its tick and canvas x-position.
4. Use the next visible chord/rest segment as the interval endpoint.
5. For the last segment in a measure, use the measure end tick and end barline x-position.
6. Linearly interpolate x within the matching tick interval:

```text
x = x1 + (x2 - x1) * (tick - t1) / (t2 - t1)
```

The cursor is a plain colored rectangle. Its top starts above the first staff and its bottom extends below the lowest visible staff, so one line spans the full standard-notation and TAB system. Its width is proportional to the score's staff-space size, and the view guarantees a minimum physical width of one pixel.

This interpolation is why the MuseScore cursor moves continuously through notes and rests rather than stepping only when playback reaches another score entry.

## Clock And Following

The audio player reports elapsed seconds. MuseScore converts each update from seconds to the corresponding score tick, including tempo and repeat mapping, then resolves the cursor rectangle from that tick. Video export uses the same conversion once per output frame.

After each cursor update, the notation view checks whether the cursor rectangle is inside the viewport. Wrapped score layouts adjust horizontally and vertically only when necessary. MuseScore's single-line layout can instead keep the cursor centered with continuous horizontal panning.

Relevant source locations:

- `src/playback/internal/playbackcontroller.cpp`: receives playback seconds and publishes the corresponding score tick.
- `src/notation/internal/notationplayback.cpp`: converts seconds to played ticks and maps repeated playback ticks to score ticks.
- `src/notationscene/qml/MuseScore/NotationScene/playbackcursor.cpp`: resolves interpolated cursor geometry.
- `src/notationscene/qml/MuseScore/NotationScene/abstractnotationpaintview.cpp`: updates the visual rectangle and follows it in the viewport.
- `src/importexport/videoexport/internal/videowriter.cpp`: resolves and paints the cursor once per video frame.

## OSMD Prototype Findings

OSMD's cursor provides useful score iteration and graphical positions, but it is not the target playback presentation:

- It advances between score entries rather than interpolating continuously.
- Its browser cursor is an absolutely positioned image generated from a one-pixel-high bitmap.
- In the current SVG-backed viewer, Chromium displays that bitmap as a horizontal mark instead of a system-height vertical cursor.
- Changing OSMD cursor type, color, opacity, or z-index does not address continuous movement.
- Replacing the image source can make it visibly vertical, but OSMD regenerates the bitmap when the iterator advances. This is useful only as a debug aid.

The `/score-viewer` route includes a deterministic 60 BPM sample for inspecting cursor behavior alongside uploaded MusicXML. The viewer now uses an independent blue browser overlay instead of OSMD's built-in cursor image.

## Viewer Direction

Keep OSMD for MusicXML parsing, engraving, and score geometry, but render the playback cursor as an independent browser overlay.

The viewer needs a geometry timeline containing visible score positions:

```text
ScorePosition {
  timestamp
  x
  systemTop
  systemBottom
  systemId
}
```

At each animation frame:

1. Convert elapsed real time to score time using the MusicXML tempo map.
2. Find the surrounding visible score positions.
3. Interpolate x when both positions belong to the same system.
4. Render a thin blue absolutely positioned rectangle from `systemTop` to `systemBottom`.
5. At a system boundary, move directly to the next system instead of interpolating diagonally between rows.
6. Keep the viewport fixed while the complete cursor rectangle is visible. At a system boundary, place the cursor on the new system first, then instantly scroll only if that rectangle is outside the viewport.

Measure-ending barline positions are required as interpolation endpoints because a measure's final note or rest may end before the next system begins. Tempo changes and repeats should remain part of the score-time conversion rather than the geometry interpolation.

The first implementation can target Toy MIDI's current single-tempo, no-repeat MusicXML exports. General tempo maps and repeat playback should be added only when exported project data requires them.
