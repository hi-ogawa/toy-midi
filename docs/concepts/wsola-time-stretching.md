# WSOLA Time Stretching

We want to change how long a recording lasts while keeping its pitch. Simply playing its samples more slowly stretches both the recording and every oscillation inside it, so the pitch falls too. How can we change the overall duration while leaving those local oscillations intact?

WSOLA builds the output from short source segments, keeping the sample spacing within each segment unchanged. The questions are which segments to choose and how to join them. We will develop those choices from the timing and waveform requirements, then connect the resulting equations to [our implementation](../../src/lib/dsp/wsola.ts).

## Separate Local Oscillation from Overall Progress

Let $x[i]$ be a source signal sampled at $F_s$ samples per second. A sinusoid of frequency $f$ has the form

$$
x[i]=\cos\left(\frac{2\pi f}{F_s}i\right).
$$

If we advance through the source by $r$ samples per output sample, resampling gives

$$
y[m]=x[rm]
=\cos\left(\frac{2\pi rf}{F_s}m\right).
$$

The frequency becomes $rf$. At $r=0.75$, the recording lasts longer, but every frequency also falls to three quarters of its original value.

Instead, copy a short segment starting at source position $q$. Within that segment,

$$
x[q+j]=\cos\left(\frac{2\pi f}{F_s}j+\frac{2\pi f}{F_s}q\right).
$$

Choosing $q$ changes the phase, while the frequency with respect to the local index $j$ remains $f$. This gives us a way to separate two decisions. Preserve the samples within each segment, and change the overall progress through the recording by choosing where successive segments begin.

## Set the Source Timeline

Take source windows of length $W$ and place one every $H$ output samples. The distance $H$ is called the **hop**. We will use $H=W/2$, so neighboring windows overlap by half their length and can be blended together.

Window $k$ begins at output position $kH$. If the requested playback rate is $r$ source samples per output sample, its intended source position is

$$
p_k=rkH.
$$

We call $p_k$ the **nominal source position**. At $r=0.75$, successive output windows are $H$ samples apart, while their nominal source positions advance by only $0.75H$. We cover less source audio over the same output duration, so a source of duration $T$ becomes approximately $T/r$ long.

For now, this establishes only where each window should come from in time. It does not tell us whether the waveforms will join well. We use ideal positions in the equations and leave rounding to sample indices to the implementation.

## Find a Window That Continues the Waveform

Starting every window exactly at $p_k$ keeps the requested timing, but the overlapping pieces can have different phases. Two copies of the same tone can even cancel when blended if a peak in one aligns with a trough in the other. We need some freedom to adjust the source start while staying near the intended time.

### Identify an Exact Continuation

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

### Compare Waveform Shape

Write the reference and candidate windows as vectors:

$$
u_j=x[n_k+j],
\qquad v_j=x[q+j],
\qquad 0\le j<W.
$$

A direct measure of mismatch is the squared distance $\sum_j(u_j-v_j)^2$. But two windows may have the same waveform shape at different amplitudes, and we would still like to recognize their alignment. Normalize each nonzero vector to unit length before comparing them:

$$
\begin{aligned}
\left\|\frac{u}{\|u\|}-\frac{v}{\|v\|}\right\|^2
&=\frac{\|u\|^2}{\|u\|^2}+\frac{\|v\|^2}{\|v\|^2}
-2\frac{u\cdot v}{\|u\|\|v\|}\\
&=2-2\frac{u\cdot v}{\|u\|\|v\|}.
\end{aligned}
$$

Minimizing this distance is therefore equivalent to maximizing the normalized dot product, also called **cosine similarity**:

$$
\rho(n_k,q)=
\frac{\displaystyle\sum_{j=0}^{W-1}x[n_k+j]x[q+j]}
{\displaystyle\sqrt{\sum_{j=0}^{W-1}x[n_k+j]^2}
\sqrt{\sum_{j=0}^{W-1}x[q+j]^2}}.
$$

Matching shapes with the same polarity score 1, while opposite-polarity shapes score -1. Normalization lets us compare their alignment without favoring a candidate simply because it is louder. Our implementation compares full windows, so both the immediate overlap and the following half-window contribute to the choice.

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

## See How a Slower Rate Reuses Audio

Use small sample counts to make the positions easy to follow. Let $W=40$, $H=20$, $S=34$, and $r=0.75$. Start at source position zero. The nominal position advances by 15 samples per hop, while natural continuation advances by 20 until a search changes the selected window.

| Hop $k$ | Output position $kH$ | Nominal position $p_k$ | Natural continuation $n_k$ | Selected start $s_k$ |
| ------- | -------------------- | ---------------------- | -------------------------- | -------------------- |
| 0       | 0                    | 0                      | 0                          | 0                    |
| 1       | 20                   | 15                     | 20                         | 20                   |
| 2       | 40                   | 30                     | 40                         | 40                   |
| 3       | 60                   | 45                     | 60                         | 60                   |

At hop 4, output position is 80, nominal source position is 60, and natural continuation is 80. The natural continuation is now 20 samples away from the nominal position, outside the 17-sample search radius. We must choose an earlier matching window to stay near the requested timeline.

Suppose the waveform gives a good match at source position 56. The selected start moves back by 24 samples from the natural continuation of 80. We revisit source material while adding another hop to the output, which extends the recording. The next natural continuation is $56+20=76$, while the next nominal position is $0.75\times100=75$.

The particular match depends on the audio. A nearly periodic signal offers similar windows separated by roughly whole periods, so revisiting one can add duration without substantially changing its local oscillation. At faster rates, the nominal timeline moves ahead of natural continuation, and matching jumps generally skip source material instead.

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
