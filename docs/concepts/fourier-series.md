# Fourier Series

A periodic waveform is a sum of harmonics, which are sinusoids at whole multiples of its fundamental frequency. Several docs lean on that fact and a few consequences of it. This one states them with the intuition behind them: waveforms are vectors, the harmonics are perpendicular axes, and each harmonic's amount is read off with an inner product.

Measure time in cycles, so a waveform $x(\varphi)$ has period 1 in its phase $\varphi$. A waveform with period $T$ in seconds is the same with $\varphi=t/T$, and its $n$-th harmonic is at $n/T$ Hz.

## Treat a Waveform as a Vector

Waveforms add and scale like vectors, so give them the geometry of vectors too. [WSOLA](wsola-time-stretching.md#score-the-candidate-matches) compares windows of samples with an inner product, a sum of products of matching samples. A continuous waveform has a value at every phase, so the sum becomes an integral over one cycle:

$$
\langle x,y\rangle=\int_0^1 x(\varphi)\overline{y(\varphi)}d\varphi.
$$

The conjugate keeps $\langle x,x\rangle$ real and nonnegative when the values are complex. The length of a waveform is then its RMS level, since $\|x\|^2=\langle x,x\rangle$ is the mean square over a cycle. The waveforms with finite length, the square-integrable ones, form the space $L^2$, and every waveform in this project is one of them.

## Read Each Harmonic with an Inner Product

Write the $n$-th harmonic as the complex tone $e_n(\varphi)=e^{2\pi in\varphi}$, for every integer $n$, including negative ones. Two different harmonics are perpendicular, and each has length 1:

$$
\langle e_n,e_m\rangle=\int_0^1 e^{2\pi i(n-m)\varphi}d\varphi=
\begin{cases}1 & n=m,\\ 0 & n\neq m,\end{cases}
$$

because for $n\neq m$ the integrand turns a whole number of times around the unit circle and averages to 0. The harmonics are also **complete**, meaning no nonzero waveform in $L^2$ is perpendicular to all of them. That part is a theorem rather than a calculation, and it makes the harmonics an orthonormal basis, so every waveform is a sum of them:

$$
x=\sum_{n=-\infty}^{\infty}c_n e_n,\qquad c_n=\langle x,e_n\rangle=\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi.
$$

The coefficient formula is the same as reading a coordinate in 3D with a dot product against an axis. Because the axes are perpendicular, each coordinate comes out on its own, so finding one harmonic needs no knowledge of the others, and keeping only the harmonics up to some $N$ gives the closest such sum to $x$ in RMS.

**A real waveform pairs each harmonic with its negative.** For real $x$, $c_{-n}=\overline{c_n}$, so the two terms add up to one real sinusoid:

$$
c_n e^{2\pi in\varphi}+c_{-n}e^{-2\pi in\varphi}=2|c_n|\cos(2\pi n\varphi+\arg c_n).
$$

The $n$-th harmonic has amplitude $2|c_n|$ and phase $\arg c_n$, and $c_0$ is the DC offset.

**The sum converges in RMS, not at every point.** The RMS of the error between $x$ and the sum of its harmonics up to $N$ goes to 0 as $N$ grows. At a jump, though, every partial sum overshoots by about 9% of the jump, which is the **Gibbs phenomenon**, and the overshoot only narrows. The coefficients themselves are plain integrals, so arguments about them don't depend on this.

## Split the Energy Across Harmonics

Pythagoras holds for perpendicular axes, so the squared length is the sum of the squared coordinates. This is **Parseval's theorem**:

$$
\|x\|^2=\sum_{n=-\infty}^{\infty}|c_n|^2.
$$

In audio terms, the mean square of a waveform is the sum of its harmonics' mean squares. A real harmonic of amplitude $A_n=2|c_n|$ has mean square $A_n^2/2$, which is $|c_n|^2+|c_{-n}|^2$. For example, the sawtooth $2\varphi-1$ has mean square $1/3$, and its harmonics have amplitudes $2/(\pi n)$, so

$$
\sum_{n=1}^{\infty}\frac{1}{2}\Big(\frac{2}{\pi n}\Big)^2=\frac{2}{\pi^2}\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{2}{\pi^2}\cdot\frac{\pi^2}{6}=\frac{1}{3}.
$$

## Shift and Differentiate One Coefficient at a Time

Shifting or differentiating a waveform acts on each harmonic separately, so it multiplies each coefficient by a factor that depends only on $n$.

**A shift rotates each coefficient.** Substituting into the coefficient formula, $x(\varphi+s)$ has coefficients $e^{2\pi ins}c_n$. A half-cycle shift multiplies them by $e^{i\pi n}=(-1)^n$. So a waveform whose second half is its first half flipped, $x(\varphi+\tfrac12)=-x(\varphi)$, has $(-1)^nc_n=-c_n$, and its even harmonics vanish. The square and triangle have this symmetry, and so does any odd clipper driven by a sine, which is how the [amp doc](guitar-amp-simulation.md#appendix-why-an-odd-clipper-adds-only-odd-harmonics) shows that a symmetric drive adds only odd harmonics.

**A derivative multiplies each coefficient by $2\pi in$.** Integrating by parts over one cycle,

$$
\int_0^1 x'(\varphi)e^{-2\pi in\varphi}d\varphi=\Big[x(\varphi)e^{-2\pi in\varphi}\Big]_0^1+2\pi in\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi=2\pi in\cdot c_n,
$$

where the boundary term vanishes because $x(1)=x(0)$. Read the other way, integrating a waveform divides the $n$-th coefficient by $2\pi in$, so its high harmonics fall faster.

**Smoother shapes have faster-falling harmonics.** The boundary term vanishes only if $x$ is continuous around the whole cycle. Each jump leaves a term of the jump's size that doesn't shrink with $n$, so after the division by $2\pi in$, a waveform with a jump has harmonics falling as $1/n$, like the sawtooth. A waveform without jumps but with corners has a slope that jumps, so the same argument applied to the slope gives $1/n^2$, like the triangle. Each further derivative that stays continuous adds another factor of $1/n$.

## Use the Same Picture for Sampled Signals

A frame of $N$ samples is a vector in $\mathbb{C}^N$, with the inner product $\langle x,y\rangle=\sum_m x[m]\overline{y[m]}$. The sampled tones $e_k[m]=e^{2\pi ikm/N}$ for $k=0,\dots,N-1$ are perpendicular, each with squared length $N$, and there are $N$ of them, so they form a basis without any theorem about completeness. The discrete Fourier transform reads the coordinates, $X(k)=\langle x,e_k\rangle$, which the FFT computes quickly, and Parseval's theorem becomes

$$
\sum_{m=0}^{N-1}|x[m]|^2=\frac{1}{N}\sum_{k=0}^{N-1}|X(k)|^2,
$$

which is what lets [onset detection](../bass-pitch/onset-detection.md) measure power in a frequency band by summing squared FFT magnitudes.

Only $N$ tones are distinct, because $e_{k+N}[m]=e_k[m]$ at every sample. A harmonic past the Nyquist frequency is therefore indistinguishable from a lower one once sampled, which is the aliasing that [oversampling](oversampling.md) works around.
