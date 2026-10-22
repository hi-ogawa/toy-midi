# Reverb A/B

An offline prototype for choosing a reverb algorithm before building one into the app (#934). It renders the reverb demo pieces dry and with each candidate reverb on one shared send bus, the routing the app would use, so they can be compared by ear.

- `render-stems.ts` renders each track of each piece on its own through the app, with the `toy-midi render-audio` CLI, by muting every other track. The stems keep each track's amp, EQ, gain, and pan.
- `engines.ts` holds the candidate reverbs, ports of FluidSynth's Freeverb and Dattorro engines with FluidSynth's default settings.
- `mix.ts` sums the stems dry, then feeds every track into each reverb at a send level set by instrument family, after #869's measurements, and writes each version to MP3 at −16 LUFS.

```sh
pnpm exec tsx tools/reverb-ab/render-stems.ts   # about 12 s per stem, 75 stems
pnpm exec tsx tools/reverb-ab/mix.ts            # .tmp/reverb-ab/mp3/<piece>-<dry|freeverb|dattorro>.mp3
```

Both reverbs are set to decay 60 dB in about 1.8 s, so the comparison is of each design's character rather than its tail length.

## Status

Not yet run to completion. The first stem render stopped at 22 of 75 stems, and `render-stems.ts` resumes by skipping stems that exist. FluidSynth's FDN engine, about 1,200 lines, isn't ported.

A lighter A/B may answer the algorithm question first: write each piece to MIDI with a CC 91 reverb send per channel, and play it through FluidSynth with each of its engines (`-o synth.reverb.engine=dat|fdn|free|lex`). That covers all of FluidSynth's engines without porting, at the cost of playing on FluidSynth rather than the app, without the amp. This tool stays useful for checking the routing the app would use once an engine is chosen.

## License

`engines.ts` is ported line by line from FluidSynth's LGPL-2.1 source and carries that license in its header. Freeverb itself is public domain.
