# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html). We will try simple response requirements, inspect what they force, and only afterward compare the resulting family with the coefficient convention used by the implementation.

## Begin With General Second-Order Motion

A continuous second-order input/output system has a transfer function whose denominator can be written, after scaling its leading coefficient to one, as

$$
D(S)=S^2+d_1S+d_0.
$$

For a stable real second-order system, $d_0>0$ sets a natural angular-frequency scale and $d_1>0$ supplies damping. Depending on their ratio, its free motion may decay with or without oscillating. Let

$$
\Omega_0=\sqrt{d_0},
\qquad
s=\frac{S}{\Omega_0},
\qquad
\delta=\frac{d_1}{\Omega_0}.
$$

Dividing the denominator by $\Omega_0^2$ leaves the dimensionless form

$$
D(s)=s^2+\delta s+1.
$$

A sinusoid at the natural-frequency scale is now represented by $s=j$. We have not chosen a filter family yet. We only have the quadratic motion made available by a second-order system, and freedom to ask what different numerators make it do.

At $s=0$, only a polynomial's constant term survives. As $|s|\to\infty$, only its highest-order term survives. Those two observations give us a place to start exploring.

## Try To Preserve Slow Motion

Suppose the output should follow a constant or slowly changing input, but reject fast motion with the full attenuation available from a second-order denominator. At the two frequency extremes we want

$$
H(0)=1,
\qquad
H(\infty)=0.
$$

A constant numerator gives two more powers of $s$ in the denominator at high frequency, producing second-order attenuation. Unity at zero fixes that constant to one:

$$
H(s)=\frac{1}{s^2+\delta s+1}.
$$

This response has emerged as a low-pass filter. What does the still-free damping coefficient $\delta$ do? At the natural-frequency scale,

$$
H(j)=\frac{1}{-1+j\delta+1}=\frac{1}{j\delta},
\qquad
|H(j)|=\frac{1}{\delta}.
$$

It is conventional to name this reciprocal damping parameter $Q$:

$$
Q=\frac{1}{\delta}.
$$

Our first prototype is therefore

$$
H_{\mathrm{LP}}(s)=\frac{1}{s^2+s/Q+1}.
$$

The value $Q=1/\sqrt{2}$ gives the familiar $-3$ dB response at $s=j$. Increasing $Q$ reduces damping and eventually produces a resonant rise around that frequency.

## Reverse Which End Survives

What if we instead reject slow motion and preserve fast motion?

$$
H(0)=0,
\qquad
H(\infty)=1.
$$

Rejecting low frequencies to second order requires a double zero at the origin, so the numerator must contain $s^2$. Matching the leading denominator coefficient gives unity at high frequency:

$$
H_{\mathrm{HP}}(s)=\frac{s^2}{s^2+s/Q+1}.
$$

We have found the high-pass response. Its relation to the previous result can be seen by replacing $s$ with $1/s$ in the low-pass prototype and simplifying. Frequency inversion exchanges zero and infinite frequency, so it exchanges low-pass and high-pass.

## Suppress Both Ends

Can the same second-order motion preserve a region in the middle while suppressing both extremes? Now we ask for

$$
H(0)=0,
\qquad
H(\infty)=0.
$$

The lowest-degree numerator that vanishes at zero but still grows more slowly than the quadratic denominator is $cs$:

$$
H_{\mathrm{BP}}(s)=\frac{cs}{s^2+s/Q+1}.
$$

This is a band-pass shape, but its endpoint behavior does not determine $c$. Evaluating the natural-frequency scale exposes the remaining choice:

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

The recorder chooses the constant-skirt form:

$$
H_{\mathrm{BP}}(s)=\frac{s}{s^2+s/Q+1}.
$$

The meaning of $Q$ becomes more concrete here. For a probe $s=j\nu$, this form has

$$
\left|H_{\mathrm{BP}}(j\nu)\right|^2
=\frac{\nu^2}{(1-\nu^2)^2+\nu^2/Q^2}.
$$

Its center power is $Q^2$. Setting the power to half that value gives

$$
\left|\nu-\frac{1}{\nu}\right|=\frac{1}{Q}.
$$

The positive crossing below the center and the one above it differ by $1/Q$. Thus the same parameter introduced as reciprocal damping is also center frequency divided by the half-power bandwidth. In the chosen constant-skirt convention, changing it necessarily changes both bandwidth and center gain.

## Remove Only The Center

The opposite experiment is to preserve both extremes but completely remove the natural-frequency scale:

$$
H(0)=1,
\qquad
H(\infty)=1,
\qquad
H(j)=0.
$$

A zero at $s=j$ gives the desired rejection. Because the sample computation needs real coefficients, a complex zero must be accompanied by its conjugate at $s=-j$. This determines the numerator:

$$
N(s)=(s-j)(s+j)=s^2+1.
$$

Its constant and leading coefficients happen to match the denominator, so the same construction already gives unity at both endpoints:

$$
H_{\mathrm{notch}}(s)=\frac{s^2+1}{s^2+s/Q+1}.
$$

We have discovered the notch response. Its zeros fix the rejected frequency, while the denominator's poles determine how quickly the response recovers around it. Increasing $Q$ reduces their damping and narrows the notch.

## A Pattern Has Appeared

Only after constructing these responses can we see their common structure. Low-pass, high-pass, band-pass, and notch all use the normalized quadratic motion

$$
s^2+\frac{s}{Q}+1
$$

and differ in where their numerator places zeros:

| Response  | Numerator | Zeros                           |
| --------- | --------- | ------------------------------- |
| Low-pass  | $1$       | Two at infinity                 |
| High-pass | $s^2$     | Two at zero                     |
| Band-pass | $s$       | One at zero and one at infinity |
| Notch     | $s^2+1$   | One at each of $j$ and $-j$     |

The shared denominator was not the starting assumption. It is the reusable second-order motion that remained after each numerator was chosen from a different response goal.

## Change The Center Instead Of Removing It

The notch suggests another question: instead of forcing the center to zero, can we adjust it by a finite amount while preserving both endpoints? Let the desired center amplitude ratio be $M$ and write $A=\sqrt{M}$. Distributing $A$ reciprocally between the numerator and denominator's linear terms gives

$$
H_{\mathrm{peak}}(s)
=\frac{s^2+(A/Q)s+1}{s^2+s/(AQ)+1}.
$$

At $s=j$, the quadratic and constant terms cancel, leaving center gain $A^2=M$. Replacing $A$ by $1/A$ exchanges numerator and denominator, so matching boosts and cuts are exact inverses. The [peaking-EQ derivation](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html#analog-design) develops this construction from the endpoint, center, reciprocal-gain, and halfway-bandwidth requirements rather than taking the prototype as given.

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

The implementation follows the coefficient conventions listed in the [W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/). Expanding the independently constructed prototypes through the bilinear substitution provides the mathematical check that those coefficients implement the intended responses.
