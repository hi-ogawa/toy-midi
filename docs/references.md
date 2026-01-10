# References

## Primary Reference Projects

| Project                | GitHub                                                                        | Demo                                                 | Why Reference                                         |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Signal**             | [ryohey/signal](https://github.com/ryohey/signal)                             | [signalmidi.app](https://signalmidi.app/)            | Closest match - React+TS MIDI piano roll, MIT, active |
| **react-midi-editor**  | [chanyatfu/react-midi-editor](https://github.com/chanyatfu/react-midi-editor) | [demo](https://react-midi-editor-demo.vercel.app)    | React component with selection, copy/paste, undo      |
| **webaudio-pianoroll** | [g200kg/webaudio-pianoroll](https://github.com/g200kg/webaudio-pianoroll)     | [demo](https://g200kg.github.io/webaudio-pianoroll/) | Standalone vanilla JS piano roll UI                   |

## Secondary Reference Projects (Full DAWs)

| Project               | GitHub                                                                      | Demo                                                  | Notes                               |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| **openDAW**           | [andremichelle/openDAW](https://github.com/andremichelle/openDAW)           | [opendaw.studio](https://opendaw.studio)              | TS, plugin architecture, AGPL       |
| **GridSound**         | [gridsound/daw](https://github.com/gridsound/daw)                           | [daw.gridsound.com](https://daw.gridsound.com)        | Vanilla JS, pattern sequencer, AGPL |
| **BeepBox**           | [johnnesky/beepbox](https://github.com/johnnesky/beepbox)                   | [beepbox.co](https://www.beepbox.co/)                 | TS, URL-based storage, MIT          |
| **waveform-playlist** | [naomiaro/waveform-playlist](https://github.com/naomiaro/waveform-playlist) | [demo](https://naomiaro.github.io/waveform-playlist/) | React+Tone.js, audio editing, MIT   |
| **AudioMass**         | [pkalogiros/AudioMass](https://github.com/pkalogiros/AudioMass)             | [audiomass.co](https://audiomass.co/)                 | Vanilla JS, ~65kb, waveform editor  |

## Core Libraries

| Library          | GitHub                                              | npm            | Purpose                         |
| ---------------- | --------------------------------------------------- | -------------- | ------------------------------- |
| **Tone.js**      | [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js) | `tone`         | Audio engine, transport, synths |
| **@tonejs/midi** | [Tonejs/Midi](https://github.com/Tonejs/Midi)       | `@tonejs/midi` | MIDI file read/write            |
| **Zustand**      | [pmndrs/zustand](https://github.com/pmndrs/zustand) | `zustand`      | State management                |

## Other Useful References

| Resource      | URL                                                                   | Purpose       |
| ------------- | --------------------------------------------------------------------- | ------------- |
| Web Audio API | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | API docs      |
| Web MIDI API  | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)  | Hardware MIDI |

## Local Reference Setup

Clone into `refs/` (gitignored) e.g.

```bash
pnpm dlx tiged https://github.com/ryohey/signal.git refs/signal
pnpm dlx tiged https://github.com/Tonejs/Tone.js.git refs/Tone.js
```
