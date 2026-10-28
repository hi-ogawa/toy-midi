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

## Filter by Convolving with a Kernel

A filter that convolves with a kernel $h$ outputs a weighted average of delayed copies of its input, with weight $h(s)$ on the copy delayed by $s$. The kernel lives on all time, like the sinc of [oversampling](oversampling.md) or PolyBLEP's triangle. Measure time $t$ in the same cycles as $\varphi$ and feed in one tone $e^{2\pi ift}$ at any frequency $f$. The same tone comes out, scaled:

$$
\int_{-\infty}^{\infty}h(s)e^{2\pi if(t-s)}ds=\underbrace{\int_{-\infty}^{\infty}h(s)e^{-2\pi ifs}ds}_{H(f)}\cdot e^{2\pi ift}.
$$

The factor $H(f)$ is the kernel's spectrum, and it's the filter's gain at frequency $f$. A periodic waveform has tones only at the harmonics $f=n$, so since $x=\sum c_ne_n$, the output is $\sum H(n)c_ne_n$, and convolving multiplies each coefficient by $H(n)$. A signal that isn't periodic has tones at every frequency, and each is scaled by $H(f)$ in the same way, which is how oversampling reads its low-pass off the sinc's spectrum.

**Multiplying waveforms convolves their coefficients.** The roles also swap. Multiplying by $e_k$ moves every coefficient up by $k$, and a waveform $y$ is a sum of such tones, so

$$
c_n[e_kx]=\int_0^1 x(\varphi)e^{-2\pi i(n-k)\varphi}d\varphi=c_{n-k},\qquad c_n[yx]=\sum_k y_kc_{n-k}.
$$

## Differentiate a Waveform

Differentiating one harmonic gives $e_n'=2\pi in\cdot e_n$, so a derivative should multiply each coefficient by $2\pi in$. Integrating by parts over one cycle confirms it on the coefficients,

