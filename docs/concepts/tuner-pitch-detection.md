# Real-Time Tuner Pitch Detection

The recorder tuner estimates the fundamental frequency of one note from a short segment of mono input audio. Its implementation in `src/lib/tuner-analyser.ts` uses YIN to compare the waveform with shifted copies of itself. A shift that aligns the repeating pattern reveals its period.

The detector measures signal level, scores possible periods, selects a convincing match, and refines it to estimate frequency. The sections below explain each step.

A **lag** $\tau$ is a shift measured in samples. If the waveform repeats after $\tau$ samples at a sample rate of $F_s$ samples per second, its frequency in hertz is

$$
f=\frac{F_s}{\tau}.
$$

A longer period therefore means a lower pitch. Doubling $\tau$ moves the result down one octave.

## Analysis Window

Every update reads the latest $N=4096$ samples from a Web Audio `AnalyserNode`. Updates occur at most once every 50 ms. At 48 kHz, one window contains $4096/48000\approx0.085$ seconds, or about 85 ms, of audio, so windows overlap when updates run at the 50 ms interval.

The tuner searches from 30 Hz to 500 Hz. That frequency range becomes a candidate-lag range:

$$
\tau_{\min}=\left\lfloor\frac{F_s}{500}\right\rfloor,
\qquad
\tau_{\max}=\min\left(\left\lceil\frac{F_s}{30}\right\rceil,\left\lfloor\frac{N}{2}\right\rfloor\right).
$$

The floor and ceiling operations round the frequency-derived bounds outward to whole samples. The $N/2$ cap leaves at least half the window available for comparison at the largest shift.

At 48 kHz, the input contains 48,000 samples per second. Dividing samples per second by cycles per second gives samples per cycle, so the bounds are

$$
\tau_{\min}=\left\lfloor\frac{48000}{500}\right\rfloor=96,
\qquad
\tau_{\max}=\min\left(\left\lceil\frac{48000}{30}\right\rceil,\left\lfloor\frac{4096}{2}\right\rfloor\right)=\min(1600,2048)=1600.
$$

The candidate periods therefore run from 96 through 1600 samples. For comparison, A2 at 110 Hz has a period of about 436 samples, while E1 at 41.2 Hz has a period of about 1165 samples.

The number of cycles in the window depends on the note. At 30 Hz, it contains $4096/1600=2.56$ cycles, compared with about $4096/1165\approx3.52$ cycles at E1. A clean repeating waveform can produce a clear match within a few cycles. More cycles provide more repeated evidence when the signal is noisy or changing, but a longer window also retains older audio for longer after a note change.

## Separate Presence from Pitch Evidence

Let $x_0,\ldots,x_{N-1}$ be the samples in the window. The tuner first measures their root mean square (RMS) amplitude around the mean $\bar{x}$. Subtracting the mean excludes any constant offset, also called DC offset, from the level measurement:

$$
\bar{x}=\frac{1}{N}\sum_{j=0}^{N-1}x_j,
\qquad
r=\sqrt{\frac{1}{N}\sum_{j=0}^{N-1}(x_j-\bar{x})^2}.
$$

The RMS amplitude becomes a level in decibels relative to full-scale amplitude (dBFS):

$$
L=20\log_{10}(r).
$$

The implementation floors this level at $-60$ dBFS, including for zero amplitude. If $L\le-50$ dBFS, the result is `silent` and pitch analysis stops. Louder windows proceed to the periodicity check, which distinguishes a pitched signal from an unstable one.

## Measure Repetition with a Difference Function

For a fixed lag $\tau$, compare each sample $x_j$ with the sample $\tau$ positions later. Squaring the differences makes every contribution nonnegative, and summing them gives one mismatch score for that lag:

$$
d(\tau)=\sum_{j=0}^{M-1}(x_j-x_{j+\tau})^2.
$$

The implementation uses one fixed comparison length

$$
M=N-\tau_{\max}
$$

for every lag, so each score includes the same number of sample pairs. This also keeps $j+\tau$ within the window. If $\tau$ matches the waveform's period, then $x_j\approx x_{j+\tau}$ and $d(\tau)$ forms a trough, a local low point in the mismatch scores. Period multiples such as $2\tau$ and $3\tau$ can form troughs too.

At 48 kHz, $M=4096-1600=2496$. For a shift of 1600 samples, the sum compares $x_0$ with $x_{1600}$, $x_1$ with $x_{1601}$, and so on through $x_{2495}$ with $x_{4095}$. Each shift therefore uses 2496 sample pairs, spanning $2496/1600=1.56$ cycles of a 30 Hz note in each compared segment.

Within each sum, $j$ advances one sample at a time while $\tau$ stays fixed. The detector then changes $\tau$ to obtain another score. At 48 kHz, it computes scores for every integer lag from 1 through 1600. Lags below 96 supply the normalization calculation below, while 96 through 1600 form the pitch candidate range.

## Normalize the Mismatch

The raw difference scales with signal amplitude. For smooth waveforms, small lags also tend to have small differences because nearby samples resemble each other. To compare troughs against a common threshold, YIN divides each mismatch by the average mismatch from lag 1 through the current lag:

$$
d'(\tau)
=\frac{d(\tau)}{\frac{1}{\tau}\sum_{k=1}^{\tau}d(k)}
=\frac{\tau d(\tau)}{\sum_{k=1}^{\tau}d(k)}.
$$

This is the cumulative mean normalized difference. The prime in $d'(\tau)$ denotes the normalized score.

A value near 1 means the current shift matches about as poorly as the average shift so far. For uncorrelated noise, different shifts tend to produce similar mismatches, so their ratio stays near 1. A shift that aligns a repeating waveform produces a much smaller mismatch than the average, bringing the ratio toward 0. For example, a mismatch of 6 against an average of 100 gives $d'(\tau)=0.06$.

