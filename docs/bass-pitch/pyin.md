# pYIN: From Ambiguous Periods to a Pitch Sequence

A bass waveform can line up with itself after one period or two, and the deeper match can change during an attack. Choosing one pitch independently in each frame can therefore turn small changes in the waveform into octave jumps. We want to retain plausible alternatives until neighboring frames can help distinguish them.

[YIN](../concepts/yin-pitch-detection.md) supplies the starting point. Its normalized difference curve measures how well a waveform matches a delayed copy, and its first trough below a threshold is the period estimate. pYIN replaces that single decision with weighted candidates, then chooses a sequence that balances those candidates against continuity in pitch.

## Ambiguous Periods Within a Frame

Suppose the normalized difference curve has two troughs:

| Candidate period | Mismatch |
| ---------------- | -------- |
| $T$              | 0.12     |
| $2T$             | 0.04     |

At threshold 0.10, only $2T$ qualifies. At 0.15, both qualify and YIN prefers the earlier trough at $T$. Neither threshold is inherently correct. They express different demands on the quality of the match, and here that choice changes the pitch by an octave.

### Average Over Threshold Uncertainty

Instead of committing to one threshold, give thresholds a probability distribution. Our implementation uses a Beta(2, 18) prior on $[0,1]$, with mean 0.1. This favors convincing, low-mismatch matches without making 0.1 a hard cutoff.

The code approximates that distribution with 100 threshold bins. For bin $k$, let $w_k$ be its probability mass and $\theta_k$ its upper boundary. If the density is $b$, then

$$
w_k=\int_{\theta_{k-1}}^{\theta_k}b(\theta) d\theta,
\qquad \sum_k w_k=1.
$$

![Threshold probability is divided into regions where neither trough, only the longer-period trough, or both troughs qualify](images/pyin-threshold-mass.svg)

For this example, roughly 17.5% of the threshold mass accepts neither trough, 50.8% accepts only $2T$, and 31.7% accepts both. The threshold prior turns the trough depths into amounts of evidence.

### Share the Evidence Between Qualifying Troughs

When several troughs qualify, pYIN retains a preference for shorter periods. Rank the qualifying troughs by lag, starting at zero, and give candidate $i$ the normalized weight

$$
q_{i,k}=\frac{e^{-\lambda r_{i,k}}}{\sum_{j\text{ qualifying}}e^{-\lambda r_{j,k}}},
\qquad \lambda=2.
$$

Thus two qualifying troughs share the threshold's mass in proportions about 0.881 and 0.119. This is a soft version of YIN's first-trough preference. The rank is among qualifying troughs, so it can change with the threshold.

Nonqualifying candidates receive zero. If none qualifies, our implementation gives just 1% of that bin's mass to the deepest trough and leaves the rest unassigned. With those rules included in $q_{i,k}$, each candidate receives

$$
p_i=\sum_k w_kq_{i,k}.
$$

In the example, $p_T\approx0.279$ and $p_{2T}\approx0.548$, leaving about 0.173 unassigned. The longer period has stronger frame evidence, but the shorter one remains available. These weights come from chosen priors and the mismatch curve, so they are model evidence rather than a guarantee that a pitch is correct.

## Pitch Continuity Across Frames

A sequence gives us another source of evidence. An isolated pitch change is less plausible than a sustained one, especially when the individual frame is ambiguous. We need a score that combines how well each pitch fits its frame with how plausibly successive pitches connect.

### Keep Pitch and Voicing Separate

