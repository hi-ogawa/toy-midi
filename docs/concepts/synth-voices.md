# Notes, Voices, and Layers

Toy MIDI's own [synth](../../src/lib/dsp/subtractive-synth.ts) has two kinds of things that are easy to mix up. Its patch is a set of settings that every note shares. Its voices are what is sounding right now, one per note. Every word in the synth belongs to one of these two, or to the place where they meet. This document separates them, then follows a sample through both and shows what that means for editing a patch while notes sound.

## Separate the Patch from What Is Sounding

- **A patch** is the synth's settings for one track. It is a list of layers, and it stays the same from note to note until someone edits it.
- **A layer** is one row of the patch: an oscillator waveform, a gain, and an amp envelope. Every note plays every layer at once, summed.
- **A note** is a MIDI event with a pitch, a velocity, a note-on, and a note-off. It is what a person or an agent writes in the piano roll.
- **A voice** is one note while the synth is playing it. It starts at the note-on and ends when the release of every layer has finished, so it keeps sounding after the note-off. It holds what changes as the note plays, such as the oscillator's phase and how far each envelope has gone.

So a note and a voice are the same thing seen from outside and inside the synth. The note says what to play. The voice is the work of playing it.

## Picture Voices and Layers as a Grid

Two notes sounding through a patch of two layers make a grid, with the layers as rows and the voices as columns.

|                                       | Voice for C4 at velocity 100 | Voice for E4 at velocity 64 |
| ------------------------------------- | ---------------------------- | --------------------------- |
| **Layer 1**: saw, gain, amp envelope  | envelope position            | envelope position           |
| **Layer 2**: sine, gain, amp envelope | envelope position            | envelope position           |

The row headers are settings from the patch, shared by every voice. The column headers are per-note state, which here is the pitch, the velocity, and the oscillator's phase. Each cell is one layer sounding in one note, and it holds the only state that belongs to both, which is the stage and level that layer's envelope has reached in that note.

## Follow a Sample Through the Grid

For each output sample, the synth works through the grid in three sums.

1. **Each cell** computes its layer's oscillator at the voice's phase, times the layer's gain, times the cell's envelope level.
2. **Each voice** adds up its column and multiplies the sum by its velocity gain, which is the synth's peak gain times velocity / 127.
3. **The synth** adds up all voices and multiplies by the channel gain from CC7 volume and CC11 expression. The result then goes through the track's channel, as [audio signal flow](../audio-signal-flow.md) shows.

Every layer plays at the note's pitch, so the layers in a column share one phase.

## Tell the Three Forms of an Envelope Apart

The word envelope covers three things, one for each place in the grid.

- **The settings** are the attack, decay, sustain, and release in a layer's row, as [ADSR envelopes](adsr-envelopes.md) explains.
- **The curves** are those settings turned into a per-sample step for each stage. The synth computes them once per layer when the patch changes, not once per note.
- **The position** is a cell's current stage and level. Each note starts its own at 0.

## Edit a Patch While Notes Sound

A patch edit changes row headers, and the cells read them on every sample. So editing a layer's gain, waveform, or envelope reaches notes that are already sounding. A held note releases with a new release time, for example.

Adding or removing a layer changes the rows themselves. A cell finds its row by its position in the list, so after a removal the cells below it would line up with the wrong layers. Instead, the synth stops every sounding note when the number of layers changes, and the next note plays the new patch. Giving each layer an id, as tracks have, would let cells follow their layer and keep held notes sounding.
