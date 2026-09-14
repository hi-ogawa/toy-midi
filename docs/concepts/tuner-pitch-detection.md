# Real-Time Tuner Pitch Detection

The recorder tuner estimates one fundamental frequency from the latest mono input window. Its implementation in `src/lib/tuner-analyser.ts` uses the core of YIN: compare the waveform with delayed copies of itself, normalize those comparisons, and interpret the first convincing match as the period.

The pitch estimate follows classic YIN: a difference function, cumulative mean normalization, first-threshold trough selection, and parabolic interpolation. The surrounding runtime policy is specific to this tuner: its window and update cadence, frequency range, and silence and confidence states are local design choices. Their current values are prototype starting points rather than parameters tuned against a representative recording corpus.

The important shift in viewpoint is that the algorithm searches for a **period measured in samples**, not a frequency directly. If a waveform repeats after $\tau$ samples at sample rate $F_s$, then its frequency is

$$
f=\frac{F_s}{\tau}.
$$

A longer period therefore means a lower pitch. Doubling $\tau$ moves the result down one octave.

## Analysis Window

Every update reads the latest $N=4096$ samples from a Web Audio `AnalyserNode`. Updates occur at most once every 50 ms, so consecutive windows overlap. At 48 kHz, one window contains about 85 ms of audio.

The tuner searches from 30 Hz to 500 Hz. That frequency range becomes a candidate-lag range:

$$
\tau_{\min}=\left\lfloor\frac{F_s}{500}\right\rfloor,
\qquad
\tau_{\max}=\min\left(\left\lceil\frac{F_s}{30}\right\rceil,\left\lfloor\frac{N}{2}\right\rfloor\right).
$$

At 48 kHz, the input contains 48,000 samples per second. Dividing samples per second by cycles per second gives samples per cycle, so the bounds are

$$
\tau_{\min}=\left\lfloor\frac{48000}{500}\right\rfloor=96,
\qquad
\tau_{\max}=\min\left(\left\lceil\frac{48000}{30}\right\rceil,\left\lfloor\frac{4096}{2}\right\rfloor\right)=\min(1600,2048)=1600.
$$

The candidate periods therefore run from 96 through 1600 samples. For comparison, A2 at 110 Hz has a period of about 436 samples, while E1 at 41.2 Hz has a period of about 1165 samples.

Lower notes leave fewer waveform cycles inside the same window. At 30 Hz, the window contains only $4096/1600=2.56$ cycles, compared with about $4096/1165\approx3.52$ cycles at E1. This gives the detector only a few repetitions of a low note to establish periodicity. A longer window would supply more cycles, but would also retain older audio for longer after a note change.

## Separate Presence from Pitch Evidence

Before looking for periodicity, the tuner removes the window's DC offset and measures its root mean square amplitude. For samples $x_j$ with mean $\bar{x}$,

$$
\bar{x}=\frac{1}{N}\sum_{j=0}^{N-1}x_j,
\qquad
r=\sqrt{\frac{1}{N}\sum_{j=0}^{N-1}(x_j-\bar{x})^2}.
$$

The amplitude becomes a dBFS-like level:

$$
L=20\log_{10}(r).
$$

If $L\le-50$ dB, the result is `silent` and pitch analysis stops. This decision is deliberately separate from periodicity confidence. An audible noisy or transient window is not silent merely because it lacks a stable pitch; it becomes `unstable` later instead.

## Measure Repetition with a Difference Function

For every candidate lag $\tau$, compare the waveform with a copy shifted by $\tau$ samples:

$$
d(\tau)=\sum_{j=0}^{M-1}(x_j-x_{j+\tau})^2.
$$

The implementation uses one fixed comparison length

$$
M=N-\tau_{\max}
$$

for every lag. This keeps each candidate based on the same amount of evidence. If $\tau$ matches the waveform's period, then $x_j\approx x_{j+\tau}$ and $d(\tau)$ forms a trough. Period multiples such as $2\tau$ and $3\tau$ can form troughs too.

At 48 kHz, $M=4096-1600=2496$. For a shift of 1600 samples, the sum compares $x_0$ with $x_{1600}$, $x_1$ with $x_{1601}$, and so on through $x_{2495}$ with $x_{4095}$. Each shift therefore uses 2496 sample pairs, spanning $2496/1600=1.56$ cycles of a 30 Hz note in each compared segment.

The $4096/1600$ ratio counts waveform cycles, rather than tested displacements. The implementation advances the displacement one sample at a time and computes differences for all lags from 1 through 1600. Lags below 96 contribute to normalization, while 96 through 1600 are eligible pitch candidates. Low notes have fewer repeated cycles available as evidence even though the detector still evaluates many closely spaced shifts.

