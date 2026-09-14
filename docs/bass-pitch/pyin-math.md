# pYIN Math

The bass transcription pipeline uses pYIN to turn a sequence of audio frames into a sequence of pitches. Each frame contributes several possible pitches with probabilities. A model of pitch movement then selects a path through those possibilities.

This document derives the calculations in our vendored [pYIN implementation](../../crates/pyin/src/pyin.rs), which follows the librosa-compatible algorithm described in that source. The [visual guide](pyin-visual-guide.html) builds intuition through plots measured from a bass recording. The [pipeline overview](algorithm.md) explains how decoded pitches become notes.

## From Samples to Possible Periods

Let $x_j$ be samples in one audio frame. For each lag $\tau$, YIN measures the mismatch between a segment and its shifted copy:

$$
d(\tau)=\sum_{j=0}^{W-1}(x_j-x_{j+\tau})^2.
$$

Here $W$ is the number of sample pairs. The index $j$ advances one sample at a time while $\tau$ stays fixed. A repeating waveform produces a small mismatch when $\tau$ matches its period.

Expanding the square gives

$$
d(\tau)=\sum_j x_j^2+\sum_j x_{j+\tau}^2-2\sum_j x_jx_{j+\tau}.
$$

The first two terms are segment energies, and the third is a correlation. Our implementation computes energies with cumulative sums and correlation with FFTs. Its slices start the compared segments at frame sample 1, which is equivalent to shifting the index origin in the equation above.

YIN normalizes each mismatch by the average mismatch up to that lag:

$$
d'(\tau)=\frac{d(\tau)}{\frac{1}{\tau}\sum_{k=1}^{\tau}d(k)}.
$$

A value near 1 means the shift matches about as poorly as the average shift so far. A trough near 0 indicates a strong periodic match. The [tuner math](../concepts/tuner-pitch-detection.md) explains this difference function, normalization, and fractional-period interpolation in more detail. The Rust implementation adds a small positive value to the denominator to handle zero energy.

For our bass settings, $F_s=22050$ samples/s, the frame has $N=2048$ samples, and $W=1024$. The 30–400 Hz search range gives

$$
\tau_{\min}=\left\lfloor\frac{22050}{400}\right\rfloor=55,
\qquad
\tau_{\max}=\min\left(\left\lceil\frac{22050}{30}\right\rceil,N-W-1\right)=735.
$$

The result is a normalized mismatch curve for each frame. Its local minima, or troughs, are the possible periods. In the sections below, number these troughs in increasing lag order as $\tau_1,\ldots,\tau_m$, and write their depths as $z_i=d'(\tau_i)$.

## Assign Weights to Thresholds

A fixed YIN threshold chooses one qualifying trough. pYIN considers many thresholds and combines their contributions, so a small change in trough depth can change the strength of a candidate without immediately eliminating it.

Our implementation divides the interval from 0 to 1 into $K=100$ bins, with boundaries $\theta_k=k/K$. A Beta distribution assigns probability mass to each bin. For the configured Beta(2, 18) distribution, the density is

$$
b(\theta)=342\theta(1-\theta)^{17},\qquad 0\le\theta\le1.
$$

The weight of bin $k$ is its area under this density:

$$
w_k=\int_{\theta_{k-1}}^{\theta_k}b(\theta)\,d\theta
=F(\theta_k)-F(\theta_{k-1}),
\qquad \sum_{k=1}^{K}w_k=1.
$$

Here $F$ is the cumulative distribution function, or accumulated area. The distribution favors low thresholds and has mean $2/(2+18)=0.1$. The code computes all 100 weights once, then uses each bin's upper boundary $\theta_k$ as its threshold.

For example, suppose the frame has two troughs:

| Period | Normalized mismatch |
| ------ | ------------------- |
| $T$    | 0.12                |
| $2T$   | 0.04                |

At threshold 0.10, only $2T$ qualifies. At threshold 0.15, both qualify. Combining thresholds preserves both possibilities with different weights.

## Share Each Threshold's Weight Among Troughs

For a threshold $\theta_k$, trough $i$ qualifies when $z_i<\theta_k$. Rank the qualifying troughs by increasing lag, starting at rank 0. The rank $r_{i,k}$ can change with the threshold because the set of qualifying troughs changes.

The implementation gives earlier troughs more weight using an exponential preference with $\lambda=2$:

$$
q_{i,k}=\frac{e^{-\lambda r_{i,k}}}{\sum_{j\text{ qualifying}}e^{-\lambda r_{j,k}}}.
$$

