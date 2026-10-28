# Fourier Series

A periodic waveform is a sum of harmonics, which are sinusoids at whole multiples of its fundamental frequency. The facts other docs use all come from one picture, in which waveforms are vectors, the harmonics are perpendicular axes, and an inner product reads off each harmonic's amount.

Measure time in cycles, so a waveform $x(\varphi)$ has period 1 in its phase $\varphi$, and the $n$-th harmonic of a waveform with period $T$ seconds is at $n/T$ Hz.

## Treat a Waveform as a Vector

The square-integrable waveforms, those with $\int_0^1|x|^2d\varphi$ finite, form the space $L^2$. Its inner product is the dot product with the sum over entries turned into an integral over phase:

$$
\langle x,y\rangle=\int_0^1 x(\varphi)\overline{y(\varphi)}d\varphi,
$$

so $\langle x,x\rangle$ is the mean square of $x$ over a cycle.

## Read Each Harmonic with an Inner Product

Write the $n$-th harmonic as the complex tone $e_n(\varphi)=e^{2\pi in\varphi}$, for every integer $n$, including negative ones. Two different harmonics are perpendicular, and each has mean square 1:

$$
\langle e_n,e_m\rangle=\int_0^1 e^{2\pi i(n-m)\varphi}d\varphi=
\begin{cases}1 & n=m,\\ 0 & n\neq m,\end{cases}
$$

because for $n\neq m$ the integrand turns a whole number of times around the unit circle. The harmonics are also **complete**, meaning no nonzero waveform in $L^2$ is perpendicular to all of them, which is a theorem rather than a calculation. So they form an orthonormal basis, and each coefficient is a projection, like reading a coordinate in 3D with a dot product:

$$
x=\sum_{n=-\infty}^{\infty}c_n e_n,\qquad c_n=\langle x,e_n\rangle=\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi.
$$

Each term of the sum is one harmonic,

$$
c_ne_n(\varphi)=|c_n|e^{i(2\pi n\varphi+\arg c_n)},
$$

a tone of size $|c_n|$ starting at phase $\arg c_n$, so $c_n$ is the $n$-th harmonic's complex amplitude.

**A real waveform pairs each harmonic with its negative.** For real $x$, the coefficient formula at $-n$ and at $0$ gives

$$
c_{-n}=\int_0^1 x(\varphi)e^{2\pi in\varphi}d\varphi=\overline{c_n},\qquad c_0=\int_0^1 x(\varphi)d\varphi.
$$

So $c_0$ is the waveform's average, its DC offset, and each pair adds up to one real sinusoid of amplitude $2|c_n|$:

$$
c_n e^{2\pi in\varphi}+\overline{c_n}e^{-2\pi in\varphi}=2\text{Re}\big(c_n e^{2\pi in\varphi}\big)=2|c_n|\cos(2\pi n\varphi+\arg c_n).
$$

## Shift, Filter, and Differentiate One Coefficient at a Time

Each of these sends a harmonic to itself times a factor that depends only on $n$, so it multiplies each coefficient by that factor.

**A shift rotates each coefficient.** Substituting into the coefficient formula, $x(\varphi-s)$, which is $x$ delayed by $s$, has coefficients $e^{-2\pi ins}c_n$. The same delay turns the $n$-th harmonic's phase $n$ times as far as the fundamental's.

**Convolution multiplies each coefficient by the kernel's.** Convolving with a kernel $h$ of period 1 averages delayed copies of $x$ with weights $h(s)$, so it averages their rotations:

$$
(h*x)(\varphi)=\int_0^1 h(s)x(\varphi-s)ds\quad\Longrightarrow\quad c_n[h*x]=\int_0^1 h(s)e^{-2\pi ins}ds\cdot c_n=h_n c_n.
$$

The kernel's own coefficients $h_n$ are the filter's gain at each harmonic, and a shift is the kernel with all its weight at one delay. For a signal that isn't periodic, the whole numbers $n$ become every frequency $f$ and $h_n$ becomes $h$'s spectrum, which is how [oversampling](oversampling.md) reads its low-pass off the sinc.

**Multiplication convolves the coefficients.** The roles swap. Multiplying by $e_k$ moves every coefficient up by $k$, and a waveform $y$ is a sum of such tones, so

$$
c_n[e_kx]=\int_0^1 x(\varphi)e^{-2\pi i(n-k)\varphi}d\varphi=c_{n-k},\qquad c_n[yx]=\sum_k y_kc_{n-k}.
$$

**A derivative multiplies each coefficient by $2\pi in$.** Integrating by parts over one cycle,

