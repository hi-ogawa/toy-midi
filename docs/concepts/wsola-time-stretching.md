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

The output progresses 60 samples while the patch starts progress only 45 samples through the recording. Reusing source audio this way makes the output longer without slowing down the samples inside a patch.

More generally, patch $k$ starts at output position $kH$. For playback rate $r$, its **nominal source position** is

$$
p_k=rkH.
$$

This is the timing plan. A source of duration $T$ becomes approximately $T/r$ long. We still need to make the joins sound continuous.

## Repair the Alignment at Each Join

Consider the first two patches in the example. The first patch's second half starts at source sample 20, but the second patch's first half starts at sample 15. Those two pieces occupy the same output positions, so we will blend source samples that are five samples apart.

That offset may be harmless, or it may put peaks against troughs. For a tone with a ten-sample period, five samples is half a cycle. At equal blend weights, the two opposite phases cancel. Fading between patches avoids an abrupt switch, but it cannot by itself fix this alignment.

We therefore allow the new patch to slide a little around its nominal source position. The timing plan stays the same, while the adjustment gives us a chance to align the waveform before blending it.

### Choose the Waveform to Match

Consider the window we used on the previous hop. Its second half will overlap the next window's first half. If the next source window begins $H$ samples after the previous one's start, those halves contain exactly the same source samples.

Call this position the **natural continuation**, $n_k$. It gives us both a perfect overlap and a reference waveform for evaluating other starts.

Following that continuation forever would simply reproduce the source at its original rate. Each output hop would advance by $H$ samples in both source and output, regardless of $r$. To change duration, we must sometimes leave this exact continuation and find a similar waveform elsewhere.

### Keep the Search Near the Intended Time

Allow candidate starts $q$ within a region of width $S$ centered on the nominal position:

$$
|q-p_k|\le\frac{S}{2}.
$$

This expresses the compromise. The nominal position controls progress through the recording, while the search region allows local adjustments for waveform alignment. A larger region offers more possible matches but also permits material from farther away in source time.

If the natural continuation lies in this region, we can select it immediately. Otherwise, we need a measure of how closely each candidate resembles it.

### Score the Candidate Matches

A good candidate puts peaks near peaks and troughs near troughs in the reference waveform. We measure that agreement with a normalized correlation, also called **cosine similarity**. Let $x[i]$ be the source sample at position $i$. For a candidate starting at $q$, the score is

$$
\rho(n_k,q)=
\frac{\displaystyle\sum_{j=0}^{W-1}x[n_k+j]x[q+j]}
{\displaystyle\sqrt{\sum_{j=0}^{W-1}x[n_k+j]^2}
\sqrt{\sum_{j=0}^{W-1}x[q+j]^2}}.
$$

The numerator adds products of corresponding samples. Samples with matching signs contribute positively, while opposite signs contribute negatively. The denominator normalizes the amplitudes so a candidate does not win simply because it is louder. Matching shapes with the same polarity score 1, while opposite-polarity shapes score -1. Our implementation compares full windows, so both the immediate overlap and the following half-window contribute to the choice.

We can now express the selection rule. Let $s_k$ be the source start we select for hop $k$:

$$
s_k=\underset{|q-p_k|\le S/2}{\arg\max}\;\rho(n_k,q).
$$

For a nonzero reference, selecting $q=n_k$ scores 1, which explains why we can take the natural continuation directly whenever it is allowed. Other starts may match equally well, particularly for a periodic waveform. Choosing the natural continuation preserves the original samples through the overlap.

Once we have selected the window, its second half determines the next natural continuation:

$$
n_{k+1}=s_k+H.
$$

The two positions now have distinct roles. The natural continuation follows the window actually chosen, while the nominal position always comes from output time through $p_k=rkH$. A local alignment adjustment therefore does not shift the nominal timeline of every later window.

### Follow the Adjustment Through a Few Patches

Return to the 40-sample patches, 20-sample output hop, and $0.75\times$ rate. Allow a search radius of 17 samples, so $S=34$. Start the first patch at source position zero.

The next natural continuation is 20, only five samples beyond its nominal position of 15. We can take that exact continuation. The following patches can likewise start at 40 and 60, even though their nominal positions are 30 and 45.

For patch 4, however, the natural continuation reaches 80 while the nominal position is only 60. The 20-sample difference is outside the allowed radius, so we search for another match. Suppose the waveform gives a good match at 56. This revisits audio 24 samples earlier than the uninterrupted continuation, adding duration through the join. The next natural continuation becomes $56+20=76$, close to the next nominal position of $0.75\times100=75$.

The particular match depends on the audio. A nearly periodic signal offers similar patches separated by roughly whole periods. Revisiting one can add duration while keeping the oscillations aligned. At faster rates, the nominal timeline moves ahead of natural continuation, and the adjustments generally skip source material instead.

## Blend the Windows Without Changing Their Shared Level

Waveform search improves alignment, but two selected windows will rarely match exactly. Switching abruptly between them would still expose any mismatch. We therefore fade out the previous window while fading in the new one over their overlap.

At position $j$ in the overlap, the previous window contributes $x[n_k+j]$ and the new one contributes $x[s_k+j]$. If they agree, we want the blend to reproduce that common sample. Their weights must therefore sum to one.

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
