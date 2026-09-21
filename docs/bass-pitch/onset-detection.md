# Onset Detection from Spectral Changes

A bass line can strike the same pitch several times without falling silent between notes. Pitch tracking sees little change, and a loudness gate may stay open throughout. To separate those notes, we need evidence of a fresh attack within an already sounding region.

An attack often renews energy across several frequencies, including upper harmonics that had faded during the previous note. Comparing successive short-time spectra lets us detect that renewal even when the fundamental pitch stays the same. Our **mel-banded log spectral flux** is one way to turn those changes into a single onset score. Each part of the name is a choice about which changes should count.

## Compare Energy at a Useful Frequency Resolution

Take the Fourier transform of a short, windowed piece of audio. Repeating this at successive positions gives a short-time Fourier transform (STFT). If $X_t(k)$ is the complex coefficient at frequency bin $k$ in frame $t$, then $|X_t(k)|^2$ measures its power on a common FFT scale.

Individual bins are too sensitive for our purpose. As a window moves along a tone, its measured power can redistribute between neighboring bins. For example, two bins changing from $(10,2)$ to $(8,4)$ retain total power $12$. Counting only positive bin changes would nevertheless report an increase of $2$.

Instead, group nearby bins into a band and sum their power first:

$$
E_t(b)=\sum_{k\in\mathcal{B}_b}|X_t(k)|^2.
$$

Now redistribution inside a band leaves its energy unchanged. This reduces false onset evidence, although changes crossing band boundaries can still contribute.

### Mel Bands Allocate More Resolution to Low Frequencies

Equal-width bands in hertz are not the only useful grouping. The **mel scale** is a perceptually motivated frequency coordinate that expands low frequencies relative to high ones. Our implementation uses

$$
m(f)=2595\log_{10}\left(1+\frac{f}{700}\right)
$$

and divides this coordinate into 128 equal intervals, from zero to the Nyquist frequency. Each FFT bin belongs to one interval. These are simple band sums, rather than overlapping triangular filters.

The shape matters more than the constants. Since $m'(f)$ is proportional to $1/(700+f)$, equal steps in $m$ correspond to wider intervals in hertz as frequency rises. We retain more detail among low-frequency components and pool more broadly higher up. This is a resolution choice for the detector, not a condition needed for detecting an attack.

## Measure Relative Growth and Discard Decay

Raw power differences favor already strong bands. We instead express band power logarithmically, using $\ell_t(b)=10\log_{10}E_t(b)$. Away from the floor used near silence, its change is

$$
\ell_t(b)-\ell_{t-1}(b)=10\log_{10}\frac{E_t(b)}{E_{t-1}(b)}.
$$

Thus doubling power contributes about $3$ dB whether a band goes from $1$ to $2$ or from $100$ to $200$. The score responds to proportional renewal, so weak upper harmonics can contribute alongside a strong fundamental. A constant recording gain also cancels from this ratio. Near silence, a floor is essential to keep tiny powers from producing large log differences.

A fading band should not provide evidence of a new attack, but it should not cancel growth elsewhere either. Apply the positive part to each band's log change and then average:

$$
F_t=\frac{1}{B}\sum_{b=1}^{B}\max\bigl(0,\ell_t(b)-\ell_{t-1}(b)\bigr).
$$

This is the **spectral flux** used here. “Rectification” means replacing negative changes with zero. The order is consequential. We pool power within each band before comparing frames, but keep the positive changes separately across bands before averaging.

![Two successive log-power spectra in four illustrative bands, followed by their positive differences. A three-decibel fall contributes zero, while rises of six and three decibels survive.](images/onset-spectral-flux.svg)

In this example, the band changes are $(-3,0,6,3)$ dB. Their positive parts are $(0,0,6,3)$, so $F_t=2.25$ dB. The spectrum need not grow everywhere for the score to rise.

## Turn Renewal into Note Boundaries

The [Rust implementation](../../crates/bass-pitch/src/lib.rs) uses 2048-sample windows at 22050 Hz, advanced by 256 samples. Each comparison therefore sees about 93 ms of audio and updates every 11.6 ms. It floors log power at 80 dB below the excerpt's peak, in addition to an absolute numerical floor, and suppresses flux far below the peak as rounding noise.

A centered window sees an attack before its center reaches it. The implementation delays the resulting score by half a window to compensate for this lookahead, though the exact peak position still depends on the signal. It then divides by the 95th percentile of positive flux values and clips to $[0,1]$. This sets a relative scale within the excerpt, rather than a probability of a new note.

The [pipeline](algorithm.md#stage-2-the-grid-as-decision-unit) takes the maximum score in each grid cell and uses it to split active regions. Spectral renewal is evidence, not a unique signature of an attack. Vibrato, noise, or a timbre change can also raise the score, while a soft rearticulation may provide little contrast. That is why activity, onset, and pitch remain separate decisions.