Nonqualifying troughs receive $q_{i,k}=0$. When at least one trough qualifies, their weights sum to 1, so they share all of that threshold bin's mass $w_k$.

For two qualifying troughs, the earlier one receives

$$
\frac{1}{1+e^{-2}}\approx0.881,
$$

and the later one receives about 0.119. With only one qualifying trough, it receives all the mass. This preserves YIN's preference for shorter periods while allowing several candidates to contribute.

If no trough qualifies, the deepest trough receives a fraction $\varepsilon=0.01$ of the threshold bin's mass. The rest remains unassigned to any pitch. Summing across thresholds gives each trough's probability:

$$
p_i=\sum_{k=1}^{K}w_kq_{i,k}
+\begin{cases}
\varepsilon\sum_{k:\,\text{no trough qualifies}}w_k,&i\text{ is the deepest trough},\\
0,&\text{otherwise}.
\end{cases}
$$

The first sum uses $q_{i,k}=0$ for bins with no qualifying trough. If the frame has no troughs at all, it receives no pitch probability.

For the two-trough example above, the configured threshold grid and priors give approximately $p_T=0.279$ and $p_{2T}=0.548$, leaving 0.173 unassigned. The deeper, octave-low match is more likely within this frame, but the shorter period remains available to the sequence decoder.

## Turn Candidates into Frame Evidence

Each trough is refined to a fractional lag $\hat\tau_i$ by parabolic interpolation, giving frequency $f_i=F_s/\hat\tau_i$. The decoder works on a grid with $B=10$ bins per semitone. Relative to the lowest frequency $f_{\min}$, a candidate maps to bin

$$
n_i=\operatorname{round}\left(12B\log_2\frac{f_i}{f_{\min}}\right).
$$

There are

$$
Q=\left\lfloor12B\log_2\frac{f_{\max}}{f_{\min}}\right\rfloor+1=449
$$

pitch bins for 30–400 Hz. The implementation writes each candidate's probability into its bin. If multiple candidates map to the same bin, the later assignment replaces the earlier one.

For frame $t$, call the resulting bin weights $P_t(n)$. Their sum, clamped to $[0,1]$, is the returned voiced probability:

$$
v_t=\sum_{n=0}^{Q-1}P_t(n).
$$

“Voiced” means the frame is modeled as containing a periodic pitched sound. The sequence model has both a voiced state and an unvoiced state for every pitch bin, making $2Q=898$ states. Its observation weights are

$$
O_t(n,\mathrm V)=P_t(n),
\qquad
O_t(n,\mathrm U)=\frac{1-v_t}{Q}.
$$

The unvoiced copies let the model carry pitch continuity through weak evidence even while marking a frame unvoiced. Because unvoiced observations are uniform across pitch bins, neighboring frames and the transition model determine which unvoiced pitch state fits the sequence.

The value $v_t$ describes the frame's evidence before sequence decoding. The decoded voiced/unvoiced flag is a separate output. The [bass pipeline](algorithm.md) uses voiced probability as a weight when combining pitch evidence into notes.

## Describe Plausible Movement Between Frames

The sequence model is a hidden Markov model (HMM). Its hidden states describe pitch and voicing, its observations come from the candidate probabilities, and each transition depends on the preceding state.

Let $s_t=(n_t,u_t)$ be the state at frame $t$, with pitch bin $n_t$ and voicing $u_t$. The transition probability from state $(n,u)$ to $(m,v)$ combines pitch movement and voicing movement:

$$
A((n,u),(m,v))=T(n,m)\begin{cases}
1-\rho,&u=v,\\
\rho,&u\ne v,
\end{cases}
\qquad \rho=0.01.
$$

Here $T(n,m)$ is a row-normalized triangular distribution centered on the previous pitch bin. Staying near the previous pitch receives more weight than a large change. Staying in the same voicing state multiplies the score by 0.99, while switching multiplies it by 0.01.

The code derives the triangle's width from the hop length $H$ and configured rate $R=35.92$ octaves/s:

$$
a=\operatorname{round}\left(12R\frac{H}{F_s}\right)
=\operatorname{round}\left(12\times35.92\times\frac{256}{22050}\right)=5,
\qquad L=aB+1=51.
$$

The 51-bin window is centered on the previous bin, giving offsets from $-25$ to $25$ bins, or $\pm2.5$ semitones. For these settings its unnormalized weights are

$$
w(n,m)=\begin{cases}
26-|m-n|,&|m-n|\le25,\\
0,&\text{otherwise},
\end{cases}
\qquad
T(n,m)=\frac{w(n,m)}{\sum_{j=0}^{Q-1}w(n,j)}.
$$