Refine candidate periods using the same [parabolic interpolation as YIN](../concepts/yin-pitch-detection.md#refine-the-period-between-samples), then convert period to frequency. The decoder represents pitch on a logarithmic grid, so equal steps correspond to equal musical intervals. Our grid has ten bins per semitone.

Let $P_t(n)$ be the candidate weight placed in pitch bin $n$ at frame $t$. Its total

$$
v_t=\sum_n P_t(n)
$$

is the frame's **voiced probability**. Here voiced means modeled as a periodic pitched sound. It does not mean that a bass note exists, and an attack can be audible while offering weak periodicity evidence.

Give each pitch bin both a voiced and an unvoiced state. For $N$ pitch bins, their observation weights are

$$
O_t(n,\mathrm V)=P_t(n),
\qquad O_t(n,\mathrm U)=\frac{1-v_t}{N}.
$$

The unassigned mass becomes unvoiced evidence. Giving it uniformly to the unvoiced pitch states lets the model carry a latent pitch through uncertain frames without claiming those frames contain a reliable pitch observation. Neighboring frames decide which latent pitch best connects the sequence.

### Prefer Plausible Transitions

Write a state as $s=(n,u)$, where $n$ is pitch and $u$ is voicing. A transition combines a preference for nearby pitches with a preference for retaining the same voicing:

$$
A((n,u),(m,v))=T(n,m)
\begin{cases}
1-\rho,&u=v,\\
\rho,&u\ne v.
\end{cases}
$$

Our pitch transition $T$ is a normalized triangular distribution centered on the previous pitch. With the bass settings, its support spans $\pm2.5$ semitones per 11.6 ms hop. The voicing-switch probability is $\rho=0.01$. These are continuity assumptions, so they can suppress implausible jumps but can also resist a real abrupt change.

This construction is a **hidden Markov model**. The hidden state is pitch plus voicing, the observations supply frame evidence, and the transition depends only on the preceding state.

### Choose the Whole Path

For a path through $L$ frames, combine the initial distribution $\pi$, transition weights, and observation weights:

$$
\mathrm{score}(s_0,\ldots,s_{L-1})
=\pi(s_0)O_0(s_0)\prod_{t=1}^{L-1}A(s_{t-1},s_t)O_t(s_t).
$$

To see the tradeoff, temporarily consider just two nearby voiced pitches, A and B:

| Frame | A   | B   |
| ----- | --- | --- |
| 0     | 0.9 | 0.1 |
| 1     | 0.4 | 0.6 |
| 2     | 0.9 | 0.1 |

Suppose the initial pitches are equally likely, staying has probability 0.9, and switching has probability 0.1. These are illustrative values. Omitting the common initial factor,

```math
\begin{aligned}
\mathrm{score}(A,A,A)&=0.9\cdot0.4\cdot0.9\cdot0.9^2=0.26244,\\
\mathrm{score}(A,B,A)&=0.9\cdot0.6\cdot0.9\cdot0.1^2=0.00486.
\end{aligned}
```

The middle frame favors B, but not enough to justify two changes. Sustained evidence for B would accumulate across frames and could outweigh the transition cost. The decoder balances evidence rather than simply smoothing a sequence of already-selected pitches.

We need not enumerate every path. Once two paths reach the same state, they have the same possible futures, so only the better prefix can win. This gives the **Viterbi recurrence** for the best score ending at state $s$:

$$
V_0(s)=\pi(s)O_0(s),
\qquad
V_t(s)=O_t(s)\max_r\bigl[V_{t-1}(r)A(r,s)\bigr].
$$

Remember the winning predecessor at each step. After choosing the best final state, trace those predecessors backward to recover the path. The implementation uses log scores to avoid underflow. Its initial distribution is uniform over unvoiced states.

## Evidence from a Bass Recording

The original visual companion recorded these normalized difference curves from two frames of the Primrose bar-11 fixture:

![A sustained bass frame has a deep periodic match, while an attack has only a shallow sub-octave match](images/pyin-recorded-troughs.svg)

The sustained D1 frame has a trough near 0.021 and receives about 0.95 voiced probability. The C-sharp attack has a shallow sub-octave match near 0.41 and receives about 0.01. A fixed threshold would make a hard acceptance decision here. pYIN instead preserves weak pitch evidence while leaving most weight for the unvoiced states.

![A deepest-trough baseline and a decoded pitch path mostly agree, with sub-octave discrepancies near note transitions](images/pyin-recorded-path.svg)

The gray dots use the deepest trough independently in each frame. This baseline differs from YIN's first-qualifying-trough rule. The green decoded path avoids several isolated sub-octave choices around note transitions. Continuity helps here, but cannot resolve an entire passage with consistently misleading evidence.

The frame weight $v_t$ and the decoded voiced flag are separate outputs. Our [bass transcription pipeline](algorithm.md#pitch-labels-each-region) uses them to vote for a region's pitch. Activity and onset evidence establish regions before pitch voting. Low probability alone does not reject a voiced pitch estimate, but a region with no finite voiced estimates is omitted from the final pitched output.

## Implementation Scale

The explanation follows our vendored librosa-compatible implementation, whose candidate weighting differs from the original paper. The current bass settings are:

| Setting          | Scale                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Audio and frames | 22,050 Hz, 2048-sample frames, 256-sample hop, about 93 ms of audio per estimate and 11.6 ms between estimates |
| Pitch range      | 30–400 Hz, 449 pitch bins, 898 pitch/voicing states                                                            |
| Thresholds       | Beta(2, 18), 100 bins, shorter-period preference $\lambda=2$                                                   |
| Continuity       | 51-bin triangular window, spanning $\pm2.5$ semitones, voicing-switch probability 0.01                         |

[`PYINExecutor`](../../crates/pyin/src/pyin.rs) builds the candidates, observations, and transitions, while [`viterbi.rs`](../../crates/pyin/src/viterbi.rs) selects the path. The transition's zero entries become very strong penalties because the numerical decoder adds a small positive value before taking logarithms. The [bass wrapper](../../crates/bass-pitch/src/lib.rs) decodes roughly ten-second chunks with context, so optimization is within each chunk rather than globally across a whole recording.
