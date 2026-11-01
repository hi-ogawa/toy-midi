# Noise Colors

A tone is described by its waveform: play the same samples and you hear the same note. Noise is the opposite. Two recordings of hiss sound identical even though no two of their samples match, so its samples can't be what we hear. What two recordings of hiss share is how their power is spread over frequency, their **spectrum**, and how their level changes over time. Those two properties are all a sound designer controls when using noise as a source, and they are what lets a reverb fake a room's tail.

This document shows why a noise signal is described by its spectrum, then builds the three common **colors** of noise, white, pink, and brown, each as the same random generator followed by a different filter. It builds on [Filter by Convolving with a Kernel](fourier-series.md#filter-by-convolving-with-a-kernel), which explains a filter as a gain on each frequency.

Throughout, $F_s$ is the sample rate, 48 kHz in the examples.

## Describe Noise by Its Spectrum

The simplest noise generator draws each sample at random, independently of every other, with mean 0 and variance $\sigma^2$. A seeded random-number generator does this, and two different seeds give two signals with no samples in common.

**Every frequency gets the same power on average.** Take a block of $N$ samples and its discrete Fourier transform,

$$
X_k=\sum_{n=0}^{N-1}x[n]\cdot e^{-2\pi ikn/N}.
$$

Each bin $X_k$ is a sum of $N$ independent terms. Its expected power multiplies the sum by its conjugate, and every cross term $\mathrm{E}\big[x[n]x[m]\big]$ with $n\neq m$ is 0, because independent samples with mean 0 don't correlate:

$$
\mathrm{E}|X_k|^2=\sum_n\sum_m\mathrm{E}\big[x[n]x[m]\big]\cdot e^{-2\pi ik(n-m)/N}=\sum_n\sigma^2=N\sigma^2.
$$

The result doesn't depend on $k$, so every bin has the same expected power. Bins are equally spaced in hertz, so the power per hertz is the same across the whole band. By analogy with white light, which mixes every visible frequency, this is called **white noise**. How the samples are distributed, uniform or Gaussian, changes how large the peaks get but not the spectrum, since only independence and $\sigma^2$ entered the sum.

**The spectrum is what the two seeds share.** Each bin's phase is random, and a single block's bin powers scatter around $N\sigma^2$ about as widely as the average itself. What stays the same from seed to seed and from block to block is the average, the **power spectrum**. Rice (1944) made this the standard way to describe a random signal. The ear doesn't follow individual bins either. It resolves sound into bands that are hundreds of hertz wide above about 1 kHz, each covering many bins, so what it hears from noise is the power in each band and how that power moves over time.

**A slowly changing level keeps the spectrum's shape.** Multiplying noise by an envelope that changes slowly compared with the frequencies in the noise scales its power, and leaves the shape of its spectrum alone. So a noise sound is fully described by two things: its spectrum, set by filtering, and its level over time, set by an envelope. That pair covers a lot of what we hear:

- **Hi-hats and snares.** A closed hat is noise high-passed into the top octaves, with a decay of a few tens of milliseconds. A snare is a drum tone plus a band of noise for the wires.
- **Reverb tails.** Once a room's echoes overlap, its response is heard as noise with a falling level. Moorer (1979) tried exponentially decaying white noise as a reverb's late response, and it sounds natural. A real room's tail differs mainly in that its highs decay faster than its lows. The [reverb doc](https://github.com/hi-ogawa/toy-midi/pull/988) relies on this. A plate only has to produce noise whose level falls at the right rate in each band, not a particular room's samples.

## Shape Noise with a Filter

A filter scales each frequency by its gain $H(f)$. For a block much longer than the filter's response, each output bin is the input bin scaled by the gain at that bin's frequency, $Y_k\approx H(f_k)\cdot X_k$, so

$$
\mathrm{E}|Y_k|^2\approx|H(f_k)|^2\cdot N\sigma^2.
$$

Filtering white noise gives noise whose power spectrum is the filter's squared gain. The phases stay random, so the result is still noise, and any spectrum shape can be made from the same white source by choosing $H$.

**The colors are power laws.** The named colors have power spectra $S(f)\propto f^{-\alpha}$. Doubling $f$ multiplies the power per hertz by $2^{-\alpha}$, which is

$$
10\log_{10}2^{-\alpha}\approx-3\alpha\text{ dB per octave}.
$$

**White** noise has $\alpha=0$ and is flat. **Pink** noise has $\alpha=1$ and falls 3 dB per octave. **Brown** noise has $\alpha=2$ and falls 6 dB per octave. The filter that makes each from white noise has gain $|H(f)|\propto f^{-\alpha/2}$.

![Measured power per hertz of 60 s of noise at 48 kHz, set to 0 dB at 1 kHz on a log frequency axis. White is flat. Pink falls from about +16 dB at 20 Hz to −12 dB at 20 kHz, and brown from +34 dB to −23 dB. White through a 2-pole low-pass at 1 kHz follows white up to the cutoff, is 3 dB down at 1 kHz, and then falls far more steeply than brown](images/noise-colors-spectra.svg)

**Per octave, pink is the flat one.** An octave from $f$ to $2f$ is twice as wide in hertz as the octave below it. Its power is the integral of $S$ across it, and substituting $u=f'/f$ turns every octave into the same integral times $f^{1-\alpha}$:

$$
\int_f^{2f}f'^{-\alpha}df'=f^{1-\alpha}\int_1^2u^{-\alpha}du.
$$

So going up an octave multiplies an octave band's power by $2^{1-\alpha}$. White noise gets 3 dB more power in each octave than in the one below, pink gets the same in every octave, and brown 3 dB less. The noise in the figure measures this to within 0.4 dB from 125 Hz to 16 kHz.

That explains two things a DAW shows. An FFT analyzer, whose bins are equally spaced in hertz, draws white noise flat. A real-time analyzer with octave or third-octave bands draws pink noise flat and white noise rising 3 dB per octave. Musical pitch is also heard in octaves, so pink noise, with the same power in every octave, sounds evenly balanced from low to high, while white noise sounds bright and hissy because most of its octaves are near the top. That's why pink noise is the usual signal for setting up speakers and comparing a mix's tonal balance.

## Make Brown Noise with a Leaky Integrator

Brown noise needs $|H(f)|\propto1/f$, which is what integration does: integrating a sine of frequency $f$ divides its amplitude by $2\pi f$. The discrete integrator is a running sum, $y[n]=y[n-1]+x[n]$. Summing independent random steps is a random walk, which is also the path of a particle in Brownian motion, so the name comes from Robert Brown rather than the color.

A pure running sum wanders without bound, because its variance grows by $\sigma^2$ every sample. So the integrator leaks a little each sample,

$$
y[n]=x[n]+a\cdot y[n-1],\qquad a=1-\frac{2\pi f_c}{F_s},
$$

which is a one-pole low-pass with its corner at $f_c$. Above $f_c$ it falls 6 dB per octave like an integrator. Below $f_c$ it's flat, which keeps the output bounded. A corner of a few hertz puts the flat part below hearing, and the figure's brown noise uses 5 Hz. Brown noise sounds like a deep rumble, like distant surf.

## Approximate Pink Noise with Alternating Poles and Zeros

Pink noise needs $|H(f)|\propto1/\sqrt f$, which falls 3 dB per octave. That is half the slope of one pole, and no finite filter has it. A filter built from delays, like every biquad and one-pole in this app, has a gain made of poles and zeros. Well above its corner, a pole contributes −6 dB per octave and a zero +6, and well below its corner, either contributes nothing. So between and beyond its corners, the slope of any such filter is a whole multiple of 6 dB per octave, and −3 can only be approximated.

**Alternating poles and zeros averages the slope to −3.** Put a pole's corner, then a zero's corner a little higher, then another pole, and so on, evenly spaced on a log axis. Above each pole the slope steps to −6, and above the following zero it returns to 0, so the gain falls in a staircase of alternating steep and flat stretches. With corners closer together than the steps can resolve, the staircase blurs into a straight line at the average slope, −3 dB per octave. More corners cover a wider band, and closer spacing makes the line straighter.

Smith gives a three-pole, three-zero filter of this kind:

$$
H(z)=\frac{0.049922035-0.095993537z^{-1}+0.050612699z^{-2}-0.004408786z^{-3}}{1-2.494956002z^{-1}+2.017265875z^{-2}-0.522189400z^{-3}}.
$$

At 48 kHz its corners fall at about 37 Hz for a pole, then 137 Hz for a zero, 442 Hz for a pole, 1.4 kHz for a zero, 4.5 kHz for a pole, and 17 kHz for a zero, each about a factor of 3 above the last. The pink noise in the figure is white noise through this filter, and its slope, measured over stretches of two to four octaves, stays between −2.7 and −3.2 dB per octave from 100 Hz to 16 kHz.

## Tell Band-Limited Noise from a Color

The synth's filter is a resonant low-pass made of one [biquad](digital-filters/low-pass-and-high-pass.md#cascade-sections-for-a-steeper-rolloff), so it has two poles and falls 12 dB per octave above its cutoff. Low-pass filtering is a natural way to darken noise, but this filter doesn't make pink or brown noise.

**Its slope and its starting point are both wrong for a color.** A color's slope runs across the whole audible band at 3 or 6 dB per octave. White noise through the low-pass stays flat up to the cutoff, then falls 12 dB per octave, as the dashed curve in the figure shows. That's **band-limited** noise, white below the cutoff and nearly silent well above it. Lowering the cutoff to 20 Hz doesn't turn it into brown noise either, because above the cutoff its power falls as $f^{-4}$, twice brown's slope, which leaves a dull, quiet rumble. Colors come from a fixed filter designed for the slope, like the two above, and a voice's filter after that shapes the colored noise further.

**Band-limited noise is still the workhorse of synthesized noise.** It's what you hear when a synth's filter acts on noise:

- **Wind and risers.** Sweeping the cutoff moves the band's top edge, and the ear follows that edge almost like a pitch. A slow sweep up and down sounds like wind, and a cutoff rising over a few bars is the classic riser into a drop. Raising the resonance adds a peak at the cutoff, which turns the sweep into a whistle.
- **Air on a pad.** A quiet layer of noise with only its top octaves kept adds breath and shimmer above a pad, like the bow and breath noise of real instruments.
- **Percussion.** Short envelopes on high or narrow bands of noise give hats, shakers, and the snare's wires from the first section.

## References

- S. O. Rice, "Mathematical Analysis of Random Noise", Bell System Technical Journal, vol. 23, 1944, and vol. 24, 1945, a random signal described by its power spectrum
- J. A. Moorer, "About This Reverberation Business", Computer Music Journal, vol. 3, no. 2, 1979, exponentially decaying noise as a reverb's late response
- J. O. Smith, [Desired Qualities in Late Reverberation](https://ccrma.stanford.edu/~jos/pasp/Desired_Qualities_Late_Reverberation.html), in _Physical Audio Signal Processing_, Moorer's experiment and why a natural tail is decaying noise whose highs fade faster
- J. O. Smith, [Example: Synthesis of 1/f Noise (Pink Noise)](https://ccrma.stanford.edu/~jos/sasp/Example_Synthesis_1_F_Noise.html), in _Spectral Audio Signal Processing_, why no finite filter makes exact pink noise, and the three-pole, three-zero approximation above
