# Audio Playback

Add audio playback with transport controls and playhead visualization.

## Problem

The piano roll needs synchronized audio playback to enable bass transcription:

- Load backing track (WAV/MP3)
- Play/pause with visual feedback
- Seek to any position (click timeline or waveform)
- Playhead shows current position in piano roll
- Auto-scroll follows playhead during playback

## Future: MIDI + Backing Track

Later phases will add:

1. **Note preview on interaction** - synthesize audio when adding/moving notes (mousedown)
2. **MIDI playback** - play MIDI notes alongside backing track during transport

Design AudioManager to support these additions.

## Reference: Tone.js

**Essential resource**: `refs/Tone.js/` - full Tone.js source + examples

Key files:

- `refs/Tone.js/examples/player.html` - basic Player usage
- `refs/Tone.js/examples/mixer.html` - Transport + multiple synced Players
- `refs/Tone.js/Tone/source/buffer/Player.ts` - Player API
- `refs/Tone.js/Tone/core/clock/Transport.ts` - Transport API

### Player API

From `refs/Tone.js/Tone/source/buffer/Player.ts`:

```typescript
// Load and play audio
const player = new Tone.Player(url).toDestination();
await player.load(url);
player.start(); // play from beginning
player.stop();
player.seek(offset); // seek to position

// Properties
player.loaded; // boolean - buffer loaded
player.buffer.duration; // total duration in seconds
player.progress; // current position in seconds (during playback)
player.playbackRate; // speed (1 = normal)
```

Note: Using Transport (not direct Player) allows future MIDI + audio sync.

## Design

### Approach: Transport-synced Player

Use `Tone.Transport` to control playback (not direct Player control):

```javascript
// From refs/Tone.js/examples/mixer.html
const player = new Tone.Player({ url })
  .sync() // sync to Transport timeline
  .start(0); // start at Transport position 0

Tone.Transport.start(); // plays everything synced
Tone.Transport.stop();
Tone.Transport.position = "1:0:0"; // seek
```

**Why Transport over direct Player:**

- Single control for audio + MIDI (future)
- Synth notes can schedule against Transport
- Seek/position handled uniformly
- Mixer pattern from Tone.js examples

### State

```typescript
// Add to project-store.ts
interface AudioState {
  audioUrl: string | null; // loaded file URL (blob URL or path)
  audioLoaded: boolean;
  audioDuration: number; // in seconds
  isPlaying: boolean;
  playheadPosition: number; // in seconds

  // Actions
  loadAudio: (file: File) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
}
```

### Audio Manager

Create `src/lib/audio.ts` to encapsulate Tone.js:

```typescript
import * as Tone from "tone";

class AudioManager {
  private player: Tone.Player | null = null;
  private synth: Tone.Synth | null = null;
  private _initialized = false;
  private _duration = 0;

  async init(): Promise<void> {
    if (this._initialized) return;
    await Tone.start(); // Resume audio context (browser autoplay policy)
    this.synth = new Tone.Synth().toDestination();
    this._initialized = true;
  }

  async loadAudio(url: string): Promise<number> {
    await this.init();
    // Dispose previous player
    this.player?.dispose();
    // Create new player synced to Transport
    this.player = new Tone.Player(url).toDestination();
    await this.player.loaded;
    this._duration = this.player.buffer.duration;
    this.player.sync().start(0); // Sync to Transport, start at position 0
    return this._duration;
  }

  play() {
    Tone.Transport.start();
  }

  pause() {
    Tone.Transport.pause();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
  }

  seek(seconds: number) {
    Tone.Transport.seconds = seconds;
  }

  get position(): number {
    return Tone.Transport.seconds;
  }

  get duration(): number {
    return this._duration;
  }

  get isPlaying(): boolean {
    return Tone.Transport.state === "started";
  }

  // Note preview (immediate, not synced to Transport)
  playNote(pitch: number, duration: number = 0.2) {
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.synth?.triggerAttackRelease(freq, duration);
  }
}

export const audioManager = new AudioManager();
```

**Key patterns:**

- `Player.sync().start(0)` - player follows Transport timeline
- `Transport.start/pause/stop` - controls all synced sources
- `Transport.seconds` - get/set position in seconds
- Synth for note preview (immediate, not synced)

### UI Components

**Transport controls** (in toolbar or dedicated transport bar):

- Play/Pause button (toggle)
- Stop button (pause + seek to 0)
- Time display: current / total (MM:SS format)
- Load audio button

**Timeline enhancements**:

- Playhead line (vertical, moves with position)
- Click to seek

**Waveform area** (existing placeholder):

- Shows waveform visualization
- Click to seek
- Playhead overlay

