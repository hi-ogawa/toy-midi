# WSOLA Time Stretching

To stretch a recording, take short patches from positions along the source timeline and stitch them into the output. For slower playback, advance less through the source between patches, so neighboring patches reuse some audio. For faster playback, advance farther. Each patch keeps its original sample spacing, which preserves the local oscillations that give the sound its pitch.

These nominal positions give us the desired timing, but the waveforms may line up poorly where patches overlap. WSOLA allows each patch to move slightly around its nominal position, searching for a better waveform match before blending the overlap. This document develops that picture and the equations used in [our implementation](../../src/lib/dsp/wsola.ts).

## Place Patches Along the Nominal Timeline

Take patches of length $W$ and place one every $H$ output samples. This spacing is called the **hop**. We use $H=W/2$, so neighboring patches overlap by half their length. These patches are also called source windows.

Our renderer uses 20 ms patches with a 10 ms output hop, and searches within a 30 ms region around each nominal position. At 48 kHz, these correspond to $W=960$, $H=480$, and a search width of $S=1440$ samples.

To make the positions easy to follow, use smaller illustrative counts of 40-sample patches and a 20-sample output hop. At $0.75\times$ speed, advance only 15 samples through the source for each new patch:

| Patch | Output start | Nominal source start |
| ----- | ------------ | -------------------- |
| 0     | 0            | 0                    |
| 1     | 20           | 15                   |
| 2     | 40           | 30                   |
| 3     | 60           | 45                   |

![Four waveform patches copied from nominal source positions into more widely spaced output positions](images/wsola-nominal-patches.svg)

The output progresses 60 samples while the patch starts progress only 45 samples through the recording. Reusing source audio this way makes the output longer without slowing down the samples inside a patch.

More generally, patch $k$ starts at output position $kH$. For playback rate $r$, its **nominal source position** is

$$
p_k=rkH.
$$

This is the timing plan. A source of duration $T$ becomes approximately $T/r$ long. We still need to make the joins sound continuous.

## Repair the Alignment at Each Join

Consider the first two patches in the example. The first patch's second half starts at source sample 20, but the second patch's first half starts at sample 15. Those two pieces occupy the same output positions, so we will blend source samples that are five samples apart.

That offset may be harmless, or it may put peaks against troughs. For a tone with a ten-sample period, five samples is half a cycle. At equal blend weights, the two opposite phases cancel. Fading between patches avoids an abrupt switch, but it cannot by itself fix this alignment.

![An opposite-phase nominal overlap cancels during a crossfade, while shifting the incoming patch aligns the waveforms](images/wsola-overlap-alignment.svg)

We therefore allow the new patch to slide a little around its nominal source position. The timing plan stays the same, while the adjustment gives us a chance to align the waveform before blending it.

### Choose the Waveform to Match

Consider the window we used on the previous hop. Its second half will overlap the next window's first half. If the next source window begins $H$ samples after the previous one's start, those halves contain exactly the same source samples.

Call this position the **natural continuation**, $n_k$. It gives us both a perfect overlap and a reference waveform for evaluating other starts.

Following that continuation forever would simply reproduce the source at its original rate. Each output hop would advance by $H$ samples in both source and output, regardless of $r$. To change duration, we must sometimes leave this exact continuation and find a similar waveform elsewhere.

### Keep the Search Near the Intended Time

Allow candidate starts $q$ within a region of width $S$ centered on the nominal position:

$$
q\in\left[p_k-\frac{S}{2},\;p_k+\frac{S}{2}\right).
$$

This expresses the compromise. The nominal position controls progress through the recording, while the search region allows local adjustments for waveform alignment. A larger region offers more possible matches but also permits material from farther away in source time.

If the natural continuation lies in this region, we can select it immediately. Otherwise, we need a measure of how closely each candidate resembles it.

### Score the Candidate Matches

A good candidate puts peaks near peaks and troughs near troughs in the reference waveform. Treat each window as a vector: let $\mathbf{x}(q)$ be the vector of $W$ source samples beginning at $q$. We compare it with the natural continuation using **cosine similarity**:

