# Fourier Series

A periodic waveform is a sum of harmonics, which are sinusoids at whole multiples of its fundamental frequency. Several docs lean on that fact and a few consequences of it. This one states them with the intuition behind them: waveforms are vectors, the harmonics are perpendicular axes, and each harmonic's amount is read off with an inner product.

Measure time in cycles, so a waveform $x(\varphi)$ has period 1 in its phase $\varphi$. A waveform with period $T$ in seconds is the same with $\varphi=t/T$, and its $n$-th harmonic is at $n/T$ Hz.

## Treat a Waveform as a Vector

Waveforms add and scale like vectors, so give them the geometry of vectors too. Two vectors' dot product is the sum of the products of their matching entries, and a frame of samples is a vector with one entry per sample. A continuous waveform has a value at every phase, so the sum becomes an integral over one cycle:

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

A real waveform uses $e_n$ and $e_{-n}$ together as one real sinusoid, with $|c_{-n}|=|c_n|$, so read $|c_n|$ for $n>0$ as how loud the $n$-th harmonic is, and $c_0$ as the DC offset.

## Shift, Filter, and Differentiate One Coefficient at a Time

Shifting, filtering, or differentiating a waveform acts on each harmonic separately. A harmonic goes in and the same harmonic comes out, scaled by a factor that depends only on $n$, so the operation multiplies each coefficient by its factor.

**A shift rotates each coefficient.** Substituting into the coefficient formula, $x(\varphi-s)$, which is $x$ delayed by $s$, has coefficients $e^{-2\pi ins}c_n$. The $n$-th harmonic runs $n$ times as fast as the fundamental, so the same delay turns its phase $n$ times as far.

**Convolution multiplies each coefficient by the kernel's.** Convolving $x$ with a kernel $h$ of period 1 takes a weighted average of delayed copies of $x$, with $h(s)$ as the weight of the copy delayed by $s$:

$$
(h*x)(\varphi)=\int_0^1 h(s)x(\varphi-s)ds.
$$

Each delayed copy has coefficients $e^{-2\pi ins}c_n$, so the average has the same average of rotations in front of each coefficient,

$$
\int_0^1 h(s)e^{-2\pi ins}ds\cdot c_n=h_n c_n,
$$

where $h_n$ is the kernel's own $n$-th coefficient. So a filter that convolves with $h$ scales the $n$-th harmonic by $h_n$, and $h$'s harmonics are the filter's gain at each frequency. A shift is the special case where all the weight sits at one delay. For a signal that isn't periodic, the same computation runs over every frequency $f$ instead of the whole numbers $n$, and the factor becomes $h$'s spectrum, which is how [oversampling](oversampling.md) reads its low-pass off the sinc. The roles also swap. Multiplying $x$ by the harmonic $e_k$ moves every coefficient up by $k$, so multiplying two waveforms convolves their coefficients.

**A derivative multiplies each coefficient by $2\pi in$.** Integrating by parts over one cycle,

$$
\int_0^1 x'(\varphi)e^{-2\pi in\varphi}d\varphi=\Big[x(\varphi)e^{-2\pi in\varphi}\Big]_0^1+2\pi in\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi=2\pi in\cdot c_n,
$$

where the boundary term vanishes because $x(1)=x(0)$. Read the other way, integrating a waveform divides the $n$-th coefficient by $2\pi in$, so its high harmonics fall faster.

## Read the Falloff from Jumps and Corners

The boundary term above vanishes only if $x$ is continuous around the whole cycle. Keeping it when $x$ jumps shows where a waveform's high harmonics come from.

**Integrate by parts between the jumps.** Let $x$ be smooth except at the phases $\varphi_1,\dots,\varphi_m$ in each cycle, where it jumps by $J_k=x(\varphi_k^+)-x(\varphi_k^-)$. Integrating by parts on each smooth piece, every break is the end of one piece and the start of the next, so its two boundary terms combine into one term of size $J_k$. Where $x$ is continuous they cancel, and periodicity joins the last piece to the first. So

$$
c_n=\frac{1}{2\pi in}\sum_{k=1}^{m}J_k e^{-2\pi in\varphi_k}+\frac{1}{2\pi in}c_n[x'],
$$

where $x'$ is the slope of the smooth pieces, without the jumps, and $c_n[x']$ is its $n$-th coefficient. The first term comes from the jumps alone. Each jump adds the same magnitude $|J_k|$ to every harmonic, so after the division by $2\pi in$ it falls as $1/n$. The second term comes from the smooth pieces alone.

**The sawtooth is all jump.** The sawtooth $2\varphi-1$ has slope 2 everywhere, and a constant has no harmonics, so the second term vanishes. With its one jump $J=-2$ at $\varphi=0$, $c_n=-2/(2\pi in)$, so its harmonics fall exactly as $1/n$. Every harmonic of the sawtooth comes from its jump.

