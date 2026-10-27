# Band-Limited Oscillators

Toy MIDI's synth computes its waveforms from a formula, one sample at a time, and a sawtooth or square computed that way aliases, because its jumps carry harmonics far above what the sample rate can hold. This document shows where that aliasing comes from, why filtering or oversampling doesn't remove it, and how the [synth](../../src/lib/dsp/subtractive-synth.ts) rounds each jump with a correction called PolyBLEP. It builds on [See Why Clipping Aliases](oversampling.md#see-why-clipping-aliases), which explains how a frequency above the Nyquist frequency folds back below it.

Throughout, $F_s$ is the sample rate, 48 kHz in the examples, $f_0$ is the note's frequency, and the oscillator's **phase** $\varphi$ runs from 0 to 1 over each cycle, advancing by $\Delta=f_0/F_s$ cycles per sample.

## See Why a Jump Aliases

The oscillator reads each waveform at its phase. The sawtooth is $2\varphi-1$, which rises from −1 to 1 and then jumps back down, and the square is 1 for the first half of the cycle and −1 for the second. Written as sums of sines, the waveforms have these harmonics:

| Waveform | Harmonics            | Amplitude of the $n$th |
| -------- | -------------------- | ---------------------- |
| Sine     | the fundamental only |                        |
| Triangle | odd                  | $8/(\pi^2n^2)$         |
| Sawtooth | every one            | $2/(\pi n)$            |
| Square   | odd                  | $4/(\pi n)$            |

**How fast the harmonics fall depends on the sharpest feature of the shape.** The sawtooth and square jump, and their harmonics fall as $1/n$, which is 6 dB per octave. The triangle never jumps, but its slope changes suddenly at each corner, and its harmonics fall as $1/n^2$, which is 12 dB per octave. The two are related by integration. The triangle's slope is a square wave, so the triangle is a square integrated, and integrating divides the $n$th harmonic by its frequency, which adds one more factor of $n$.

**The harmonics never stop, so some always fold.** Computing the waveform sample by sample is the same as sampling the ideal waveform, so every harmonic above $F_s/2$ folds back as an alias. For a sawtooth at 1 kHz, the 25th harmonic, at 25 kHz, is the first past the 24 kHz Nyquist frequency, and it lands at 23 kHz only 28 dB below the fundamental, because $1/25$ is −28 dB. The harmonics near 48 kHz are still only about 34 dB down, and they fold to just above 0 Hz, where the ear is far more sensitive than near 24 kHz. The aliases don't fall on multiples of $f_0$, so they sound like inharmonic tones, and they move the wrong way when the pitch moves. The same 25th harmonic of a 1 kHz triangle is 56 dB down, since $1/25^2$ is −56 dB.

## Rule Out Filtering Afterwards and Oversampling

**A low-pass after the oscillator can't remove aliasing.** Once a harmonic has folded, it's a component inside the band like any other, at a frequency the waveform should have had nothing at. A filter can only act on frequencies, so it can't separate the alias from the waveform. A subtractive synth's own filter is no help for the same reason, because it comes after the folding.

**Oversampling only pushes the problem higher.** The [amp's drive](guitar-amp-simulation.md) runs at 4× the rate, so that harmonics up to 96 kHz are represented and filtered out before returning to 48 kHz. That works for the drive because a clipper's harmonics are weak by 96 kHz. A sawtooth's harmonics still fall only as $1/n$, so the ones past 96 kHz fold just as before, four times higher and so only 12 dB quieter. The table below includes a sawtooth computed at 4× and brought back to 48 kHz through an ideal low-pass, which is the best that oversampling can do.

## Replace Each Jump with a Band-Limited Step

Between its jumps the sawtooth is a straight line, which has no high harmonics, so all the aliasing comes from the jumps. A jump is a step, and the step has a band-limited version, which is what a perfect low-pass at $F_s/2$ would turn it into. With $t$ counted in samples from the jump, that is the integral of the sinc from [Upsample by Interpolating](oversampling.md#upsample-by-interpolating),

$$
S(t)=\int_{-\infty}^{t}\text{sinc}(u)\,du,
$$

which rises smoothly through the jump instead of all at once and ripples on both sides of it, as the blue curve in the figure below shows.

So each jump in the naive waveform can be swapped for this step by adding the difference between them, which is the band-limited step minus the naive step. That difference is the **BLEP**, short for band-limited step. It's large next to the jump and dies away on either side, and adding it at every jump turns the naive waveform into the band-limited one. The oscillator knows a jump is coming, because the phase says when it will wrap, so it can correct the samples before the jump as well as after.

![The naive step jumps from −1 to 1 at the jump. The band-limited step rises smoothly through it and ripples on both sides, and the PolyBLEP step rises smoothly over one sample on each side with no ripple. Their differences from the naive step are largest next to the jump, where the PolyBLEP difference matches the band-limited one closely, and the band-limited difference ripples on for several samples](images/band-limited-steps.svg)

The exact BLEP never ends, so a real oscillator needs an approximation. Tabulating a shortened BLEP is one way. It's accurate, but it needs a table and spreads each correction over many samples.

## Approximate the Step with Two Polynomial Pieces

**PolyBLEP builds the step from linear interpolation's bump instead of the sinc.** The triangle two samples wide, $b(t)=1-|t|$ for $|t|\lt1$, is the bump of [linear interpolation](oversampling.md#upsample-by-interpolating), a much cruder low-pass than the sinc, but it's short. Its integral gives a step that rises over one sample on each side of the jump,

$$
S(t)=\begin{cases}
\tfrac{1}{2}(1+t)^2 & -1\le t\le0,\\
1-\tfrac{1}{2}(1-t)^2 & 0\le t\le1,
\end{cases}
$$

and subtracting the naive step, 0 before the jump and 1 after it, leaves two pieces,

$$
r(t)=\begin{cases}
\tfrac{1}{2}(1+t)^2 & -1\lt t\le0,\\
-\tfrac{1}{2}(1-t)^2 & 0\le t\lt1.
\end{cases}
$$

**Only the two samples next to a jump change.** The pieces are zero beyond one sample from the jump, so only the last sample before it and the first sample after it need correcting. The phase gives their distance from the jump. A sample whose phase is $\varphi\lt\Delta$ is $t=\varphi/\Delta$ samples after the wrap, and one with $\varphi\gt1-\Delta$ is $t=(\varphi-1)/\Delta$ samples before it, which is negative.

**The synth's correction is this difference, for a jump of 2.** The sawtooth and square jump between −1 and 1, which is twice the unit step, so the correction is $2r(t)$. That's $(1+t)^2=t^2+2t+1$ before the jump and $-(1-t)^2=2t-t^2-1$ after it, the two branches in the code. The sawtooth jumps down at $\varphi=0$, so it subtracts the correction. The square jumps up at $\varphi=0$ and down at $\varphi=\tfrac{1}{2}$, so it adds the correction at its phase and subtracts it half a cycle later:

![A 4 kHz sawtooth sampled at 48 kHz. Every sample sits on the naive sawtooth except the two on either side of each jump, which move toward the middle of the jump](images/band-limited-sawtooth.svg)

**The corrected waveform is the ideal one passed through the triangle's low-pass, then sampled.** This is exact rather than approximate. The naive sawtooth is an endlessly rising line plus a step down at every wrap. Convolving a straight line with a symmetric bump that sums to 1 gives back the same line, and convolving a step with $b$ gives the step $S$ above. So the ideal sawtooth convolved with $b$ is the naive one plus $-2r$ at every jump, which is the corrected sawtooth, and the same holds for the square, which is made of steps alone. In frequency, that means each harmonic is scaled by the triangle's spectrum, $\text{sinc}^2(f/F_s)$, before the waveform is sampled, and two consequences follow:

- **Aliases that would land at low frequencies nearly vanish.** The triangle's spectrum is zero at every multiple of $F_s$, so the harmonics near 48 kHz and 96 kHz, which would fold to just above 0 Hz, are cut deeply before they fold. Below 5 kHz, the correction lowers the loudest alias by about 40 dB.
- **Aliases close to 24 kHz and the top harmonics are cut only a little.** The spectrum is about 0.4 at $F_s/2$, which is −7.8 dB, so harmonics just past 24 kHz fold back to just below it only about 8 dB quieter. The same factor dulls the waveform's own top, by 1.2 dB at 10 kHz and 5.3 dB at 20 kHz, which the spectrum of the corrected sawtooth shows as harmonics falling below their ideal $1/n$ level.

![The naive 1 kHz sawtooth has aliases everywhere between its harmonics, from 30 to 50 dB below the fundamental. After the correction, the aliases below a few kHz are 70 dB or more down and grow toward 24 kHz, while the harmonics fall below their ideal level near the top](images/band-limited-spectrum.svg)

So the aliasing that remains sits near the top of the band, where the ear is least sensitive.

## Measure the Aliasing

The synth rendered each note at a frequency that fits the analysis window exactly, so the spectrum needs no window and every harmonic and alias lands on its own frequency. The naive and 4× columns compute the sawtooth the same way without the correction. The first number is the energy of all the aliases from 0 to 24 kHz relative to the harmonics, and the second, in parentheses, is the loudest alias below 5 kHz relative to the fundamental:

| Note    | Sawtooth, naive | Sawtooth, 4× with an ideal low-pass | Sawtooth, PolyBLEP | Triangle, uncorrected |
| ------- | --------------- | ----------------------------------- | ------------------ | --------------------- |
| 254 Hz  | −22 dB (−45)    | −35 dB (−57)                        | −38 dB (−83)       | −67 dB (−89)          |
| 1006 Hz | −16 dB (−33)    | −29 dB (−45)                        | −31 dB (−71)       | −49 dB (−65)          |
| 4007 Hz | −9 dB (−21)     | −22 dB (−33)                        | −23 dB (−63)       | −31 dB (−42)          |

The square measures the same as the sawtooth or up to 5 dB lower. PolyBLEP, which changes two samples per jump at the original rate, does slightly better than ideal 4× oversampling over the full band, and 26 to 30 dB better below 5 kHz.

## Leave the Triangle's Corners Uncorrected for Now

The triangle has no jumps, and its harmonics already fall as $1/n^2$, so the synth computes it without a correction. For low notes that's enough, but the table shows its limit. From about 1 kHz up, the uncorrected triangle has louder aliases below 5 kHz than the corrected sawtooth, and at 4 kHz it's 21 dB worse.

The triangle's corners can be corrected the same way. A corner is a change of slope, which is a ramp, 0 before the corner and $t$ after it. Convolving the ramp with $b$, as with the step, gives the **BLAMP**, short for band-limited ramp. Its difference from the naive ramp is the integral of $r$, $\tfrac{1}{6}(1+t)^3$ before the corner and $\tfrac{1}{6}(1-t)^3$ after it, scaled by the change of slope per sample. The triangle's slope changes by $8\Delta$ at each corner, so the correction grows with the note's frequency, which matches where the uncorrected triangle falls behind.

## References

- T. Stilson and J. Smith, [Alias-Free Digital Synthesis of Classic Analog Waveforms](https://ccrma.stanford.edu/~stilti/papers/blit.pdf), band-limited impulse trains, where the idea of building a waveform from band-limited discontinuities comes from
- E. Brandt, [Hard Sync Without Aliasing](https://www.cs.cmu.edu/~eli/papers/icmc01-hardsync.pdf), the BLEP as a table of the band-limited step's difference from the naive one, added at each jump
- V. Välimäki, J. Pekonen, and J. Nam, [Perceptually Informed Synthesis of Bandlimited Classical Waveforms Using Integrated Polynomial Interpolation](https://doi.org/10.1121/1.3651227), the polynomial BLEP and BLAMP corrections and how audible their remaining aliases are
- [PolyBLEP discussion on KVR Audio](https://www.kvraudio.com/forum/viewtopic.php?t=375517), the two-sample form the synth follows