$$
\rho(n_k,q)=
\frac{\langle\mathbf{x}(n_k),\mathbf{x}(q)\rangle}
{\|\mathbf{x}(n_k)\|\,\|\mathbf{x}(q)\|}.
$$

This is the cosine of the angle between the two window vectors. Matching waveform shapes with the same polarity point in the same direction and score 1, even if their amplitudes differ. Opposite-polarity shapes point in opposite directions and score -1. The comparison uses full windows, so both the immediate overlap and the following half-window contribute to the choice.

We can now express the selection rule. Let $s_k$ be the source start we select for hop $k$:

$$
s_k=\underset{q\in[p_k-S/2,\;p_k+S/2)}{\arg\max}\;\rho(n_k,q).
$$

For a nonzero reference, selecting $q=n_k$ scores 1, which explains why we can take the natural continuation directly whenever it is allowed. Other starts may match equally well, particularly for a periodic waveform. Choosing the natural continuation preserves the original samples through the overlap.

Once we have selected the window, its second half determines the next natural continuation:

$$
n_{k+1}=s_k+H.
$$

The two positions now have distinct roles. The natural continuation follows the window actually chosen, while the nominal position always comes from output time through $p_k=rkH$. A local alignment adjustment therefore does not shift the nominal timeline of every later window.

During slower playback, natural continuation advances faster than the nominal timeline. Eventually, it leaves the search region, so we select a matching patch earlier in the source. This reuses audio and extends the recording. During faster playback, the nominal timeline advances faster, so matching patches generally jump forward through the source.

## Blend the Aligned Patches

Waveform search improves alignment, but two selected patches will rarely match exactly. We fade out the previous patch while fading in the new one over their overlap.

Let $u[j]$ and $v[j]$ be the outgoing and incoming samples at position $j$ in the overlap. Crossfading interpolates between them:

$$
y[j]=(1-a[j])u[j]+a[j]v[j].
$$

As the incoming weight $a$ moves from zero to one, the output moves from the previous patch to the new one. Matching samples pass through unchanged because their weights sum to one. Opposite phases can still cancel, so blending complements the alignment search rather than replacing it.

