# ABC Notation Export Implementation

## Problem

Users need to export their piano roll compositions in a human-readable text format that:

1. Can be easily shared with LLMs (ChatGPT, Claude) for music analysis
2. Is compatible with common music notation tools
3. Provides an alternative to binary MIDI format
4. Supports copy-to-clipboard for quick usage

## ABC Notation Research & Specification

### What is ABC Notation?

ABC notation is a text-based music notation system developed by Chris Walshaw in 1993. It uses ASCII characters to represent musical notes, making it ideal for:

- Email and text-based communication
- Version control systems (plain text diff-able)
- LLM processing and analysis
- Quick transcription and sharing

### ABC Format Structure

```abc
X:1                    % Reference number (required)
T:Title                % Title (required)
M:4/4                  % Meter/time signature
L:1/4                  % Default note length (quarter note)
Q:1/4=120              % Tempo (120 BPM for quarter notes)
K:C                    % Key signature (required)
% Body - the actual music
c d e f | g a b c' |   % Notes with bar lines
```

### Note Representation

**Octaves:**

- `C,,` `D,,` = Two octaves below middle C (MIDI 24-35)
- `C,` `D,` = One octave below middle C (MIDI 36-47)
- `C` `D` = Lower octave (MIDI 48-59)
- `c` `d` = Middle octave, middle C = c (MIDI 60-71)
- `c'` `d'` = One octave above middle C (MIDI 72-83)
- `c''` `d''` = Two octaves above middle C (MIDI 84-95)

**Accidentals:**

- `^C` = C sharp (raise by semitone)
- `^^C` = C double sharp (raise by whole tone)
- `_C` = C flat (lower by semitone)
- `__C` = C double flat (lower by whole tone)
- `=C` = C natural (cancel previous accidental)

**Note Durations:**

- `C` = Quarter note (default, 1 beat in 4/4)
- `C2` = Half note (2 beats)
- `C4` = Whole note (4 beats)
- `C/2` = Eighth note (1/2 beat)
- `C/4` = Sixteenth note (1/4 beat)
- `C3/2` = Dotted quarter (1.5 beats)
- `C3` = Dotted half (3 beats)

**Rests:**

- `z` = Rest (same duration rules as notes)
- `z2` = Half rest
- `z/2` = Eighth rest

**Bar Lines:**

- `|` = Regular bar line
- `||` = Double bar line
- `|]` = Final bar line
- `:|` `|:` = Repeat signs

### Design Decisions for toy-midi

1. **Key Signature**: Default to C major (`K:C`)
   - MIDI notes don't inherently indicate key context
   - All sharps/flats rendered as explicit accidentals
   - User can manually edit key signature in exported file if needed

2. **Monophonic Output**: One note at a time
   - Piano roll notes are displayed sequentially
   - Overlapping notes rendered one after another
   - Simplifies implementation and ABC readability

3. **Bar Lines**: Every 4 bars per line
   - Improves readability for longer compositions
   - Standard practice in ABC notation
   - Makes visual parsing easier

4. **Tempo Representation**: `Q:1/4=BPM`
   - Uses quarter note as beat unit
   - Matches common 4/4 time signature
   - Adjusts for other time signatures automatically

## Approach

### Core Conversion Functions

```typescript
// Convert MIDI pitch (0-127) to ABC note name with octave
function midiToABC(pitch: number): string;
// C3-B3 (48-59) → uppercase: C D E F G A B
// C4-B4 (60-71) → lowercase: c d e f g a b
// Below C3 → uppercase with commas: C, C,,
// Above B4 → lowercase with apostrophes: c' c''

// Convert beat duration to ABC length notation
function durationToABC(beats: number): string;
// 1 beat → "" (default quarter)
// 2 beats → "2" (half)
// 0.5 beats → "/2" (eighth)
// 1.5 beats → "3/2" (dotted quarter)

// Main export function
function exportABC(options: ABCExportOptions): string;
// Generate header (X, T, M, L, Q, K)
// Sort notes by start time
// Convert each note to ABC notation
// Add rests for gaps
// Insert bar lines at measure boundaries
// Format into lines (4 bars per line)
```

### UI Integration

Two export options in settings dropdown:

1. **Export ABC** → Download `.abc` file
2. **Copy ABC to Clipboard** → For quick LLM sharing

Both disabled when no notes exist.

## Reference Files

- `src/lib/midi-export.ts` - Existing MIDI export to follow pattern
- `src/lib/music.ts` - MIDI pitch utilities (midiToNoteName)
- `src/components/transport.tsx` - Export button location
- ABC Notation Standard: http://abcnotation.com/wiki/abc:standard:v2.1

## Implementation Steps

1. **Create `src/lib/abc-export.ts`**
   - `midiToABC()` - pitch to ABC note name
   - `durationToABC()` - beats to ABC duration
   - `exportABC()` - main conversion function
   - `downloadABCFile()` - trigger file download
   - `copyABCToClipboard()` - clipboard API integration

