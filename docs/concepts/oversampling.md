# Oversampling

A nonlinear process such as clipping creates frequencies its input didn't have, and some of them can be higher than the sample rate can hold. Computed at the original rate, those frequencies don't disappear but fold back as tones that were never in the music. Oversampling runs the process at a higher rate, where the new frequencies fit, and filters them out on the way back. This document develops that picture and the filters used in [our implementation](../../src/lib/dsp/oversampler.ts), which the [guitar amp](guitar-amp-simulation.md) runs its drive inside.

Throughout, $F_s$ is the original sample rate, 48 kHz in the examples, and $L=4$ is the oversampling factor.

## See Why Clipping Aliases

Sampling at $F_s$ can't tell some frequencies apart. A cosine at $f$ and one at $F_s-f$ give the same samples, since

$$
\cos\Big(2\pi(F_s-f)\frac{n}{F_s}\Big)=\cos\Big(2\pi n-2\pi f\frac{n}{F_s}\Big)=\cos\Big(2\pi f\frac{n}{F_s}\Big).
$$

So every frequency above the **Nyquist frequency** $F_s/2$ has a twin below it, and a sample sequence can only represent frequencies up to $F_s/2$. A frequency $f$ above it shows up as its **alias** $F_s-f$, and more generally as $|f-mF_s|$ for the integer $m$ that lands it in $[0,F_s/2]$.

A linear filter never creates frequencies, so this only matters when something new is made. Clipping a note at $f_0$ makes harmonics at $kf_0$ for $k=2,3,\dots$, and a hard-driven clipper makes many of them. For a 1318 Hz lead note, the 19th harmonic is at 25 kHz, past the 24 kHz Nyquist frequency, and computing the clipper sample by sample at 48 kHz puts it at $48-25=23$ kHz instead. The 21st, at 27.7 kHz, lands at 20.3 kHz, and so on down. These folded tones aren't multiples of $f_0$, so they sound like inharmonic fizz, and on a bend they move the wrong way, falling as the note rises.

## Raise the Rate, Process, and Come Back

If the clipper runs at $LF_s$, its Nyquist frequency is $LF_s/2$, 96 kHz at $L=4$, and harmonics up to there are represented correctly. Only harmonics above 96 kHz still fold, and a clipper's harmonics are weak that high. Afterwards everything above the original $F_s/2$ is removed before returning to $F_s$, so those harmonics are cut instead of folded.

### Upsample by Inserting Zeros and Filtering

Insert $L-1$ zeros after each sample:

$$
v[m]=\begin{cases}x[m/L] & L\mid m,\\ 0 & \text{otherwise.}\end{cases}
$$

At the high rate, $v$ has the spectrum of $x$ repeated. Its z-transform is $V(z)=\sum_n x[n]z^{-Ln}=X(z^L)$, so at the high-rate frequency $\omega$ it reads $X$ at $L\omega$. As $\omega$ runs from $0$ to $\pi$, $L\omega$ runs around the circle $L/2$ times, and the original band from 0 to $F_s/2$ appears again as **images** around $F_s$, $2F_s$, and so on. A low-pass at the original Nyquist frequency, $\omega=\pi/L$ at the high rate, keeps the first copy and removes the images, leaving $x$ interpolated at the higher rate. Since only one sample in $L$ is nonzero, the low-pass's output is $1/L$ as loud, so it is multiplied by $L$.

### Downsample by Filtering and Keeping Every $L$th Sample

Keeping every $L$th sample is sampling again at $F_s$, so anything above $F_s/2$ in the processed signal would alias by the same rule as above. A low-pass at $\omega=\pi/L$ removes it first, and then every $L$th sample is kept.

## Design the Low-Pass

Both directions need the same filter: pass everything below the original Nyquist frequency and stop everything above.

### Start from the Ideal Low-Pass

The ideal low-pass at $\omega_c=\pi/L$ has the impulse response

$$
h_\text{ideal}[n]=\frac{\sin(\omega_c n)}{\pi n}=\frac{1}{L}\text{sinc}\frac{n}{L},
$$

which is infinitely long. Cutting it to $N$ taps, centered at $c=(N-1)/2$ so the filter delays every frequency equally by $c$ samples, makes it usable. Cutting it abruptly leaves ripples near the cutoff and a stopband only about 21 dB down, so the taps are tapered by a **window** $w[n]$ instead:

$$
h[n]=\frac{\sin\big(\omega_c(n-c)\big)}{\pi(n-c)} \cdot w[n],
\qquad n=0,\dots,N-1.
$$

The taps are then scaled to sum to 1, so the filter passes DC at exactly unity.

### Trade Length for Stopband with a Kaiser Window

A window trades two things. Its taper sets how far down the stopband is, and its length sets how wide the **transition band** between passband and stopband is. The **Kaiser window**,

$$
w[n]=\frac{I_0\Big(\beta\sqrt{1-\big((n-c)/c\big)^2}\Big)}{I_0(\beta)},
$$

with $I_0$ the modified Bessel function of order zero, exposes both. For a stopband attenuation of $A$ dB and a transition band $\Delta\omega$ wide, Kaiser's formulas give

$$
\beta=0.1102 \cdot (A-8.7),
\qquad
N-1\approx\frac{A-8}{2.285 \cdot \Delta\omega}.
$$

We take $A=80$ dB, so $\beta=7.86$, and $N=96$ taps at the high rate. Then $\Delta\omega\approx72/(2.285\cdot95)\approx0.33$ rad at the high rate, about $0.21F_s$ wide. Centered on the original Nyquist frequency, at 48 kHz the filter is flat to about 19 kHz and 80 dB down from about 29 kHz. What still folds back from inside the transition band lands above 19 kHz, where little of a guitar's sound is.

Measured with a steady sine at 0.3 through the amp's drive, the energy between the note's harmonics, which is aliasing, falls this far below the note:

| Drive, note        | At $F_s$ | At $4F_s$ |
| ------------------ | -------- | --------- |
| High gain, 330 Hz  | −45 dB   | −97 dB    |
| High gain, 1318 Hz | −22 dB   | −61 dB    |
| Crunch, 1318 Hz    | −61 dB   | −135 dB   |

## Skip the Work That Zeros and Dropped Samples Waste

Applied directly, both filters would spend most of their multiplications on nothing. The upsampler's input is mostly inserted zeros, and the downsampler throws away $L-1$ of every $L$ outputs. Splitting the filter into **polyphase** branches avoids both.

For the upsampler, the high-rate output at $m=Ln+p$, with phase $p=0,\dots,L-1$, is

$$
y[Ln+p]=L\sum_{j}h[j] \cdot v[Ln+p-j].
$$

Only the terms where $Ln+p-j$ is a multiple of $L$ are nonzero, which means $j=p+Lk$, and there $v=x[n-k]$:

$$
y[Ln+p]=L\sum_{k=0}^{N/L-1}h[p+Lk] \cdot x[n-k].
$$

Each output phase is a short filter of $N/L=24$ taps on the original samples, so each input sample costs $N=96$ multiplications for its four outputs rather than $4N$.

For the downsampler, only the outputs that are kept are computed, one full $N$-tap sum per original-rate sample.

### Account for the Delay

Each low-pass delays by $c=(N-1)/2=47.5$ high-rate samples, so the pair delays by 95. The downsampler's output $n$ is computed at high-rate sample $Ln+L-1$, the last of its block, so the round trip delays by $(95-3)/4=23$ original samples, about half a millisecond at 48 kHz.