**The lowest derivative that jumps sets the falloff.** The second term splits the same way at the jumps of $x'$, which are the corners of $x$, so corners give harmonics falling as $1/n^2$, jumps in the curvature give $1/n^3$, and so on. A function is called $C^k$ when it and its first $k$ derivatives are continuous, and **piecewise smooth** when it's smooth between finitely many breaks. A piecewise smooth waveform that is $C^{k-1}$ but whose $k$-th derivative jumps has harmonics falling as $1/n^{k+1}$. The sawtooth and square aren't even $C^0$, so theirs fall as $1/n$. The triangle is $C^0$ but not $C^1$, so its harmonics fall as $1/n^2$. A $C^\infty$ waveform's harmonics fall faster than any power of $n$.

## Read Odd Harmonics from Half-Wave Symmetry

The square and triangle have only odd harmonics, while the sawtooth has every one. Their shapes show which, without computing any coefficient.

**Half-wave symmetry means exactly odd harmonics.** A waveform is **half-wave symmetric** when its second half-cycle is its first upside down,

$$
x(\varphi+\tfrac12)=-x(\varphi).
$$

By the shift rule, the left side has coefficients $e^{i\pi n}c_n=(-1)^nc_n$, and the right side has $-c_n$. The coefficients determine the waveform, so the two sides are equal exactly when $(-1)^nc_n=-c_n$ for every $n$, which means $c_n=0$ for every even $n$. So a half-wave symmetric waveform has only odd harmonics, and a waveform with only odd harmonics is half-wave symmetric. Half a cycle of the fundamental is $n/2$ cycles of the $n$-th harmonic, so an even harmonic repeats unchanged and can't follow the waveform's flip, while an odd harmonic flips along with it.

The square, the triangle, and the sine are half-wave symmetric. The sawtooth isn't, because it keeps rising through both halves of the cycle. An odd clipper driven by a sine keeps the sine's symmetry, which is how the [amp doc](guitar-amp-simulation.md#appendix-why-an-odd-clipper-adds-only-odd-harmonics) shows that a symmetric drive adds only odd harmonics.

**Every waveform splits into an odd part and an octave-up part.** Write

$$
x(\varphi)=\underbrace{\frac{x(\varphi)-x(\varphi+\frac12)}{2}}_{\text{half-wave symmetric}}+\underbrace{\frac{x(\varphi)+x(\varphi+\frac12)}{2}}_{\text{repeats every half cycle}}.
$$

The first part is half-wave symmetric, so it holds the odd harmonics of $x$. The second repeats every half cycle, so it's a waveform an octave up, and its harmonics are the even harmonics of $x$. For the sawtooth, the second part is a sawtooth an octave up at half the height, which matches its even harmonics, since with harmonics falling as $1/n$, the $2m$-th is half as loud as the $m$-th.

**This is a different question from odd and even functions.** Whether $x(-\varphi)=x(\varphi)$ or $x(-\varphi)=-x(\varphi)$ decides whether the harmonics are cosines or sines, measured from $\varphi=0$, not which harmonics are present. The sawtooth $2\varphi-1$ is an odd function, since $x(-\varphi)=x(1-\varphi)=-x(\varphi)$, so its harmonics are all sines, and it still has every one. The amp's clipper is odd in another sense, as a function of the signal's value, and that oddness does matter, because it carries the input's half-wave symmetry through to its output.

## Use the Same Picture for Sampled Signals

A frame of $N$ samples is a vector in $\mathbb{C}^N$, with the inner product $\langle x,y\rangle=\sum_m x[m]\overline{y[m]}$. The sampled tones $e_k[m]=e^{2\pi ikm/N}$ for $k=0,\dots,N-1$ are perpendicular, each with squared length $N$, and there are $N$ of them, so they form a basis without any theorem about completeness. The discrete Fourier transform reads the coordinates, $X(k)=\langle x,e_k\rangle$, which the FFT computes quickly. Pythagoras holds for perpendicular axes, so the squared length is the sum of the squared coordinates, each divided by its axis's squared length $N$. This is **Parseval's theorem**:

$$
\sum_{m=0}^{N-1}|x[m]|^2=\frac{1}{N}\sum_{k=0}^{N-1}|X(k)|^2,
$$

which is what lets [onset detection](../bass-pitch/onset-detection.md) measure power in a frequency band by summing squared FFT magnitudes.

Only $N$ tones are distinct, because $e_{k+N}[m]=e_k[m]$ at every sample. A harmonic past the Nyquist frequency is therefore indistinguishable from a lower one once sampled, which is the aliasing that [oversampling](oversampling.md) works around.