2. **Add unit tests `src/lib/abc-export.test.ts`**
   - Different octaves (low, middle, high)
   - Sharps and note names
   - Various durations (whole, half, quarter, eighth, dotted)
   - Rests for gaps
   - Time signatures (3/4, 4/4, 5/4, 6/8)
   - Tempos (60, 120, 180 BPM)
   - Bar lines at measure boundaries
   - Note sorting by start time
   - Empty notes array
   - Custom titles

3. **Update `src/components/transport.tsx`**
   - Import ABC export functions
   - Add "Export ABC" dropdown item
   - Add "Copy ABC to Clipboard" dropdown item
   - Add toast notification on clipboard success
   - Disable both when `notes.length === 0`

4. **Add E2E tests `e2e/transport.spec.ts`**
   - Export ABC file workflow
   - Copy to clipboard workflow
   - Verify clipboard content
   - Test disabled state

## Test Cases

### Unit Tests (14 tests)

1. Export simple note in ABC format
2. Handle different octaves (C3, C4, C5)
3. Handle sharps/flats (C#, D#)
4. Handle different note durations (half, quarter, eighth)
5. Add rests for gaps between notes
6. Handle empty notes array
7. Set custom title
8. Handle different time signatures (3/4, 6/8)
9. Handle different tempos (60, 180)
10. Include bar lines at measure boundaries
11. Sort notes by start time
12. Handle low octave notes (C1, C2)
13. Handle high octave notes (C6, C7)
14. Handle dotted notes (dotted quarter, dotted eighth)

### E2E Tests (3 tests)

1. Export ABC file workflow - button disabled when no notes, enabled when notes exist, triggers download
2. Copy ABC to clipboard workflow - button disabled when no notes, success toast appears
3. Clipboard content verification - ABC header and notes present

## Example Output

### Input: C Major Scale

```
Notes: C4, D4, E4, F4, G4, A4, B4, C5
Tempo: 120 BPM
Time Signature: 4/4
```

### Output:

```abc
X:1
T:C Major Scale
M:4/4
L:1/4
Q:1/4=120
K:C
c d e f | g a b c' |
```

### Input: Bass Line with Rests

```
Notes: E2 (beat 0), G2 (beat 1), rest (beat 2), A2 (beat 3)
Tempo: 90 BPM
Time Signature: 4/4
```

### Output:

```abc
X:1
T:Bass Line
M:4/4
L:1/4
Q:1/4=90
K:C
E, G, z A, |
```

## Feedback Log

- **2026-01-12**: Initial implementation completed
  - Core ABC export function working
  - Unit tests using inline snapshots (converted from individual assertions)
  - UI buttons added to transport dropdown
  - E2E tests passing

- **2026-01-12**: Code review feedback addressed
  - Removed incorrect sharp/flat conversion in midiToABC
  - Extracted gcd helper function to avoid duplication
  - Added BARS_PER_LINE constant for maintainability
  - Clarified key signature comment (design choice vs MIDI limitation)

- **2026-01-12**: CI fixed
  - Removed unused `beatsToSeconds` import from abc-export.ts
  - Removed unused `TimeSignature` import from abc-export.test.ts
  - All TypeScript compilation errors resolved

## Status

- [x] Research ABC notation format
- [x] Define specifications and design decisions
- [x] Create task document
- [x] Implement core export functions
- [x] Add unit tests (14 tests, all passing)
- [x] Add E2E tests (3 tests, all passing)
- [x] Update UI (2 buttons in transport dropdown)
- [x] Address code review feedback
- [x] Fix CI TypeScript errors
- [x] Use inline snapshots for tests
- [x] All tests passing (21 unit, 11 E2E)
- [x] TypeScript compilation passing
- [x] Linter passing
- [x] Build successful
- [x] CodeQL security scan: 0 alerts

## Benefits & Use Cases

1. **LLM Integration**: Copy ABC to clipboard → Paste into ChatGPT/Claude for:
   - Music theory analysis
   - Chord progression identification
   - Style and pattern recognition
   - Composition suggestions

2. **Sheet Music Conversion**: Export ABC → Use online tools:
   - abcjs.net (web player/renderer)
   - EasyABC (desktop editor)
   - abc2midi (command-line converter)

3. **Version Control**: Plain text format works with Git:
   - Meaningful diffs between versions
   - Branch and merge compositions
   - Track changes over time

4. **Collaboration**: Share compositions as text:
   - Email or chat messages
   - GitHub issues or PRs
   - Forum posts and discussions

5. **Documentation**: Human-readable format for:
   - Music tutorials and examples
   - Technical documentation
   - Educational materials

## Future Enhancements

Potential improvements (out of scope for initial implementation):

1. **Polyphonic support**: Chords represented as `[CEG]`
2. **Key detection**: Analyze notes to suggest appropriate key signature
3. **Lyrics support**: `w:` line for vocals
4. **Voice separation**: `V:1` for multi-voice compositions
5. **Ornaments**: Trills, grace notes, articulations
6. **Custom key signatures**: Allow user to specify key
7. **ABC validation**: Check output against ABC standard
8. **Batch export**: Export multiple projects at once