$$
c_n[x']=\Big[x(\varphi)e^{-2\pi in\varphi}\Big]_0^1+2\pi in\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi=2\pi in\cdot c_n,
$$

where the boundary term vanishes because $x(1)=x(0)$. Read the other way, integrating divides the $n$-th coefficient by $2\pi in$, so the high harmonics fall faster.

## Read the Falloff from Jumps and Corners

The boundary term vanishes only if $x$ is continuous around the whole cycle. Keeping it when $x$ jumps shows where the high harmonics come from.

**Integrate by parts between the jumps.** Let $x$ be smooth except at the phases $\varphi_k$, where it jumps by $J_k=x(\varphi_k^+)-x(\varphi_k^-)$. Integrating by parts on each smooth piece, the boundary terms cancel wherever $x$ is continuous and leave $J_k$ at each jump:

$$
c_n=\frac{1}{2\pi in}\sum_k J_k e^{-2\pi in\varphi_k}+\frac{1}{2\pi in}c_n[x'],
$$

where $x'$ is the slope of the smooth pieces. Each jump puts magnitude $|J_k|/(2\pi n)$ into every harmonic, which falls as $1/n$.

**The sawtooth is all jump.** The sawtooth $2\varphi-1$ has the constant slope 2, which has no harmonics, so with its one jump $J=-2$ at $\varphi=0$, $c_n=-2/(2\pi in)$. Every harmonic of the sawtooth comes from its jump.

**The lowest derivative that jumps sets the falloff.** The slope's coefficient $c_n[x']$ splits the same way at the corners of $x$, which gives $1/n^2$, then jumps in the curvature give $1/n^3$, and so on. A **piecewise smooth** waveform, smooth between finitely many breaks, that is $C^{k-1}$, continuous through its $(k-1)$-th derivative, but whose $k$-th derivative jumps has harmonics falling as $1/n^{k+1}$. The sawtooth and square jump, so theirs fall as $1/n$. The triangle is $C^0$ with corners, so its harmonics fall as $1/n^2$. A $C^\infty$ waveform's harmonics fall faster than any power of $n$.

## Read Odd Harmonics from Half-Wave Symmetry

The square and triangle have only odd harmonics, while the sawtooth has every one. Their shapes show which.

**Half-wave symmetry means exactly odd harmonics.** A waveform is **half-wave symmetric** when its second half-cycle is its first upside down. By the shift rule,

$$
x(\varphi+\tfrac12)=-x(\varphi)\quad\Longleftrightarrow\quad(-1)^nc_n=-c_n\text{ for every }n\quad\Longleftrightarrow\quad c_n=0\text{ for every even }n.
$$

Half a cycle of the fundamental is $n/2$ cycles of the $n$-th harmonic, so an odd harmonic flips along with the waveform, while an even one repeats unchanged and can't. The square, triangle, and sine are half-wave symmetric, and the sawtooth isn't, because it keeps rising through both halves. An odd clipper driven by a sine keeps the sine's symmetry, which is how the [amp doc](guitar-amp-simulation.md#appendix-why-an-odd-clipper-adds-only-odd-harmonics) shows that a symmetric drive adds only odd harmonics.

**Every waveform splits into an odd part and an octave-up part.**

$$
x(\varphi)=\underbrace{\frac{x(\varphi)-x(\varphi+\frac12)}{2}}_{\text{half-wave symmetric}}+\underbrace{\frac{x(\varphi)+x(\varphi+\frac12)}{2}}_{\text{repeats every half cycle}}.
$$

Shifting the first part by half a cycle negates it, and shifting the second leaves it unchanged, so by the shift rule the first keeps only the odd harmonics of $x$ and the second only the even ones. The second repeats every half cycle, so it's a waveform an octave up. For the sawtooth on $[0,\tfrac12)$, it is

$$
\tfrac12\big((2\varphi-1)+(2(\varphi+\tfrac12)-1)\big)=\tfrac12\big(2(2\varphi)-1\big),
$$

the sawtooth at twice the rate and half the height. That matches the $1/n$ falloff, in which the $2m$-th harmonic is half as loud as the $m$-th.

**This is a different question from odd and even functions.** Whether $x(-\varphi)=\pm x(\varphi)$ decides whether the harmonics are cosines or sines, not which harmonics are present. The sawtooth is an odd function, since $x(-\varphi)=x(1-\varphi)=-x(\varphi)$, so its harmonics are all sines, and it still has every one. The amp's clipper is odd as a function of the signal's value, which is what carries the input's half-wave symmetry through to its output.

## Use the Same Picture for Sampled Signals

A frame of $N$ samples is a vector in $\mathbb{C}^N$, and the sampled tones $e_k[m]=e^{2\pi ikm/N}$ for $k=0,\dots,N-1$ are $N$ perpendicular vectors, each with $\langle e_k,e_k\rangle=N$, so they form a basis without any completeness theorem. The discrete Fourier transform reads the coordinates, which the FFT computes quickly, and the frame is their sum:

$$
X(k)=\langle x,e_k\rangle=\sum_{m=0}^{N-1}x[m]e^{-2\pi ikm/N},\qquad x=\frac{1}{N}\sum_{k=0}^{N-1}X(k)e_k.
$$

Expanding $\langle x,x\rangle$ in this basis, the cross terms vanish, which is **Parseval's theorem**:

$$
\sum_{m=0}^{N-1}|x[m]|^2=\frac{1}{N^2}\sum_{k,j}X(k)\overline{X(j)}\langle e_k,e_j\rangle=\frac{1}{N}\sum_{k=0}^{N-1}|X(k)|^2.
$$

That is what lets [onset detection](../bass-pitch/onset-detection.md) measure power in a frequency band by summing squared FFT magnitudes.

Only $N$ tones are distinct, because $e_{k+N}[m]=e_k[m]$ at every sample. A harmonic past the Nyquist frequency is therefore indistinguishable from a lower one once sampled, which is the aliasing that [oversampling](oversampling.md) works around.
