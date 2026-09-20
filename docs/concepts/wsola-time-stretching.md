# WSOLA Time Stretching

To stretch a recording, take short patches from positions along the source timeline and stitch them into the output. For slower playback, advance less through the source between patches, so neighboring patches reuse some audio. For faster playback, advance farther. Each patch keeps its original sample spacing, which preserves the local oscillations that give the sound its pitch.

These nominal positions give us the desired timing, but the waveforms may line up poorly where patches overlap. WSOLA allows each patch to move slightly around its nominal position, searching for a better waveform match before blending the overlap. This document develops that picture and the equations used in [our implementation](../../src/lib/dsp/wsola.ts).

## Place Patches Along the Nominal Timeline

Take patches of length $W$ and place one every $H$ output samples. This spacing is called the **hop**. We use $H=W/2$, so neighboring patches overlap by half their length. These patches are also called source windows.

For a concrete example, use 40-sample patches and a 20-sample output hop. At $0.75\times$ speed, advance only 15 samples through the source for each new patch:

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

## Blend the Windows Without Changing Their Shared Level

Waveform search improves alignment, but two selected windows will rarely match exactly. Switching abruptly between them would still expose any mismatch. We therefore fade out the previous window while fading in the new one over their overlap.

Let $x[i]$ denote an individual source sample. At position $j$ in the overlap, the previous window contributes $x[n_k+j]$ and the new one contributes $x[s_k+j]$. If they agree, we want the blend to reproduce that common sample. Their weights must therefore sum to one.

Let $a[j]$ be the incoming weight. A complementary blend is

$$
y[kH+j]=(1-a[j])x[n_k+j]+a[j]x[s_k+j],
\qquad 0\le j<H.
$$

We still have a choice of fade shape. A raised cosine moves smoothly from zero toward one, with zero slope at the ends of the continuous fade:

$$
a[j]=\frac12\left(1-\cos\frac{\pi j}{H}\right).
$$

For $W=2H$, this is the first half of a periodic Hann window,

$$
w[j]=\frac12\left(1-\cos\frac{2\pi j}{W}\right).
$$

Its second half supplies exactly the complementary outgoing weight because shifting the cosine by half a window adds $\pi$ to its phase:

$$
\begin{aligned}
w[j+H]
&=\frac12\left(1-\cos\left(\frac{2\pi j}{W}+\pi\right)\right)\\
&=\frac12\left(1+\cos\frac{2\pi j}{W}\right)\\
&=1-w[j].
\end{aligned}
$$

Thus placing Hann-weighted windows one half-window apart produces the blend we wanted:

$$
y[kH+j]=x[n_k+j]w[j+H]+x[s_k+j]w[j].
$$

When $s_k=n_k$, both source samples are identical and the weights sum to one, so we reproduce the source exactly through that overlap. When the match is imperfect, we can expose its effect by rearranging the blend:

$$
y[kH+j]=x[n_k+j]+w[j]\bigl(x[s_k+j]-x[n_k+j]\bigr).
$$

The second term is the weighted mismatch. This explains why alignment and blending work together. The search seeks a similar waveform, while the fade introduces its difference gradually. Complementary weights alone cannot prevent cancellation between opposite phases or hide a badly matched transient.

## What the Choices Control

The window length $W$ determines how much waveform participates in matching and blending. Longer windows compare more context but may span changes such as note attacks. Shorter windows keep the operation more local but give the comparison less waveform to work with. The search width $S$ separately controls how far the chosen source time may move from the nominal timeline.

Our renderer uses a 20 ms window and a 30 ms search region. At 48 kHz, that gives $W=960$, $H=480$, and $S=1440$ samples. These are practical choices rather than consequences of the equations. The waveform and the requested rate determine how well the available windows match.

The construction preserves sample spacing within each selected segment, but joins can still alter the sound. Sustained periodic material often provides good matches, but attacks, noise, and mixtures of unrelated periods may not. WSOLA searches for useful waveform agreement without explicitly estimating a pitch.

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