Our implementation uses a Hann-shaped fade. The [Why Hann? appendix](#appendix-why-hann) explains its complementary weights and the signal-processing benefit of its smooth endpoints.

Sustained periodic sounds often provide good matches because similar waveforms recur. Attacks and mixtures of unrelated periods may not, so even the best available alignment can alter the sound.

## Trade Duration for Pitch with Resampling

Resampling changes duration and pitch together. Playing samples twice as fast halves the duration and raises pitch by an octave. WSOLA gives us a separate duration control, so we can first create extra time and then trade it for higher pitch.

For example, stretch a recording to twice its duration with WSOLA, keeping its local wave spacing. Then resample that stretched signal at twice the playback rate. Its duration returns to the original length, while its waves become twice as closely spaced. We have raised pitch by an octave without changing the recording's overall duration.

![Three waveforms on the same time scale show WSOLA doubling duration without changing cycle spacing, followed by resampling that restores the original duration and doubles pitch.](images/wsola-stretch-then-resample.svg)

The colors track reused source regions schematically. They do not represent individual WSOLA windows or their overlap fades.

More generally, for a desired pitch multiplier $p$, use WSOLA at playback rate $1/p$ to multiply duration by $p$, then resample at rate $p$. The two duration changes cancel, while only resampling changes pitch:

$$
\text{duration factor}=p\cdot\frac{1}{p}=1,
\qquad
\text{pitch factor}=1\cdot p=p.
$$

### How Playback Uses This Relationship

Our playback goal is still to change duration while preserving pitch. The integration takes an indirect route because the buffer source controls playback speed, while the pitch-shifter worklet processes an ongoing stream with equal input and output duration.

The [buffer source](../../src/lib/recorder/audio-buffer-playback.ts) plays at rate $r$, which changes duration by $1/r$ and pitch by $r$. The [pitch-shift bus](../../src/lib/recorder/audio-track-playback.ts) then requests the inverse pitch multiplier $p=1/r$. Internally, [`StreamingPitchShifter`](../../src/lib/dsp/pitch-shifter.ts) performs the WSOLA-and-resampling combination above. That stage preserves the already changed duration while restoring pitch, since $r\cdot(1/r)=1$.

At half-speed playback, for example, the buffer source produces audio twice as long and an octave lower. The pitch shifter raises it by an octave without changing that longer duration. In this use case, the diagram's original signal is the already slowed input to the pitch shifter, and its final signal is the pitch-corrected slow playback.

## How Much Audio Must Be Available?

Window selection needs audio beyond the nominal source position. A candidate can begin up to about $S/2$ samples ahead of $p_k$, and comparing it requires another $W$ samples for the full window. The search therefore needs source audio through approximately $p_k+S/2+W$.

The natural-continuation window must also be available because it supplies the reference for the comparison. A streaming processor waits until the received audio reaches the farther end of the reference and candidate windows. When natural continuation can be selected directly, only that window is needed.

At sample rate $F_s$ samples per second, this gives a useful scale for the required source lookahead:

$$
\text{source lookahead}\approx\frac{W+S/2}{F_s}.
$$

With a 20 ms window and a 30 ms search region, that is about $20+15=35$ ms of source audio. The search width contributes half its duration because it extends on both sides of the nominal position, while a candidate's entire window extends forward from its start.

### Allow for the Next Natural Continuation

Readiness of the first window alone does not guarantee that later hops will be ready. Natural continuation advances by $H$ from the previous selected start, while the nominal position advances by $rH$. During slow playback, the reference can therefore reach another $(1-r)H$ samples ahead of the new search region. The startup reserve includes this allowance when $r<1$.

For a 20 ms window, the half-window hop is 10 ms. At $r=0.75$, the extra allowance is $(1-0.75)\times10=2.5$ ms, giving roughly 37.5 ms of source audio in reserve. The implementation also adds rounding headroom and checks actual window availability before generating each hop.

### Distinguish Source Lookahead from End-to-End Latency

These estimates describe how much source audio must be available ahead of the nominal position. They are not the complete pitch shifter's input-to-output delay, which also depends on resampling and block buffering. Likewise, having the samples available does not guarantee that the search finishes within an audio callback's CPU budget. The implementation uses a coarse search followed by local refinement to reduce that computation.

For a prerecorded source, future samples already exist and can be supplied as needed. For a live source, buffering can provide local lookahead, but it cannot sustain a permanent mismatch between input and output rates with bounded delay. Slower consumption accumulates a backlog, while faster consumption eventually exhausts one. Our pitch shifter avoids that long-term mismatch because its internal stretching and resampling have cancelling duration factors.

## Connect the Formulation to the Code

[`WsolaProcessor` and `StreamingWsola`](../../src/lib/dsp/wsola.ts) use the same selection and blending calculations. The first reads a complete source, while the second waits until incoming audio supplies the reference and candidate windows needed for a hop.

The equations describe the central window-selection problem. The code rounds positions to sample indices and approximates the maximum with a coarse search followed by local refinement. For silent windows, where cosine normalization is undefined, it assigns a similarity score of zero. For multiple channels, it combines all channels into one comparison and selects a shared source start, preserving their relative timing.

The overlap equations describe joins between successive windows. At startup, the implementation has no preceding window and fades in from silence. Source boundaries, output block sizes, and streaming buffer management are handled separately in the code.

| Mathematical role                         | Implementation                                             |
| ----------------------------------------- | ---------------------------------------------------------- |
| Nominal timeline and natural continuation | `WsolaProcessor.generateHop`, `StreamingWsola.generateHop` |
| Approximate similarity maximum            | `findBestCandidate`, `calculateSimilarity`                 |
| Complementary Hann blend                  | `createPeriodicHannWindow`, `overlapAddPlanar`             |

The [command-line renderer](../../tools/wsola.ts) supports listening experiments with playback rate, window length, and search width. The [visual companion](https://gisthost.github.io/?109135460ad3d821bc7f7ce66278e0bb/wsola-explainer.html) illustrates how source-window selection and overlap change the output.

## Appendix: Why Hann?

Complementary weights preserve matching samples with many possible fade shapes. Hann is useful because it combines that property with a smooth taper at patch boundaries.

### Complementary Weights at Half-Window Spacing

For an even window length $W$ and hop $H=W/2$, the periodic Hann window is

$$
w[j]=\frac12\left(1-\cos\frac{2\pi j}{W}\right),
\qquad 0\le j<W.
$$

Shifting by half a window adds $\pi$ to the cosine's phase, so

```math
\begin{aligned}
w[j+H]
&=\frac12\left(1-\cos\left(\frac{2\pi j}{W}+\pi\right)\right)\\
&=\frac12\left(1+\cos\frac{2\pi j}{W}\right)\\
&=1-w[j],
\qquad 0\le j\lt H.
\end{aligned}
```

The incoming half-window supplies $a[j]=w[j]$, while the outgoing half supplies $1-a[j]=w[j+H]$. This is the **constant overlap-add (COLA)** property with sum one. If patches of the same signal are added back at their original positions, these weights reconstruct the original samples wherever the full overlap is present. This exact identity uses the periodic Hann convention. [SciPy's COLA documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.check_COLA.html) distinguishes it from the symmetric Hann window.

WSOLA shifts source patches, so their overlapping samples may differ. COLA still gives complementary weights, but it does not guarantee unchanged amplitude or power for those mismatched waveforms.

### Why Smooth Endpoints Matter

To examine the fade shape, temporarily treat the two patches as differentiable waveforms $u(t)$ and $v(t)$ over an overlap of duration $D$. Rewrite the blend as

$$
y(t)=u(t)+a(t)\bigl(v(t)-u(t)\bigr).
$$

Differentiating separates the slopes of the waveforms from the effect of changing their weights:

$$
y'(t)=(1-a(t))u'(t)+a(t)v'(t)
+a'(t)\bigl(v(t)-u(t)\bigr).
$$

The last term is a slope contribution caused by changing the blend while the patches differ. Before the overlap, the output follows $u$ alone; afterward, it follows $v$. To meet those outer pieces without an added slope jump for arbitrary patch values, we want $a'(0)=a'(D)=0$ as well as $a(0)=0$ and $a(D)=1$.

A linear fade has nonzero slope throughout the overlap. Its slope switches on and off at the boundaries, so the extra term can introduce a slope discontinuity there. The Hann-shaped fade instead uses

$$
a(t)=\frac12\left(1-\cos\frac{\pi t}{D}\right),
\qquad
a'(t)=\frac{\pi}{2D}\sin\frac{\pi t}{D}.
$$

The derivative vanishes at both ends. Consequently, the blend meets $u$ with its original slope at the start and meets $v$ with its original slope at the end, even when the two waveforms differ. This continuous-time calculation explains the shape we sample for the discrete fade.

### The Frequency-Domain Connection

Abrupt boundaries introduce broad high-frequency content. Multiplying a signal by a finite window convolves its spectrum with the window's spectrum, so the window's spectral sidelobes determine how much energy spreads away from the original frequencies. Hann's taper reaches zero with zero slope at its outer boundaries, giving much weaker distant sidelobes than an abrupt rectangular cut. The time-domain smoothness and the reduced spectral leakage describe related benefits of the same taper. [Smith's discussion of spectrum-analysis windows](https://www.dsprelated.com/freebooks/SASP/Spectrum_Analysis_Windows.html) develops this frequency-domain view.

Hann is not the only fade with complementary weights and smooth endpoints, and these properties do not make a poor waveform match harmless. They explain why it is a useful choice for introducing the remaining mismatch gradually without adding sharp transition boundaries.