If the cumulative mismatch is zero, the implementation assigns a normalized value of 1 to avoid division by zero.

## Select the First Convincing Trough

The detector scans from shorter to longer candidate lags and chooses the first trough that crosses a fixed threshold:

$$
d'(\tau)<\theta,
\qquad
\theta=0.15.
$$

Once a value crosses the threshold, the scan follows the normalized difference $d'(\tau)$ downhill to the bottom of that trough. It stops when the next value is equal or larger, or when it reaches the maximum lag.

For example, for successive normalized values $0.20,0.12,0.06,0.08$, the threshold is first crossed at $0.12$, and the scan selects $0.06$ because the next value rises to $0.08$. It stops even if a later trough is deeper.

Choosing the first convincing trough favors the shortest period supported by the evidence. If a waveform repeats every $T$ samples, shifts of $2T$ and $3T$ also align it with itself. Selecting those later matches would give $F_s/(2T)=f/2$ or $F_s/(3T)=f/3$. The first is one octave low, and the second is about 19 semitones low.

If no trough crosses the threshold, the scan retains the lowest normalized difference to report how close the window came to a convincing match.

## Turn Trough Depth into Confidence

For the selected lag $\tau$, the detector returns a confidence score based on normalized mismatch:

$$
c=1-d'(\tau).
$$

Since the YIN threshold is 0.15, the corresponding minimum confidence is

$$
c_{\min}=1-0.15=0.85.
$$

Higher confidence means a smaller mismatch relative to the average across shifts. A score below $0.85$ returns `unstable`. This expresses the same mismatch limit as the $0.15$ threshold above, so a window whose lowest mismatch exceeds $0.15$ is rejected. A selected trough passes because its mismatch is already below the threshold.

## Refine Beyond Whole Samples

An integer lag limits frequency resolution. For example, at 48 kHz the adjacent periods 436 and 437 samples correspond to about 110.09 Hz and 109.84 Hz. A tuner needs finer resolution than that.

Let $y_-=d'(\tau-1)$, $y_0=d'(\tau)$, and $y_+=d'(\tau+1)$ be the normalized values around the selected discrete trough. Fitting a parabola through those three points places its minimum at

$$
\hat{\tau}
=\tau+\frac{y_--y_+}{2(y_--2y_0+y_+)}.
$$

<details>
<summary>Derive the parabolic interpolation formula</summary>

Let $u$ measure the offset from the selected integer lag $\tau$. The three neighboring scores then have coordinates $(-1,y_-)$, $(0,y_0)$, and $(1,y_+)$. Approximate the curve between them with

$$
q(u)=Au^2+Bu+C.
$$

Substituting the three points gives

$$
y_-=A-B+C,\qquad y_0=C,\qquad y_+=A+B+C.
$$

Adding and subtracting these equations determines the coefficients:

$$
C=y_0,\qquad
A=\frac{y_- -2y_0+y_+}{2},\qquad
B=\frac{y_+-y_-}{2}.
$$

At a strict local trough, $A>0$, so the parabola opens upward. Its minimum occurs where the slope is zero:

$$
\frac{dq}{du}=2Au+B=0
\quad\Longrightarrow\quad
u=-\frac{B}{2A}
=\frac{y_- -y_+}{2(y_- -2y_0+y_+)}.
$$

The refined lag is $\hat{\tau}=\tau+u$. When the two neighboring scores are equal, $y_-=y_+$, the offset is zero. When the right neighbor has a lower score than the left, the offset is positive, moving the estimated minimum toward the right.

The parabola provides a local approximation to the trough, allowing an estimate between the sampled lag positions.

</details>

At an array boundary, or when the denominator is zero, the implementation keeps the integer lag. The final frequency estimate is then

$$
\hat{f}=\frac{F_s}{\hat{\tau}}.
$$

This interpolation improves tuning precision without increasing the sample rate or window size.

## Result States

The mathematical decisions map to the public result as follows:

| Condition                   | Status     | Meaning                                       |
| --------------------------- | ---------- | --------------------------------------------- |
| $L\le-50$ dBFS              | `silent`   | Not enough signal energy to analyze           |
| $L>-50$ dBFS and $c<0.85$   | `unstable` | Audible signal without convincing periodicity |
| $L>-50$ dBFS and $c\ge0.85$ | `pitched`  | Frequency estimated from the refined period   |

Note naming and cents offset happen outside the detector. The UI converts the returned frequency to a fractional MIDI pitch using 12-tone equal temperament and A4 = 440 Hz.

## Scope and Tradeoffs

The detector analyzes each window independently and assumes one dominant pitched source. Its configured range is 30–500 Hz, subject to the half-window lag cap at the actual sample rate. It has no pitch history or polyphonic separation, so transients, competing notes, and changing waveforms can affect individual estimates.

The window size, update interval, frequency range, and thresholds are prototype settings. Assessing their reliability requires testing representative recordings across notes and input conditions.

The direct difference calculation costs approximately $M\tau_{\max}$ sample comparisons per update. Computing the full curve keeps normalization and fallback selection straightforward. At 48 kHz, this is $2496\times1600=3{,}993{,}600$ sample-pair comparisons per analyzed window.

## References

- A. de Cheveigne and H. Kawahara, [YIN, a fundamental frequency estimator for speech and music](https://doi.org/10.1121/1.1458024)
- [pYIN algorithm breakdown](../bass-pitch/pyin.md), which explains how the offline transcription pipeline extends YIN with probabilistic thresholds and temporal decoding