At the pitch-range boundaries, the denominator renormalizes the part of the triangle that fits. Octave jumps have zero transition probability in this model. The numerical decoder adds a tiny positive value before taking logarithms, so zero entries become extremely strong penalties in the calculation.

## Select a Sequence with Viterbi

For a sequence of $M$ frames, the model scores a state path using the initial state distribution $\pi$, the observations, and the transitions:

$$
\operatorname{score}(s_0,\ldots,s_{M-1})
=\pi(s_0)O_0(s_0)\prod_{t=1}^{M-1}A(s_{t-1},s_t)O_t(s_t).
$$

Our initial distribution is uniform across unvoiced states. A path scores well when its states both explain the frame evidence and move plausibly between frames.

For a small illustration, consider only two nearby voiced pitches, A and B, with these observation weights:

| Frame | A   | B   |
| ----- | --- | --- |
| 0     | 0.9 | 0.1 |
| 1     | 0.4 | 0.6 |
| 2     | 0.9 | 0.1 |

Suppose both initial pitches are equally likely, staying on a pitch has probability 0.9, and switching has probability 0.1. These two-state probabilities are illustrative. Omitting a common initial weight, the paths score

$$
\operatorname{score}(A,A,A)=0.9\times0.4\times0.9\times0.9^2=0.26244,
$$

$$
\operatorname{score}(A,B,A)=0.9\times0.6\times0.9\times0.1^2=0.00486.
$$

Although the middle frame favors B, staying on A produces the stronger sequence. In pYIN, this same tradeoff operates over all pitch and voicing states.

Viterbi finds the highest-scoring path by retaining the best score ending in each state. Define $V_t(s)$ as that score through frame $t$:

$$
V_0(s)=\pi(s)O_0(s),
\qquad
V_t(s)=O_t(s)\max_r\left[V_{t-1}(r)A(r,s)\right].
$$

For each possible current state $s$, the calculation tries every predecessor $r$, remembers the best one, and multiplies by the current observation weight. After the last frame, it chooses the best final state and follows those saved predecessors backward to recover the path. The implementation performs these operations in logarithms, turning multiplication into addition and avoiding underflow.

The decoded frequency for a voiced pitch bin $n$ is

$$
f(n)=f_{\min}2^{n/(12B)}.
$$

Thus the output has 0.1-semitone resolution. Unvoiced frames receive the configured unvoiced fill value. Our wrapper decodes roughly 10-second chunks with 32 context frames on each side where available, then discards those context outputs. Continuity is optimized within each chunk, with overlap supplying evidence around the retained boundaries.

## Settings and Implementation

| Setting                  | Value                     | Meaning                                                      |
| ------------------------ | ------------------------- | ------------------------------------------------------------ |
| Sample rate              | 22,050 Hz                 | Samples per second after resampling                          |
| Frame / comparison / hop | 2048 / 1024 / 256 samples | About 92.9 ms per frame, with predictions 11.6 ms apart      |
| Search range             | 30–400 Hz                 | Candidate lags 55–735                                        |
| Threshold prior          | Beta(2, 18), 100 bins     | Weighted threshold uncertainty                               |
| Trough-order preference  | $\lambda=2$               | Earlier qualifying troughs receive more mass                 |
| No-trough fraction       | 0.01                      | Small contribution to the deepest trough when none qualifies |
| Pitch grid               | 10 bins per semitone      | 449 pitch bins and 898 voiced/unvoiced states                |
| Pitch transition         | 51 bins wide              | Triangular support over $\pm2.5$ semitones                   |
| Voicing switch           | 0.01                      | Penalty for entering or leaving voiced states                |

The [visual guide](pyin-visual-guide.html) shows how these stages behave on the bar-11 fixture, including an octave-ambiguous note attack.

| Calculation                                                           | Source                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Frame mismatch and normalization                                      | [`frame_cum_mean_norm_diff`](../../crates/pyin/src/pyin.rs)   |
| Threshold weights, candidate probabilities, observations, transitions | [`PYINExecutor`](../../crates/pyin/src/pyin.rs)               |
| Trough-order weights, interpolation, local transitions                | [`util.rs`](../../crates/pyin/src/util.rs)                    |
| Best-path calculation and backtracking                                | [`viterbi.rs`](../../crates/pyin/src/viterbi.rs)              |
| Chunking and context                                                  | [`calculate_pyin_frames`](../../crates/bass-pitch/src/lib.rs) |
