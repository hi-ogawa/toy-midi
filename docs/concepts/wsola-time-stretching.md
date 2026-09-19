# WSOLA Time Stretching

WSOLA changes audio duration by joining short source segments whose waveforms line up at their boundaries. Each segment keeps its original sample spacing, so its local oscillations keep their pitch. Playback speed changes through the choice of segments and how much source time they cover.

This document explains the implementation in [`src/lib/dsp/wsola.ts`](../../src/lib/dsp/wsola.ts). `WsolaProcessor` reads an entire immutable source, while `StreamingWsola` accepts incoming PCM blocks. Both use the same window selection and overlap-add calculations.

## Frames, Windows, and Playback Rate

An audio frame contains one sample from each channel. Let $x_c[i]$ be the source sample at frame $i$ in channel $c$. The source is planar, so each channel has its own array and all channels share frame indices.

The algorithm uses three frame distances:

| Symbol  | Code           | Meaning                                                    |
| ------- | -------------- | ---------------------------------------------------------- |
| $W$     | `windowFrames` | Length of each selected source segment                     |
| $H=W/2$ | `hopFrames`    | Output frames generated per step                           |
| $S$     | `searchFrames` | Number of candidate start positions in the search interval |

The constructor converts the window and search durations to frames using the sample rate. It rounds the window length to at least two frames and increases odd lengths by one, giving an even $W$ and an integer half-window hop. The search length is rounded to at least one frame.

The command-line renderer and pitch-shifter worklet use a 20 ms window and a 30 ms search interval. At 48 kHz, these give

$$
W=48000\times0.020=960,
\qquad H=480,
\qquad S=48000\times0.030=1440.
$$

Let $r$ be `playbackRate`, measured as nominal source frames per output frame. At $r=0.75$, one second of output covers about 0.75 seconds of source audio. At $r=1.5$, it covers about 1.5 seconds. For a finite source of $N$ frames, the output length is

$$
N_{\mathrm{out}}=\left\lceil\frac{N}{r}\right\rceil.
$$

## Nominal Position and Natural Continuation

Number the generated output hops with $k=0,1,2,\ldots$. Hop $k$ starts at output frame $kH$. Its **nominal source position** follows the requested playback rate:

$$
p_k=\mathrm{round}(rkH).
$$

This is `nominalSourcePosition`. The difference between successive nominal positions is approximately $rH$, while each output hop always advances by $H$ frames.

Waveform alignment can move the selected source start away from $p_k$. Write that selected start as $s_k$. The **natural continuation** for the next hop is

$$
n_{k+1}=s_k+H,
\qquad n_0=0.
$$

This is `naturalSourcePosition`. It starts at the second half of the previously selected window. Selecting this continuation again makes the overlapping samples agree exactly, so it is a useful reference for the next join.

The nominal position is recomputed from output time on every hop. A local alignment adjustment changes the next natural continuation, while the nominal timeline continues to follow $rkH$. This keeps successive adjustments from accumulating into an unintended playback rate.

## Choose a Source Window

The search interval is centered approximately on the nominal position:

$$
a_k=p_k-\left\lfloor\frac{S}{2}\right\rfloor,
\qquad b_k=a_k+S.
$$

Candidate starts are the integer frames from $a_k$ through $b_k-1$. The end $b_k$ is exclusive, and $S$ describes the entire interval width.

If the natural continuation lies inside this interval, the implementation selects it directly:

$$
a_k\le n_k\lt b_k
\quad\Longrightarrow\quad
s_k=n_k.
$$

Otherwise, it compares candidate windows with the full $W$-frame window beginning at $n_k$. The search favors the candidate with the highest waveform similarity. The reference is source audio at the natural continuation, and the comparison includes both halves of the window.

### Similarity Score

For a candidate start $q$, the score is the cosine similarity of the reference and candidate samples across all channels:

