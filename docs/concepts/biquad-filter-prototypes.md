# Designing Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with the same sample loop. Their digital coefficients are commonly presented as a table, but the filter-specific insight comes earlier: why does each analog prototype have its particular numerator and denominator?

This document reconstructs those prototypes from their desired responses. It assumes the transfer-function and bilinear-transform background developed in [Modeling an audio effect as a transfer function](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html). That walkthrough derives the peaking filter in detail; this document concentrates on the other filter shapes.

## Shared Second-Order System

Measure frequency relative to the significant angular frequency $\Omega_0$ by writing $s=S/\Omega_0$. A sinusoid at that frequency is therefore represented by $s=j$.

The low-pass, high-pass, band-pass, and notch filters share the denominator

$$
D(s)=s^2+\frac{s}{Q}+1.
$$

Its roots are a stable pole pair for $Q>0$. The constant and quadratic terms set the normalized natural frequency to one, while $Q$ controls damping and therefore the width or resonance around that frequency. Choosing a numerator places zeros and fixes the gain at important frequencies without changing those poles.

For a polynomial ratio, the responses at zero and infinite frequency are especially easy to inspect. At $s=0$, only the constant terms survive. As $|s|\to\infty$, only the highest-order terms survive. Zeros at either endpoint appear by omitting the corresponding numerator term.

## Low-Pass

A second-order low-pass should have

$$
H(0)=1,
\qquad
H(\infty)=0.
$$

A constant numerator gives two more powers of $s$ in the denominator at high frequency, producing the desired second-order rolloff. Unity at zero fixes that constant to one:

$$
H_{\mathrm{LP}}(s)=\frac{1}{s^2+s/Q+1}.
$$

The numerator has two zeros at infinity. At the significant frequency,

$$
\left|H_{\mathrm{LP}}(j)\right|=Q.
$$

Thus $Q=1/\sqrt{2}$ gives the familiar $-3$ dB value at the corner, while larger $Q$ introduces a resonant rise near it.

## High-Pass

A second-order high-pass reverses the endpoint requirements:

$$
H(0)=0,
\qquad
H(\infty)=1.
$$

Rejecting low frequencies to second order requires a double zero at the origin, so the numerator contains $s^2$. Matching the leading denominator coefficient gives unity at high frequency:

$$
H_{\mathrm{HP}}(s)=\frac{s^2}{s^2+s/Q+1}.
$$

This is also the low-pass prototype with frequency inverted: replacing $s$ by $1/s$ in the low-pass response and simplifying produces the high-pass response.

## Band-Pass

A band-pass should vanish at both frequency extremes:

$$
H(0)=0,
\qquad
H(\infty)=0.
$$

A numerator $cs$ supplies one zero at the origin and one at infinity while preserving a second-order denominator:

$$
H_{\mathrm{BP}}(s)=\frac{cs}{s^2+s/Q+1}.
$$

The endpoint requirements do not determine $c$. Evaluating the center exposes the remaining choice:

$$
H_{\mathrm{BP}}(j)
=\frac{cj}{-1+j/Q+1}
=cQ.
$$

Two standard conventions follow:

$$
\begin{aligned}
c&=\frac{1}{Q}
&&\Longrightarrow&&
\left|H(j)\right|=1
&&\text{(constant 0 dB peak)},\\
c&=1
&&\Longrightarrow&&
\left|H(j)\right|=Q
&&\text{(constant skirt gain)}.
\end{aligned}
$$

The recorder uses the constant-skirt form:

$$
H_{\mathrm{BP}}(s)=\frac{s}{s^2+s/Q+1}.
$$

Consequently, changing $Q$ changes both bandwidth and center gain. This is a convention chosen after the band-pass shape is established, not a consequence of the endpoint constraints alone.

## Notch

A notch should preserve both frequency extremes but completely reject the significant frequency:

$$
H(0)=1,
\qquad
H(\infty)=1,
\qquad
H(j)=0.
$$

A real polynomial with a zero at $j$ must also have a zero at its conjugate $-j$. The numerator is therefore

$$
N(s)=(s-j)(s+j)=s^2+1.
$$

Its constant and leading coefficients already match the denominator, giving unity at both endpoints:

$$
H_{\mathrm{notch}}(s)=\frac{s^2+1}{s^2+s/Q+1}.
$$

The numerator fixes the rejected frequency. The denominator's pole pair determines how quickly the response recovers around it, so $Q$ controls the notch width.

## Peaking

The peaking filter also preserves both endpoints, but it changes the center by a finite amplitude ratio $M$. Let $A=\sqrt{M}$. Distributing $A$ reciprocally between the numerator and denominator's linear terms gives

$$
H_{\mathrm{peak}}(s)
=\frac{s^2+(A/Q)s+1}{s^2+s/(AQ)+1}.
$$