$$
c_n[x']=\Big[x(\varphi)e^{-2\pi in\varphi}\Big]_0^1+2\pi in\int_0^1 x(\varphi)e^{-2\pi in\varphi}d\varphi=2\pi in\cdot c_n,
$$

where the boundary term vanishes because $x(1)=x(0)$. Read the other way, integrating divides the $n$-th coefficient by $2\pi in$, so the high harmonics fall faster.

## Read the Falloff from Jumps and Corners

The boundary term vanishes only if $x$ is continuous around the whole cycle. Keeping it when $x$ jumps shows where the high harmonics come from.

**Integrate by parts between the jumps.** Let $x$ be smooth except at the phases $\varphi_1,\dots,\varphi_m$ in each cycle, where it jumps by $J_k=x(\varphi_k^+)-x(\varphi_k^-)$. On one smooth piece from $a$ to $b$,

$$
\int_a^b x(\varphi)e^{-2\pi in\varphi}d\varphi=\Big[\frac{x(\varphi)e^{-2\pi in\varphi}}{-2\pi in}\Big]_a^b+\frac{1}{2\pi in}\int_a^b x'(\varphi)e^{-2\pi in\varphi}d\varphi.
$$

Summing over the pieces of a cycle, each break $\varphi_k$ is the end of one piece and the start of the next, so its two boundary terms combine into

$$
\frac{x(\varphi_k^-)-x(\varphi_k^+)}{-2\pi in}e^{-2\pi in\varphi_k}=\frac{J_k}{2\pi in}e^{-2\pi in\varphi_k}.
$$

Where $x$ is continuous the two terms cancel, and periodicity joins the last piece to the first. So

$$
c_n=\frac{1}{2\pi in}\sum_k J_k e^{-2\pi in\varphi_k}+\frac{1}{2\pi in}c_n[x'],
$$

where $x'$ is the slope of the smooth pieces. Each jump puts magnitude $|J_k|/(2\pi n)$ into every harmonic, which falls as $1/n$.

**The sawtooth is all jump.** The sawtooth $2\varphi-1$ has the constant slope 2, which has no harmonics, so with its one jump $J=-2$ at $\varphi=0$, $c_n=-2/(2\pi in)$. Every harmonic of the sawtooth comes from its jump.

**The lowest derivative that jumps sets the falloff.** The slope's coefficient $c_n[x']$ splits the same way at the corners of $x$, which gives $1/n^2$, then jumps in the curvature give $1/n^3$, and so on. A **piecewise smooth** waveform, smooth between finitely many breaks, that is $C^{k-1}$, continuous through its $(k-1)$-th derivative, but whose $k$-th derivative jumps has harmonics falling as $1/n^{k+1}$. The sawtooth and square jump, so theirs fall as $1/n$. The triangle is $C^0$ with corners, so its harmonics fall as $1/n^2$. A $C^\infty$ waveform's harmonics fall faster than any power of $n$.

## Read Odd Harmonics from Half-Wave Symmetry

The square and triangle have only odd harmonics, while the sawtooth has every one. Their shapes show which.

**Half-wave symmetry means exactly odd harmonics.** A waveform is **half-wave symmetric** when its second half-cycle is its first upside down, $x(\varphi+\tfrac12)=-x(\varphi)$. Split $c_n$ at the half cycle and move the second half onto the first by substituting $\varphi=\psi+\tfrac12$:

$$
c_n=\int_0^{1/2}x(\psi)e^{-2\pi in\psi}d\psi+\int_0^{1/2}x(\psi+\tfrac12)e^{-2\pi in\psi}e^{-i\pi n}d\psi.
$$

The symmetry turns $x(\psi+\tfrac12)$ into $-x(\psi)$, and $e^{-i\pi n}=(-1)^n$, so

$$
c_n=\big(1-(-1)^n\big)\int_0^{1/2}x(\psi)e^{-2\pi in\psi}d\psi,
$$

which is 0 for every even $n$ and twice the first half's integral for every odd $n$. Half a cycle of the fundamental is $n/2$ cycles of the $n$-th harmonic, so an even harmonic is the same in both halves and the waveform's flip cancels it, while an odd harmonic flips too and the halves add. The converse also holds, because each odd harmonic has $e_n(\varphi+\tfrac12)=(-1)^ne_n(\varphi)=-e_n(\varphi)$, so a sum of odd harmonics is half-wave symmetric.

The square, triangle, and sine are half-wave symmetric, and the sawtooth isn't, because it keeps rising through both halves. An odd clipper driven by a sine keeps the sine's symmetry, which is how the [amp doc](guitar-amp-simulation.md#appendix-why-an-odd-clipper-adds-only-odd-harmonics) shows that a symmetric drive adds only odd harmonics.

**Every waveform splits into an odd part and an octave-up part.**

$$
x(\varphi)=\underbrace{\frac{x(\varphi)-x(\varphi+\frac12)}{2}}_{\text{half-wave symmetric}}+\underbrace{\frac{x(\varphi)+x(\varphi+\frac12)}{2}}_{\text{repeats every half cycle}}.
$$

The first part is half-wave symmetric, so it keeps only the odd harmonics of $x$. The second repeats every half cycle, $g(\varphi+\tfrac12)=g(\varphi)$, so the same split gives $c_n[g]=\big(1+(-1)^n\big)\int_0^{1/2}g(\psi)e^{-2\pi in\psi}d\psi$, which keeps only the even harmonics, and it's a waveform an octave up. For the sawtooth on $[0,\tfrac12)$, it is

$$
\tfrac12\big((2\varphi-1)+(2(\varphi+\tfrac12)-1)\big)=\tfrac12\big(2(2\varphi)-1\big),
$$

the sawtooth at twice the rate and half the height. That matches the $1/n$ falloff, in which the $2m$-th harmonic is half as loud as the $m$-th.

**This is a different question from odd and even functions.** Whether $x(-\varphi)=\pm x(\varphi)$ decides whether the harmonics are cosines or sines, not which harmonics are present. The sawtooth is an odd function, since $x(-\varphi)=x(1-\varphi)=-x(\varphi)$, so its harmonics are all sines, and it still has every one. The amp's clipper is odd as a function of the signal's value, which is what carries the input's half-wave symmetry through to its output.