$$
\rho(q)=
\frac{\displaystyle\sum_c\sum_{j=0}^{W-1}x_c[n_k+j]x_c[q+j]}
{\displaystyle
\sqrt{\left(\sum_c\sum_{j=0}^{W-1}x_c[n_k+j]^2\right)
      \left(\sum_c\sum_{j=0}^{W-1}x_c[q+j]^2\right)}}.
$$

The numerator measures agreement between corresponding samples. The denominator normalizes their overall amplitudes. Identical nonzero windows score 1, opposite-polarity windows score -1, and windows with a zero dot product score 0. If either window has zero energy, the implementation returns 0.

All channels contribute to one score and use one selected start. This preserves their relative timing through each splice. A separate search for each channel could select different waveform cycles and shift the stereo image.

`findBestCandidate` first evaluates every fifth candidate start. It then evaluates every individual start within five frames of the coarse winner, clipped to the search interval. Each score still uses all $W$ samples per channel. This reduces the number of evaluated candidates, so the result approximates an exhaustive search. Equal scores keep the first candidate evaluated with that score.

### Example at 0.75× Speed

Use a small illustrative sample rate of 1 kHz, with the same 20 ms window and 30 ms search settings. Then $W=20$, $H=10$, and $S=30$.

| Hop $k$ | Output start $kH$ | Nominal start $p_k$ | Search interval | Natural start $n_k$ | Selected start $s_k$ |
| ------- | ----------------: | ------------------: | --------------- | ------------------: | -------------------: |
| 0       |                 0 |                   0 | $[-15,15)$      |                   0 |                    0 |
| 1       |                10 |                   8 | $[-7,23)$       |                  10 |                   10 |
| 2       |                20 |                  15 | $[0,30)$        |                  20 |                   20 |
| 3       |                30 |                  23 | $[8,38)$        |                  30 |                   30 |
| 4       |                40 |                  30 | $[15,45)$       |                  40 |                   40 |
| 5       |                50 |                  38 | $[23,53)$       |                  50 |                   50 |
| 6       |                60 |                  45 | $[30,60)$       |                  60 | 48, for this example |
| 7       |                70 |                  53 | $[38,68)$       |                  58 |                   58 |

The first six hops use natural continuation. At hop 6, frame 60 lies at the excluded end of the search interval, so a similarity search runs. Suppose the waveform makes frame 48 the selected candidate. This choice is illustrative because the actual winner depends on the audio.

The next natural start becomes $48+10=58$, while the next nominal start is still $\mathrm{round}(0.75\times70)=53$. Moving back from the expected continuation of 60 to 48 revisits source material, extending its duration. At faster playback rates, alignment jumps generally skip source material instead.

## Join the Selected Windows

The implementation uses a periodic Hann window:

$$
w[j]=\frac{1}{2}\left(1-\cos\frac{2\pi j}{W}\right),
\qquad 0\le j\lt W.
$$

With $H=W/2$, shifting the cosine by half a window adds $\pi$ to its phase and reverses its sign. Therefore

$$
w[j]+w[j+H]=1,
\qquad 0\le j\lt H.
$$

For hop $k$, let $C_c[j]$ be the unweighted second half carried from the previous selected window. The next $H$ output samples are

$$
y_c[kH+j]=C_c[j]w[j+H]+x_c[s_k+j]w[j],
\qquad 0\le j\lt H.
$$

The carry is then replaced with the new window's second half:

$$
C_c[j]\leftarrow x_c[s_k+H+j].
$$

At natural continuation, both terms in the output equation refer to the same source sample. Their weights sum to 1, reproducing that sample. After a search jump, the two terms come from different source positions. Correlation seeks a close waveform match so their weighted blend forms a smooth join. For poorly matched windows, the blend can still change the sound.

The first carry contains zeros. The first output hop therefore fades in with the first half of the Hann window. The unit-sum identity describes the join once both contributions are present.

## Output Blocks and Source Boundaries

Window generation and output consumption use separate cursors. `generatedOutputPosition` advances by $H$ whenever a hop is generated. `hopOutputOffset` records how much of that hop the consumer has read. A request for 128 output frames can consume part of a 480-frame hop, and the next request resumes from the remaining samples.