At $s=j$, the quadratic and constant terms cancel, leaving center gain $A^2=M$. Replacing $A$ by $1/A$ exchanges numerator and denominator, so matching boosts and cuts are exact inverses. The [peaking-EQ derivation](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html#analog-design) develops how the same reciprocal construction gives the intended halfway-gain bandwidth convention.

## Low Shelf

A low shelf should approach amplitude ratio $M$ at zero frequency and unity at infinite frequency. Again write $A=\sqrt{M}$. The endpoint conditions alone leave many possible transitions, so we also seek the same symmetry used for peaking: matching boosts and cuts should be reciprocal, and the significant frequency should sit halfway between the endpoint gains on a decibel scale.

Distribute the endpoint ratio symmetrically across an outer factor and the constant and leading coefficients. Leaving the two linear coefficients free gives

$$
H_{\mathrm{LS}}(s)
=A\frac{s^2+c_zs+A}{As^2+c_ps+1},
\qquad c_z,c_p>0.
$$

The endpoint gains are built into the constant and leading coefficients:

$$
H_{\mathrm{LS}}(0)=A^2=M,
\qquad
H_{\mathrm{LS}}(\infty)=1.
$$

At the significant frequency,

$$
H_{\mathrm{LS}}(j)
=A\frac{A-1+jc_z}{1-A+jc_p}.
$$

For its magnitude to be the geometric midpoint $A$, the ratio after the outer factor must have magnitude one. Its real parts already have equal magnitude and opposite signs, so positive coefficients require $c_z=c_p=c$. Therefore

$$
\left|H_{\mathrm{LS}}(j)\right|=A=\sqrt{M}.
$$

The shared linear coefficient is thus a consequence of the midpoint requirement rather than an assumed part of the prototype.

We also want replacing a boost by the matching cut to invert the response. Writing $c_A$ for the coefficient at gain parameter $A$, the condition

$$
H_{1/A}(s)=\frac{1}{H_A(s)}
$$

requires

$$
A c_{1/A}=c_A.
$$

The symmetric parameterization

$$
c_A=\frac{\sqrt{A}}{Q_s}
$$

satisfies that relation while leaving one gain-independent shape parameter $Q_s$.

### The Steepest Monotonic Shelf

The recorder fixes the RBJ shelf slope to $S=1$, meaning the steepest transition that remains monotonic. That value can be recovered directly from the prototype rather than accepted as another coefficient convention.

For a sinusoidal probe $s=j\nu$, let $x=\nu^2$. The squared magnitude is

$$
\left|H_{\mathrm{LS}}(j\nu)\right|^2
=A^2
\frac{x^2+(c^2-2A)x+A^2}
{A^2x^2+(c^2-2A)x+1}.
$$

Ignoring the positive squared denominator, its derivative with respect to $x$ has the sign of

$$
(1-A^2)
\left[
(c^2-2A)x^2+2(1+A^2)x+(c^2-2A)
\right].
$$

For a boost, $A>1$, so a response that decreases monotonically from $A^2$ to one requires the bracket to remain nonnegative for every $x\geq0$. This holds exactly when

$$
c^2\geq2A.
$$

Smaller values create overshoot. The steepest monotonic member lies at the boundary:

$$
c^2=2A,
\qquad
c=\sqrt{2A}.
$$

Comparing this with $c=\sqrt{A}/Q_s$ gives

$$
Q_s=\frac{1}{\sqrt{2}}.
$$

The resulting fixed-slope prototype is

$$
H_{\mathrm{LS}}(s)
=A\frac{s^2+\sqrt{2A}\,s+A}{As^2+\sqrt{2A}\,s+1}.
$$

The reciprocal construction gives the same monotonic result for cuts.

## High Shelf

A high shelf follows from reversing frequency in the low shelf. Substitute $1/s$ and multiply numerator and denominator by $s^2$:

$$
\begin{aligned}
H_{\mathrm{HS}}(s)
&=H_{\mathrm{LS}}(1/s)\\
&=A\frac{As^2+cs+1}{s^2+cs+A}.
\end{aligned}
$$

It consequently has the reversed endpoints

$$
H_{\mathrm{HS}}(0)=1,
\qquad
H_{\mathrm{HS}}(\infty)=A^2=M,
$$

while retaining midpoint amplitude $A$, reciprocal boost/cut behavior, and the same monotonicity condition. With fixed $S=1$, use $c=\sqrt{2A}$.

## From Prototype To Sample Coefficients

Once the prototype has been chosen, conversion to the recorder's sample recurrence is shared bookkeeping. For a general analog quadratic

$$
H(s)=\frac{n_2s^2+n_1s+n_0}{d_2s^2+d_1s+d_0},
$$

prewarp the significant digital frequency $\omega_0=2\pi f_0/F_s$ and substitute

$$
s\leftarrow K\frac{1-z^{-1}}{1+z^{-1}},
\qquad
K=\cot\left(\frac{\omega_0}{2}\right).
$$

Multiplying through by $(1+z^{-1})^2$, collecting powers of $z^{-1}$, and dividing by $a_0$ produces the five coefficients used by the Direct Form I loop. The trigonometric forms in `src/lib/dsp/biquad-eq.ts` are algebraic simplifications of this expansion.

The implementation follows the coefficient conventions in the [W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/). That reference supplies an authoritative final table; the prototype arguments above explain why those particular rational functions produce the requested filter shapes.