### Playhead Tracking

During playback, update `playheadPosition` via `requestAnimationFrame`:

```typescript
const trackPosition = () => {
  if (isPlaying) {
    setPlayheadPosition(audioManager.position);
    rafId = requestAnimationFrame(trackPosition);
  }
};
```

### Auto-scroll

When playhead exits visible range, scroll to keep it in view:

```typescript
useEffect(() => {
  if (isPlaying && playheadPosition > scrollX + visibleBeats * 0.8) {
    // Scroll to put playhead at 20% from left
    setScrollX(playheadPosition - visibleBeats * 0.2);
  }
}, [playheadPosition, isPlaying]);
```

### Coordinate Conversion

Playhead is in seconds, piano roll is in beats:

```typescript
const secondsToBeat = (seconds: number) => (seconds / 60) * tempo;
const beatToSeconds = (beat: number) => (beat / tempo) * 60;
```

## Implementation Steps

1. [x] Install Tone.js dependency (`pnpm add tone`)
2. [x] Create `src/lib/audio.ts` with AudioManager class
3. [x] Add audio state to project store (url, duration, isPlaying, playheadPosition)
4. [x] Create Transport component with play/pause/stop/load buttons
5. [x] Add playhead line to piano roll (vertical line at current position)
6. [x] Implement position tracking with requestAnimationFrame
7. [x] Add click-to-seek on timeline
8. [x] Add auto-scroll during playback
9. [ ] Update waveform placeholder with basic visualization (stretch goal)

## Files to Modify

| File                            | Changes                               |
| ------------------------------- | ------------------------------------- |
| `package.json`                  | Add tone dependency                   |
| `src/lib/audio.ts`              | New - AudioManager class              |
| `src/stores/project-store.ts`   | Add audio state and actions           |
| `src/components/piano-roll.tsx` | Playhead, auto-scroll, timeline click |
| `src/app.tsx`                   | Add Transport component               |

## Considerations

### Browser Autoplay Policy

Must call `Tone.start()` from user gesture before audio plays. Handle this on first play button click.

### Memory Management

Revoke blob URLs when loading new file to avoid memory leaks:

```typescript
if (previousUrl) URL.revokeObjectURL(previousUrl);
```

### Tempo Sync

Piano roll uses beats, audio uses seconds. Need tempo value to convert:

- Current: No tempo in store (implicit 120 BPM)
- Add `tempo` to project store, default 120

## Feedback Log

- **MIDI mixing**: Later we'll mix MIDI and backing track together during playback
- **Note preview**: Each note interaction (add, move) should synthesize audio feedback
- Added `playNote()` method and synth to AudioManager design
- **Transport-first approach**: Use `Tone.Transport` from the start (from mixer.html pattern)
  - Player syncs via `.sync().start(0)`
  - Single control for audio + future MIDI

## Follow Up

- [ ] Toggle-able auto scroll
- [x] why two buttons? just one play/pause toggle? - removed stop button
- [ ] playhead something blue-ish?
- [ ] space as play/pause shortcut
- [ ] what's delay between pressing timeline area to playhead jump?
- [ ] audio segment cannot be dragged to right.

## Additional Requirements

### Audio Offset (Draggable Audio)

Audio files may have irrelevant intros (e.g., YouTube video intros). Need to align audio with beat 1.

**Approach:**

- Add `audioOffset` state (in seconds) - how much audio is shifted relative to timeline
- Drag waveform area horizontally to adjust offset
- When Transport plays at position 0, audio plays from `audioOffset` into the file
- Visual: waveform/audio region shows offset position on timeline

```typescript
// In AudioManager
player.sync().start(0, audioOffset); // Start playing from audioOffset when Transport is at 0
```

### Demo Audio File

Include a demo audio for quick testing:

- User will add public domain audio to `public/`
- Add "Load Demo" button in Transport (if demo exists)

## Scope

- Any audio format supported by browser (MP3, WAV, OGG, etc.)
- Browser's `decodeAudioData()` handles decoding natively

## Status

**Done** - Audio playback with offset complete

### Completed

- Tone.js installed and AudioManager class created
- Transport component with play/pause/stop/load (any audio format)
- Player syncs to Tone.Transport for future MIDI mixing
- Playhead line in grid and timeline
- Auto-scroll during playback
- Click timeline to seek
- Audio offset: drag waveform region to align with beat 0
- Visual offset indicator showing seconds
- E2E tests for audio loading (both URL and file input)
- Fixed Tone.js bug: use `player.load(url)` not `player.loaded`
- Test audio file in `public/test-audio.wav`

### Remaining

- Waveform visualization (stretch goal)