`WsolaProcessor` reads an immutable finite source. Similarity and overlap-add treat samples outside that source as zero. The consumer receives exactly $\lceil N/r\rceil$ output frames, even when the last internally generated hop extends beyond that length. Completion follows this output-frame count.

`StreamingWsola` receives input incrementally. It waits for future samples instead of assuming that missing input is silence. A pull can return a partial block or zero when the next hop is not ready. It has no end-of-stream signal, so finite callers own the final output length and supply zero padding when they need to render the tail.

## Streaming Readiness and Retention

Let $L$ be the total number of source frames received so far, using an exclusive end index. Natural continuation requires the window through $n_k+W$. A search also requires all candidate windows, including the last start at $b_k-1$. The required exclusive end is

$$
E_k=
\begin{cases}
n_k+W, & a_k\le n_k\lt b_k,\\
\max(n_k+W,\ b_k-1+W), & \text{otherwise}.
\end{cases}
$$

`canGenerateHop` permits generation when $E_k\le L$. Checking only the candidate windows would omit the reference window needed to score them.

Before the first pull, the processor also waits for `latencyFrames` source frames:

$$
B=W+\left\lceil\frac{S}{2}\right\rceil
  +\left\lceil\max(0,(1-r)H)\right\rceil+1.
$$

The window and half-search terms reserve future samples beyond a nominal start. The extra $(1-r)H$ term accounts for natural continuation advancing by $H$ while the nominal position advances by about $rH$. This matters during slow playback, when the natural reference can reach farther ahead. The final frame provides rounding headroom. At 48 kHz and $r=0.75$, the reserve is $960+720+120+1=1801$ source frames, about 37.5 ms.

The separate `lookaheadFrames` value is $W+S$. Callers use this allowance when padding a finite source. Actual per-hop readiness is still determined by $E_k$.

After a hop, the streaming processor retains the source needed by the next natural continuation or search. Its discard boundary is the earlier of those two starts, clamped to frame zero:

$$
\max\bigl(0,\min(n_{k+1},a_{k+1})\bigr).
$$

The stream buffer keeps absolute source indices as old storage is reused. It also enforces its fixed capacity, and `push` throws if the producer supplies more input than the retained buffer can hold.

## Relationship to Pitch Shifting

[`StreamingPitchShifter`](../../src/lib/dsp/pitch-shifter.ts) combines WSOLA with resampling. For a requested pitch ratio $p$, it runs WSOLA at $r=1/p$, producing approximately $p$ times as many frames. Its resampler then consumes $p$ stretched frames per output frame. The durations cancel while resampling shifts pitch by $p$.

The WSOLA alignment search itself estimates which source segments join well. It operates directly on waveform similarity, with the window and search lengths controlling how much audio participates in each comparison.

## Code Map

| Concept                                                | Implementation                                             |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Nominal timeline and natural continuation              | `WsolaProcessor.generateHop`, `StreamingWsola.generateHop` |
| Candidate interval in the streaming path               | `StreamingWsola.getSearchStart`                            |
| Coarse search and local refinement                     | `findBestCandidate`                                        |
| Multichannel cosine similarity                         | `calculateSimilarity`                                      |
| Hann weights and carried half-window                   | `createPeriodicHannWindow`, `overlapAddPlanar`             |
| Future input and retained history                      | `StreamingWsola.canGenerateHop`, `PlanarStreamBuffer`      |
| Block-size independence and finite/streaming agreement | [`wsola.test.ts`](../../src/lib/dsp/wsola.test.ts)         |

The implementation's opening comments document its relationship to Chromium's audio renderer and the choices made when adapting it. The [command-line renderer](../../tools/wsola.ts) supports listening experiments with playback rate, window length, and search length.

## Visual Companion

The [WSOLA visual explainer](https://gisthost.github.io/?109135460ad3d821bc7f7ce66278e0bb/wsola-explainer.html) introduces the algorithm through high-level visual intuition. It complements the equations and implementation details in this document.
