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
