# Amp sim prototype

Can a clean DI guitar through a simple amp sim beat General MIDI's distorted guitars? This prototype answers that offline, before Toy MIDI builds an amp sim (#934). It renders two demo pieces from llm-music-probe, [Quiet-Loud in E](https://github.com/hi-ogawa/llm-music-probe/tree/main/compositions/pieces/quiet-loud-in-e) and [Open E Mixolydian](https://github.com/hi-ogawa/llm-music-probe/tree/main/compositions/pieces/open-e-mixolydian), whose guitar tracks are on the FlameStudios Telecaster bridge font and named by the gain they get (Clean, Crunch, High Gain), and runs each guitar track through an amp in ffmpeg.

## Result

Yes. The final chain sustains like General MIDI's distortion, keeps the DI's pick attack, which General MIDI's samples lack, and stops cleanly between notes.

![The final chain: note gate, pre-EQ, compressor, drive, cabinet, room](images/chain-final.svg)

Each stage is there because of something heard along the way, so the iterations below are the explanation.

## Iterations

Each step changes one thing, shown in yellow in its chain diagram, all on the filter cabinet the chain ships with, and the cabinet gets its own comparison at the end. Every render is normalized to −16 LUFS, so a comparison is about tone, not level. The tags name the variants to compare, [Reproduce](#reproduce) generates them, and `gen-figures.ts` draws the plots from those renders.

The session didn't run in this order. Its v2 round added the Marshall cabinet IR together with the amp changes, so the gate and the room were first heard with the IR. Step 6 found the IR and the filters interchangeable, and the gate was then confirmed on the filter-cabinet pair, so the steps follow the cleaner order.

### 1. No amp (`tele-dry`)

![Step 1: no stages, the DI goes straight out](images/chain-1-dry.svg)

A clean Telecaster bridge pickup is the classic country sound, so the riffs sound like rock played on a country tone. The writing already reads as guitar, so the missing piece was the amp.

### 2. Drive (`v1` against `tele-dry`)

![Step 2 adds pre-EQ, one tanh drive stage, and the cabinet](images/chain-2-v1.svg)

- **Pre-EQ:** cuts below 90 Hz so the low end stays tight under distortion, and boosts 750 Hz like an overdrive pedal in front of an amp.
- **Drive:** a fixed boost into a tanh soft clipper, which rounds off the peaks and adds harmonics.
- **Cabinet:** filters standing in for a guitar speaker, mainly a steep roll-off from about 5 kHz. Step 6 shows why it's there.

**Heard:** better than clean. But General MIDI's distortion (`gm`) sustains more convincingly, even though its samples have no pick attack.

**Why:** a fixed boost clips the start of a note, but as the DI string decays, the signal falls below the clipping point and the note cleans up. General MIDI's samples were recorded through a real amp, whose compression keeps the decaying string saturated. The font isn't the cause, since its samples sustain a full 6-second note.

### 3. Sustain (`v2` against `v1`)

![Step 3 adds a compressor before the drive and changes the drive to an asymmetric stage plus cascaded stages](images/chain-3-v2.svg)

- **Compressor:** turns a note up as it decays, so the string stays pushed into the clipper instead of cleaning up.
- **Drive, changed:** the first stage clips asymmetrically, because a DC offset before the clipper flattens one half of the wave more than the other, which adds even harmonics like a tube stage. High gain adds two more stages that each clip a little, the way a high-gain preamp does, instead of one hard push.

![A held note through high gain: v1 drops about 18 dB over 6 seconds, v2 about 5 dB](images/sustain.svg)

**Heard:** a good addition, but sustain leaks and muddies the phrasing and articulation.

**Why:** the compressor and drive add about 40 dB of gain, so they also raise each note's decay after its note-off to full distortion, and it smears into the next note.

### 4. Note gate (`v2-gate-filtercab` against `v2`)

![Step 4 adds a gate in front of the chain, keyed to the notes](images/chain-4-gate.svg)

- **Note gate:** the amp's input stays open while a note is held and closes over 30 ms after its note-off, like the fretting hand letting go of the string.

A real high-gain rig uses a noise gate on the audio level, and that was tried first, with no measurable effect. The leaking decay sits between about −30 and −50 dB, so a threshold high enough to cut it would also cut a held note's sustain. Only the note-off tells "let go" from "still holding", and Toy MIDI has every note-off, which a real amp doesn't.

Two bars of Open E Mixolydian's muted riff, with each note's held span in green. Without the gate, every note keeps sounding for about a beat after its green span, decaying slowly:

![Without the gate, each muted note's tail decays slowly past its note-off](images/gate-off.svg)

With the gate, the level drops right after each note-off:

![With the gate, each note stops about 30 ms after its note-off](images/gate-on.svg)

| Track                    | Level after note-off, below the notes: v2 | with the gate |
| ------------------------ | ----------------------------------------- | ------------- |
| Quiet-Loud crunch, muted | 16 dB                                     | silent        |
| Quiet-Loud high gain L   | 21 dB                                     | 43 dB         |
| Open E riff, muted       | 12 dB                                     | 50 dB         |
| Open E riff, open        | 7 dB                                      | 53 dB         |

**Heard:** the gate is the fix, with good nuance, though the cut is unusually hard.

### 5. Room (`v2-ir-gate-room` against `v2-ir-gate`)

![Step 5 adds a short room after the cabinet](images/chain-5-room.svg)

- **Room:** three early reflections at 19 to 47 ms, after the amp. A recorded guitar always carries some room, and that's what softens a note's end in real life. A room before the drive would itself get distorted and smear again, and a long one on fast parts would bring the blur back.

**Heard:** all good. This pair was rendered with the IR cabinet.

### 6. Cabinet: none, filters, or IR (`v2-gate-nocab`, `v2-gate-filtercab`, `v2-ir-gate`)

![Step 6 varies only the cabinet: none, filters, or a recorded Marshall IR](images/chain-6-cab.svg)

The same gated chain three ways. The filter cabinet is a 75 Hz high-pass, a steep roll-off from about 5 kHz, a presence bump at 2.4 kHz, and a dip at 450 Hz. The IR is a recorded Marshall 1960A 4×12 cabinet with an SM57.

![Without a cabinet the spectrum stays high above 5 kHz; both cabinets cut it, and the IR also lifts the low end around 100 Hz](images/cabinet.svg)

**Heard:** without a cabinet it sounds fuzzed and bad. The filters and the IR sound different, but neither is clearly better in any particular way, so the filter cabinet is enough for now and a recorded IR is deferred.

**Why:** clipping adds harmonics far above what a guitar speaker reproduces. A real speaker rolls them off from about 5 kHz, so without a cabinet they come through as raw fizz. That roll-off is most of a cabinet's job, which is why the filters and the IR end up close. The IR also carries a speaker resonance around 100 Hz that the filters don't.

## Pitfalls

Two ffmpeg details that silently broke the drive, worth knowing for an implementation:

- **Clipping before the clipper.** ffmpeg kept the 16-bit sample format through the chain, so the +24 dB boost hard-clipped before the tanh stage saw the signal. The chain runs in float.
- **Oversampling that overshoots.** `asoftclip`'s own oversample option produced peaks about 9 dB above full scale. Resampling to 4× around the drive stages explicitly is the textbook way, and it stays bounded.

## Open

- **A cabinet IR, deferred.** The Marshall IR is from https://github.com/fnpngn/IR, a collection of freely shared IRs, and isn't committed here, because its license doesn't say it can be redistributed. Step 6 found no clear gain over the filter cabinet, so an IR that Toy MIDI may ship is a later upgrade, not a requirement.
- **The gate's release.** 30 ms is a quick fretting-hand mute. 50 to 80 ms may sound more natural on open riffs.

## Reproduce

`amp-sim.ts` loads a project as the app does, writes each MIDI track as its own MIDI file with the app's Export MIDI, renders it with fluidsynth on the track's SoundFont, and runs the guitar tracks through the amp. It needs `fluidsynth`, `ffmpeg`, and `ffprobe` on `PATH`, and the bundled SoundFonts from `pnpm fetch-soundfonts`.

Download the two pieces from llm-music-probe:

```sh
mkdir -p /tmp/ampsim
curl -sLo /tmp/ampsim/quiet-loud.json https://raw.githubusercontent.com/hi-ogawa/llm-music-probe/main/compositions/pieces/quiet-loud-in-e/quiet-loud.json
curl -sLo /tmp/ampsim/riff.json https://raw.githubusercontent.com/hi-ogawa/llm-music-probe/main/compositions/pieces/open-e-mixolydian/project.json
```

Each call writes one variant as `<tag>.mp3` and `<tag>-guitars.mp3`, with the guitars soloed:

```sh
run() {
  pnpm amp-sim /tmp/ampsim/quiet-loud.json --out /tmp/ampsim/quiet-loud "$@"
}
run --tag gm --gm
run --tag tele-dry --amp none
run --tag v1 --amp v1
run --tag v2 --amp v2
run --tag v2-ir --amp v2 --ir <cabinet.wav>
run --tag v2-ir-gate --amp v2 --note-gate --ir <cabinet.wav>
run --tag v2-ir-gate-room --amp v2 --note-gate --ir <cabinet.wav> --room
run --tag v2-gate-filtercab --amp v2 --note-gate
run --tag v2-gate-nocab --amp v2 --note-gate --no-cab
```

`--amp none` leaves the guitars as rendered, and `--gm` renders the guitar tracks on General MIDI's Clean (27), Muted (28), Overdriven (29), and Distortion (30) Guitar instead.

Each track renders dry, at the MIDI default volume and centered, because Export MIDI leaves out the mixer's gain and pan, and the script applies them after the amp. The drive depends on input level, so the amp is tuned for that default volume.

The figures come from renders of [`held-note.json`](held-note.json), three notes held for 6 seconds on one high-gain track, and of Open E Mixolydian:

```sh
pnpm amp-sim tools/amp-sim/held-note.json --out /tmp/ampsim/held --tag v1 --amp v1
pnpm amp-sim tools/amp-sim/held-note.json --out /tmp/ampsim/held --tag v2 --amp v2
# /tmp/ampsim/riff.json into /tmp/ampsim/riff, with the tags v2, v2-gate-filtercab, v2-gate-nocab, and v2-ir-gate
pnpm exec tsx tools/amp-sim/gen-figures.ts --held-note /tmp/ampsim/held --riff /tmp/ampsim/riff --riff-project /tmp/ampsim/riff.json
```
