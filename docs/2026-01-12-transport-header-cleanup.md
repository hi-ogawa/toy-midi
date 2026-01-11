# Transport Header Cleanup

**Status:** Implemented

## Problem

The transport header (`src/components/transport.tsx`) has grown organically and now feels cluttered:

- 15+ controls in a single horizontal row
- No clear visual grouping between related controls
- Inconsistent styling (toggle colors, button sizes)
- Mixed primary and secondary actions without visual hierarchy

## Chosen Direction: Option C - Collapsible Settings

### Always Visible (Compact Bar)

```
[Play] [Metro] [Bar|Beat.frac - MM:SS.frac] [BPM (tap-icon) - 4/4] [Grid: 1/8] <spacer> [Settings v] [?]
```

### Settings Dropdown Panel

```
[Load Audio]
[Export MIDI]
[Auto-scroll] (Ctrl+F)
[Debug]
```

## Detailed Spec

### Time Display Format

```
1|2.50 - 0:05.25
^Bar ^Beat.fraction  ^Minutes:Seconds.fraction
```

- Bar number (1-indexed)
- Beat within bar (1-4 for 4/4)
- Fractional beat (2 decimal places)
- Separator dash
- MM:SS.fraction format

### Tempo/Time Signature Display

```
120 [tap-icon] - 4/4
```

- Editable BPM number input
- Tap tempo as icon button (saves space vs "Tap" text)
- Time signature display (hardcoded 4/4 for now, not editable)

### Removed Elements

| Element                | Disposition                            |
| ---------------------- | -------------------------------------- |
| Audio filename         | Move to audio track waveform label     |
| MIDI volume slider     | Remove entirely                        |
| Audio volume slider    | Remove (or move to settings dropdown?) |
| Total duration `/2:15` | Remove                                 |

### Styling Guidelines

- **Compact DAW-style UI**: Smaller fonts than typical web (`text-xs` base)
- **Icons over text**: Use icons with `title` tooltips where possible
- **Consistent toggle color**: Emerald for all active states
- **Tight spacing**: `gap-2` instead of `gap-3`

### Keyboard Shortcuts

- `Space` - Play/Pause (existing)
- `Ctrl+F` - Toggle Auto-scroll (new, add to dropdown label)

## Implementation Steps

1. Create `SettingsDropdown` component
   - Dropdown trigger button with chevron icon
   - Panel with Load Audio, Export MIDI, Auto-scroll, Debug
   - Click outside to close

2. Refactor time display
   - Calculate bar/beat from position and tempo
   - New format: `Bar|Beat.frac - MM:SS.frac`

3. Refactor tempo section
   - Replace "Tap" button with icon
   - Add hardcoded "4/4" time signature display

4. Remove elements
   - Audio filename (will add to waveform track separately)
   - MIDI volume slider
   - Total duration from time display

5. Apply compact styling
   - Reduce font sizes
   - Tighten spacing
   - Add icons where text exists

6. Add Ctrl+F shortcut for auto-scroll

7. Run `pnpm tsc && pnpm lint && pnpm test`

## Reference Files

- `src/components/transport.tsx:192-420` - Current JSX structure
- `src/lib/keybindings.ts` - Add Ctrl+F binding
- `src/hooks/use-transport.ts` - Position data source

## Open Questions

1. Audio volume slider - remove entirely or move to settings dropdown?
2. Should settings dropdown close on any action, or stay open?

## Feedback Log

**2026-01-12**: User selected Option C with specific layout:

- Time format: `Bar|Beat.frac - MM:SS.frac`
- Tempo: `BPM [tap-icon] - 4/4`
- Move filename to waveform, remove MIDI volume and total duration
- Use compact DAW-style fonts and icons with tooltips
- Add Ctrl+F for auto-scroll toggle

**2026-01-12**: Implementation complete:

- Compact header with `text-xs` base, `gap-2` spacing, `py-1.5` padding
- Play button highlights emerald when playing
- Metronome toggle with icon (emerald when active)
- Time display: `1|2.50 - 0:05.25` format
- Tempo: number input + tap icon button + "4/4" label
- Grid snap selector
- Settings dropdown with: Load Audio, Export MIDI, Audio volume slider, Auto-scroll toggle, Debug toggle
- Help button (?)
- Added Ctrl+F keyboard shortcut for auto-scroll
- Updated E2E tests to work with new dropdown structure
- All 29 tests passing

---

**Remaining work (separate tasks):**

- Move audio filename to waveform track label (not done in this task)
