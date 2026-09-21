# Onset Detection from Spectral Changes

A bass line can strike the same pitch several times without falling silent between notes. Pitch tracking sees little change, and a loudness gate may stay open throughout. To separate those notes, we need evidence of a fresh attack within an already sounding region.

An attack often renews energy across several frequencies, including upper harmonics that had faded during the previous note. Comparing successive short-time spectra lets us detect that renewal even when the fundamental pitch stays the same. The [Python reference](../../tools/bass-pitch/main.py) uses librosa’s `onset_strength` for this, and the Rust implementation follows its **mel-banded log spectral flux** construction with simplified band aggregation. Each part of the name describes which changes contribute to the onset score.

## Compare Energy at a Useful Frequency Resolution

Take one short, windowed piece of audio, called a **frame**, and compute its Fourier transform. The FFT returns complex coefficients at equally spaced frequencies. Each frequency position is a **bin**, and the squared magnitude of its coefficient measures power there. With our 2048-sample frames at 22050 Hz, neighboring bins are about 10.8 Hz apart.

A **band** is a wider frequency interval that collects several neighboring bins. We sum their powers to describe how much energy lies in that interval. In the figure, band A contains bins 0 and 1, so its power is $2+5=7$.

![Equally spaced FFT bins grouped into three illustrative frequency bands. Summing the bin powers produces one value per band, with totals 7, 7, and 13.](images/fft-bins-and-bands.svg)

Repeat this calculation as the window moves along the audio to obtain a short-time Fourier transform (STFT). We can then compare the same frequency band between successive frames.

Individual bins are too sensitive for our purpose. As a window moves along a tone, its measured power can redistribute between neighboring bins. For example, two bins changing from $(10,2)$ to $(8,4)$ retain total power $12$. Counting only positive bin changes would nevertheless report an increase of $2$.

Summing within bands before comparing frames avoids that false increase. If $X_t(k)$ is the FFT coefficient of bin $k$ in frame $t$, and $\mathcal{B}_b$ is the set of bins in band $b$, its power is:

$$
E_t(b)=\sum_{k\in\mathcal{B}_b}|X_t(k)|^2.
$$

Now redistribution inside a band leaves its energy unchanged. This reduces false onset evidence, although changes crossing band boundaries can still contribute.

### Mel Bands Allocate More Resolution to Low Frequencies

The choice of frequency scale determines which bins get pooled together. Mel spacing gives narrow bands at low frequencies and wider bands at high frequencies, without crowding the low end as strongly as a pure logarithmic scale.

![Ten equal steps in linear frequency, mel, and log frequency mapped onto the same Hz axis. Mel bands widen toward high frequencies, while pure log bands crowd more tightly near zero.](images/mel-band-spacing.svg)

The figure uses ten bands to make the spacing visible. The implementation uses 128 equal steps in the HTK mel coordinate $m(f)=2595\log_{10}(1+f/700)$, from zero to Nyquist. This curve is approximately linear at low frequencies and logarithmic at high frequencies. Band spacing determines how much frequency detail survives the sum.

Our Rust implementation uses simple band sums. [Librosa defaults](https://librosa.org/doc/main/api/generated/librosa.mel_frequencies.html) to a different mel variant and overlapping triangular filters, so the exact band weights differ.

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

A centered window sees an attack before its center reaches it. The implementation delays the resulting score by half a window to compensate for this lookahead, though the exact peak position still depends on the signal. Our pipeline then adds normalization by the 95th percentile of positive flux values and clips to $[0,1]$. This step comes from the Python evaluation harness, rather than librosa’s `onset_strength`. This sets a relative scale within the excerpt, rather than a probability of a new note.

This normalization is an empirical heuristic with no established calibration to attack strength. Changing other parts of the excerpt can change the denominator and therefore the split decision for the same local flux. Even weak fluctuations can reach 1 if they form the excerpt's upper tail. The peak-relative floors add further excerpt dependence. [Issue #253](https://github.com/hi-ogawa/toy-midi/issues/253) tracks evaluation of these effects and possible alternatives. No replacement has been selected.

The [pipeline](algorithm.md#fresh-attacks-split-the-runs) takes the maximum score in each grid cell and uses it to split active regions. Spectral renewal is evidence, not a unique signature of an attack. Vibrato, noise, or a timbre change can also raise the score, while a soft rearticulation may provide little contrast. That is why activity, onset, and pitch remain separate decisions.
