# Noise

The synth's noise waveform draws every sample at random, so no two notes of noise share a single sample, yet they all sound the same. What the ear hears in noise is how its power spreads over frequency, not its samples, and that is also what the math can predict. This document derives how loud the [synth's](../../src/lib/dsp/subtractive-synth.ts) noise is, how notes of noise add, and how much of it a filter passes.

## Measure Noise by Its Power

The synth's noise draws each sample $x$ independently and uniformly from $[-1,1)$. Its level is its power, the mean square, which for a uniform value is the average of $x^2$ over the interval:

$$
E[x^2]=\frac{1}{2}\int_{-1}^{1}x^2dx=\frac{1}{3}.
$$

**Noise is as loud as a sawtooth of the same peak.** Over one cycle, the sawtooth rises in a straight line from −1 to 1, so it spends equal time at every value. Its values are spread uniformly over the same interval, and the mean square depends only on that spread, not on the order of the values, so its power is $\tfrac13$ too. A sine's is $\tfrac12$, the average of $\sin^2$. So noise sits $10\log_{10}\tfrac{2}{3}=-1.8$ dB below a sine of the same peak, whatever note it plays, since noise never reads the oscillator's phase.

## Add Independent Sources in Power

A chord of two noise notes sums two signals $a$ and $b$, and the mean square of the sum has a cross term:

$$
E\big[(a+b)^2\big]=E[a^2]+E[b^2]+2E[ab].
$$

**Independent sources add in power.** The synth draws every noise layer of every note from one stream, so two notes playing together get different, independent samples. Each has mean 0, so $E[ab]=E[a]\cdot E[b]=0$, and the power doubles, 3 dB up. $N$ such notes are $10\log_{10}N$ dB up.

**The same source adds in amplitude.** If both notes drew the same samples, $b=a$ and $E[ab]=E[a^2]$, so the power would quadruple, 6 dB up, as if one note were played twice as loud. A fader is this case, which is why it moves its own track by its full amount in dB.

The cross term vanishes on average for any two sources whose phases drift against each other, not only for noise. Two violins in unison add about 3 dB, and a double-tracked part sounds thicker but only a little louder, while a copied track adds 6 dB.

## Spread the Power Evenly over Frequency

The frequency content of $N$ samples is their [discrete Fourier transform](fourier-series.md), whose $k$-th coefficient is $X_k=\sum_n x_n e^{-2\pi ikn/N}$. Its expected power has the same cross terms as the sum above:

$$
E\big[|X_k|^2\big]=\sum_{n}\sum_{m}E[x_nx_m]e^{-2\pi ik(n-m)/N}=N\cdot E[x^2].
$$

Every term with $n\neq m$ vanishes, because the samples are independent, so the result is the same at every frequency. The same sum for $E[X_kX_j^*]$ with $k\neq j$ adds evenly spaced points on the unit circle, which cancel, so different frequencies are uncorrelated too. Noise with equal power at every frequency is called **white**, after white light. At a sample rate $F_s$, white noise spreads its power evenly from 0 to the Nyquist frequency $F_s/2$, which at 48 kHz is a 24 kHz band.

## Filter Noise by the Area Under the Squared Response

A filter scales each frequency's amplitude by its magnitude response $|H(f)|$, so it scales that frequency's power by $|H(f)|^2$. The frequencies of white noise are uncorrelated, so their powers add, and the filter passes the fraction

$$
\frac{1}{F_s/2}\int_0^{F_s/2}|H(f)|^2df
$$

of the noise's power. **What the filter passes is the area under $|H|^2$ on a linear frequency axis.**

**The synth's low-pass passes about 1.11 times its cutoff.** At the flat-passband setting, the synth's resonant low-pass is the two-pole [Butterworth](digital-filters/low-pass-and-high-pass.md#choose-a-flat-passband), with $|H|^2=1/(1+\nu^4)$, where $\nu=f/f_0$ and $f_0$ is the cutoff. Substituting $\nu$ pulls the cutoff out of the area:

$$
\int_0^\infty\frac{df}{1+(f/f_0)^4}=f_0\cdot\int_0^\infty\frac{d\nu}{1+\nu^4}=f_0\cdot\frac{\pi}{2\sqrt2}\approx1.11\cdot f_0.
$$

The [appendix](#appendix-integrate-the-butterworth-response) evaluates the integral. The sampled filter's response reaches 0 at $F_s/2$ instead of at infinity, but for a cutoff well below that the area hardly changes. At 1200 Hz it's 1328 Hz instead of 1333 Hz.

**The area matches an ideal low-pass, not the spectrum.** An ideal low-pass at $1.11\cdot f_0$, a box with gain 1 below and 0 above, has the same area, so on white noise both pass the same power. The Butterworth is still 3 dB down at $f_0$ and keeps a tail above $1.11\cdot f_0$, so the two sound different. On an input whose power isn't flat, such as a sawtooth's harmonics, the area weighs each frequency by the input's power, and the two filters pass different amounts.

At a 1200 Hz cutoff, the filter keeps 1333 Hz of the 24 kHz band, a power ratio of 0.0555, which is $10\log_{10}0.0555=-12.6$ dB.

## Appendix: Integrate the Butterworth Response

Call the integral $I=\int_0^\infty d\nu/(1+\nu^4)$. Substituting $\nu\to1/\nu$ gives it another form, $I=\int_0^\infty \nu^2d\nu/(1+\nu^4)$. Adding the two and dividing the top and bottom by $\nu^2$,

$$
2I=\int_0^\infty\frac{1+\nu^2}{1+\nu^4}d\nu=\int_0^\infty\frac{1+1/\nu^2}{\nu^2+1/\nu^2}d\nu.
$$

With $u=\nu-1/\nu$, $du=(1+1/\nu^2)d\nu$ and $\nu^2+1/\nu^2=u^2+2$, and $u$ runs from $-\infty$ to $\infty$ as $\nu$ runs from 0 to $\infty$, so

$$
2I=\int_{-\infty}^{\infty}\frac{du}{u^2+2}=\frac{\pi}{\sqrt2},\qquad I=\frac{\pi}{2\sqrt2}\approx1.11.
$$

## Appendix: Expect a Measured Level to Vary

A level measured over $N$ samples averages $N$ independent values of $x^2$, so it varies around $E[x^2]$. The variance of $x^2$ is $E[x^4]-E[x^2]^2=\tfrac15-\tfrac19=\tfrac{4}{45}$, so the average's relative spread is

$$
\frac{\sqrt{4/45}}{1/3}\cdot\frac{1}{\sqrt N}\approx\frac{0.89}{\sqrt N},
$$

which for a 50 ms window of 2400 samples at 48 kHz is 1.8%, or about 0.08 dB. Filtered noise varies more for its length, because a low-pass correlates neighboring samples. Each output sample sums many inputs, so it's close to Gaussian, and over $T$ seconds its level's relative variance is

$$
\frac{\int|H|^4df}{T\cdot\big(\int|H|^2df\big)^2}.
$$

For the two-pole Butterworth, $\int|H|^4df\approx0.83\cdot f_0$, so one second through the 1200 Hz low-pass varies by 2.4%, about 0.1 dB.
