# Technical Decisions

Log of key technical decisions. Append new decisions at the bottom.

---

## 2026-01-08: Initial Stack

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Rendering | SVG | DOM events for easy interaction, simpler than Canvas hit detection |
| State | Zustand | Future-proof, minimal boilerplate, good TS support |
| Audio/MIDI | Tone.js + @tonejs/midi | Unified ecosystem, transport built-in, native TS |
| Note input | Click-based | Mouse-first UX, keyboard shortcuts later |

**Alternatives considered:**
- Canvas: Better performance but harder interaction handling
- Howler.js: Simpler but no transport/scheduling
- React Context: Would work but Zustand scales better

---

## 2026-01-08: Note Input Behavior

**Decision**: Click-drag creates single extended note (not multiple notes like Ableton's draw mode)

**Rationale**: More intuitive for transcription - you hear a note, you draw its duration. Ableton's behavior is optimized for drum programming.

```
Our behavior (click at beat 1, drag to beat 3):
┌───┬───┬───┬───┐
│ █████████ │   │  ← 1 extended note
└───┴───┴───┴───┘
```

---