The raw difference is not directly useful for choosing a period. It scales with signal amplitude, and small lags tend to have small differences simply because nearby samples resemble each other. YIN compensates with the cumulative mean normalized difference:

$$
d'(\tau)
=\frac{d(\tau)}{\frac{1}{\tau}\sum_{k=1}^{\tau}d(k)}
=\frac{\tau d(\tau)}{\sum_{k=1}^{\tau}d(k)}.
$$

This compares each lag's mismatch with the average mismatch up to that lag. Aperiodic candidates tend to remain near 1, while a convincing period produces a value near 0. Lower is better.

## Select the First Convincing Trough

Classic YIN does not select the global minimum. It scans upward through candidate lags and chooses the first trough that crosses a fixed threshold:

$$
d'(\tau)<\theta,
\qquad
\theta=0.15.
$$

Once a value crosses the threshold, the scan follows the normalized difference $d'(\tau)$ downhill to the bottom of that trough. It stops when the next value is equal or larger, or when it reaches the maximum lag.

For example, for successive normalized values $0.20,0.12,0.06,0.08$, the threshold is first crossed at $0.12$, and the scan selects $0.06$ because the next value rises to $0.08$. It stops even if a later trough is deeper.

Choosing the first convincing trough favors the shortest period supported by the evidence. If a waveform repeats every $T$ samples, shifts of $2T$ and $3T$ also align it with itself. Selecting those later matches would give $F_s/(2T)=f/2$ or $F_s/(3T)=f/3$. The first is one octave low, and the second is about 19 semitones low.

If no trough crosses the threshold, the scan retains the lowest normalized difference as a fallback candidate. That candidate still has to pass the confidence check below.

## Turn Trough Depth into Confidence

The tuner presents normalized periodicity as confidence:

$$
c=1-d'(\tau).
$$

Since the YIN threshold is 0.15, the corresponding minimum confidence is

$$
c_{\min}=1-0.15=0.85.
$$

An audible candidate below this confidence returns `unstable` rather than a guessed frequency. A candidate selected through the normal threshold rule already satisfies this test; the check mainly rejects the fallback used when no trough crossed the threshold.

## Refine Beyond Whole Samples

An integer lag limits frequency resolution. For example, at 48 kHz the adjacent periods 436 and 437 samples correspond to about 110.09 Hz and 109.84 Hz. A tuner needs finer resolution than that.

Let $a=d'(\tau-1)$, $b=d'(\tau)$, and $c=d'(\tau+1)$ around the selected discrete trough. Fitting a parabola through those three points places its minimum at

$$
\hat{\tau}
=\tau+\frac{a-c}{2(a-2b+c)}.
$$

The final frequency estimate is then

$$
\hat{f}=\frac{F_s}{\hat{\tau}}.
$$

This interpolation improves tuning precision without increasing the sample rate or window size.

## Result States

The mathematical decisions map to the public result as follows:

| Condition                 | Status     | Meaning                                       |
| ------------------------- | ---------- | --------------------------------------------- |
| $L\le-50$ dB              | `silent`   | Not enough signal energy to analyze           |
| $L>-50$ dB and $c<0.85$   | `unstable` | Audible signal without convincing periodicity |
| $L>-50$ dB and $c\ge0.85$ | `pitched`  | Frequency estimated from the refined period   |

Note naming and cents offset happen outside the detector. The UI converts the returned frequency to a fractional MIDI pitch using 12-tone equal temperament and A4 = 440 Hz.

## Scope and Tradeoffs

This detector is intentionally small and frame-local. It assumes one dominant pitched source in the 30–500 Hz range and has no temporal model, pitch history, or polyphonic separation. The 4096-sample window supplies enough cycles for low bass, while the overlapping 50 ms update cadence keeps the display responsive. These choices form a practical first implementation, not a claim that this particular combination is established or optimal.

The direct difference calculation costs approximately $M\tau_{\max}$ sample comparisons per update. Computing the full curve keeps normalization and fallback selection straightforward. If profiling shows this work to be significant, the difference function can be accelerated with autocorrelation or coordinated with candidate selection without changing the mathematical decisions described here.

## References

- A. de Cheveigne and H. Kawahara, [YIN, a fundamental frequency estimator for speech and music](https://doi.org/10.1121/1.1458024)
- [pYIN algorithm breakdown](../bass-pitch/pyin.md), which explains how the offline transcription pipeline extends YIN with probabilistic thresholds and temporal decoding
