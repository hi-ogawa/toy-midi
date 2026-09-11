# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](transfer-function-and-peaking-eq.md). We will work through one response at a time, inspect exactly what each requirement decides, and avoid assuming the final filter family in advance.

## Begin With A General Second-Order Response

A continuous second-order input/output system can be written, after scaling the leading denominator coefficient to one, as

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

We have not chosen a filter family or a special frequency. We still have five free coefficients and can ask which of them are fixed by the response we want.

## Low Pass

### Try To Preserve Low Frequencies

Suppose low-frequency tones should pass unchanged while high-frequency tones should be attenuated. At the two frequency extremes, this means

$$
H(0)=1,
\qquad
H(\infty)=0.
$$

What do these two conditions actually decide?

At zero frequency,

$$
H(0)=\frac{c_0}{d_0},
$$

so unity response fixes

$$
c_0=d_0.
$$

At high frequency, divide numerator and denominator by $S^2$:

$$
H(S)
=\frac{c_2+c_1/S+c_0/S^2}{1+d_1/S+d_0/S^2}
\longrightarrow c_2.
$$

Rejection at infinite frequency therefore fixes

$$
c_2=0.
$$

The endpoint requirements alone leave $c_1$ free:

$$
H(S)=\frac{c_1S+d_0}{S^2+d_1S+d_0}.
$$

This already approaches zero at high frequency, but those endpoint values alone do not establish the familiar all-pole low-pass shape.

### Ask How Fast The Response Should Fall

The remaining numerator term changes the asymptotic attenuation. If $c_1\ne0$, then

$$
H(S)\sim\frac{c_1S}{S^2}=\frac{c_1}{S}
\qquad (|S|\to\infty).
$$

Its magnitude falls as $1/|S|$, which is first-order attenuation. If we want to use the full second-order attenuation available from the quadratic denominator, the response should instead behave as $1/S^2$. That additional requirement fixes

$$
c_1=0.
$$

Only after adding the rolloff requirement have we reached

$$
H(S)=\frac{d_0}{S^2+d_1S+d_0}.
$$

The constant numerator was not implied by the endpoint values alone. It follows from the endpoint values together with the decision to require second-order attenuation.

### Inspect $d_0$ By Itself

The denominator still contains $d_0$ and $d_1$. To see their roles one at a time, take $d_0>0$ and first try the special case $d_1=0$:

$$
D_0(S)=S^2+d_0.
$$

For a sinusoidal probe $S=j\Omega$,

$$
D_0(j\Omega)=d_0-\Omega^2.
$$

It vanishes at the positive angular frequency

$$
\Omega_0=\sqrt{d_0}.
$$

The factorization

$$
D_0(S)=(S-j\Omega_0)(S+j\Omega_0)
$$

shows the corresponding free modes $e^{\pm j\Omega_0t}$. Their magnitudes do not decay, so $d_0$ sets the natural angular frequency $\Omega_0$ in this simpler case.

### Measure Frequency Relative To $\Omega_0$

Return to the full response and write a relative complex rate $s$ so that

$$
S=\Omega_0s.
$$

Substitute this argument into the same response, then use $d_0=\Omega_0^2$ and divide numerator and denominator by $\Omega_0^2$:

$$
\begin{aligned}
H(\Omega_0s)
&=\frac{d_0}{(\Omega_0s)^2+d_1\Omega_0s+d_0}\\
&=\frac{\Omega_0^2}{\Omega_0^2s^2+d_1\Omega_0s+\Omega_0^2}\\
&=\frac{1}{s^2+(d_1/\Omega_0)s+1}.
\end{aligned}
$$

### Name The Remaining Freedom

At the natural-frequency scale, $s=j$:

$$
H(j\Omega_0)
=\frac{1}{j(d_1/\Omega_0)}
=-j\frac{\Omega_0}{d_1}.
$$

Its amplitude is the dimensionless ratio $\Omega_0/d_1$. It is conventional to call this ratio $Q$:

$$
Q=\frac{\Omega_0}{d_1},
\qquad
\frac{d_1}{\Omega_0}=\frac{1}{Q}.
$$

Substituting it into the normalized response gives the low-pass prototype:

$$
H(\Omega_0s)=\frac{1}{s^2+s/Q+1}.
$$

Thus $Q=1/\sqrt{2}$ gives the familiar $-3$ dB amplitude at $S=j\Omega_0$. Larger $Q$ gives a larger amplitude at that frequency.

### Expand The Low Pass Into Digital Coefficients

The [peaking-EQ derivation](transfer-function-and-peaking-eq.md#9-turn-the-continuous-model-into-delayed-samples) already develops the bilinear transform and center-frequency prewarping. Reuse its normalized substitution for the requested digital frequency $\omega_0=2\pi f_0/F_s$:

$$
s\leftarrow K\frac{1-z^{-1}}{1+z^{-1}},
\qquad
K=\cot\frac{\omega_0}{2}.
$$

This maps $z=e^{j\omega_0}$ to $s=j$. Define the digital response by applying that substitution to the analog response:

$$
H_d(z)=H\bigl(\Omega_0s(z)\bigr).
$$

The companion's [coefficient expansion](transfer-function-and-peaking-eq.md#10-expand-the-mapping-until-the-runtime-coefficients-appear) abbreviates the delay as $d=z^{-1}$ and expands the general quadratic

$$
s^2+cs+1.
$$

After applying the bilinear substitution and clearing $(1+d)^2$, call its polynomial

$$
P_c(d)=K^2(1-d)^2+cK(1-d)(1+d)+(1+d)^2.
$$

The reusable result established there is

$$
\frac{P_c(d)}{K^2+1}
=\left(1+\frac{c\sin\omega_0}{2}\right)
-2\cos\omega_0d
+\left(1-\frac{c\sin\omega_0}{2}\right)d^2.
$$

The low-pass denominator is this polynomial with $c=1/Q$. Define

$$
\alpha=\frac{\sin\omega_0}{2Q}.
$$

Its scaled denominator is therefore

$$
\frac{P_{1/Q}(d)}{K^2+1}
=(1+\alpha)-2\cos\omega_0d+(1-\alpha)d^2.
$$

The analog numerator is the constant one. Clearing the same $(1+d)^2$ denominator and applying the same scale gives

$$
\frac{(1+d)^2}{K^2+1}
=\frac{1-\cos\omega_0}{2}(1+2d+d^2).
$$

Substitute $d=z^{-1}$ to obtain the unnormalized digital response:

$$
H_d(z)=
\frac{\dfrac{1-\cos\omega_0}{2}
+(1-\cos\omega_0)z^{-1}
+\dfrac{1-\cos\omega_0}{2}z^{-2}}
{(1+\alpha)-2\cos\omega_0z^{-1}+(1-\alpha)z^{-2}}.
$$

Finally divide every coefficient by $a_0=1+\alpha$ so the denominator's leading coefficient is one:

$$
\begin{aligned}
b_0&=\frac{(1-\cos\omega_0)/2}{1+\alpha},\\
b_1&=\frac{1-\cos\omega_0}{1+\alpha},\\
b_2&=\frac{(1-\cos\omega_0)/2}{1+\alpha},\\
a_1&=\frac{-2\cos\omega_0}{1+\alpha},\\
a_2&=\frac{1-\alpha}{1+\alpha}.
\end{aligned}
$$

## Low Shelf

### Ask For Two Nonzero Plateaus

A low shelf does not reject high frequencies. Instead, it asks for one constant response at each end:

$$
H(0)=M,
\qquad
H(\infty)=1,
\qquad
M>0.
$$

Here $M>1$ boosts low frequencies and $0<M<1$ cuts them. Write

$$
A=\sqrt{M}.
$$

As before, use the relative rate $s=S/\Omega_0$. One simple reciprocal arrangement of two quadratics that satisfies both endpoint values is

$$
H(\Omega_0s)
=A\frac{s^2+c_n s+A}{As^2+c_d s+1}.
$$

Indeed, its zero-frequency response is $A^2=M$, while the ratio of its leading coefficients at infinite frequency is one. The numerator and denominator place their constant and quadratic terms in opposite orders, so their frequency scales lie on opposite sides of $s=j$.

### Put The Shelf Center Halfway Between The Plateaus

Halfway between two amplitude ratios is most naturally measured geometrically. The desired amplitude at $s=j$ is therefore

$$
\sqrt{M}=A.
$$

At that frequency,

$$
H(j\Omega_0)
=A\frac{(A-1)+jc_n}{(1-A)+jc_d}.
$$

For positive $c_n$ and $c_d$, its amplitude equals $A$ exactly when

$$
(A-1)^2+c_n^2=(A-1)^2+c_d^2,
$$

which fixes

$$
c_n=c_d=c.
$$

The endpoint and midpoint requirements have now reduced the family to

$$
H(\Omega_0s)
=A\frac{s^2+cs+A}{As^2+cs+1}.
$$

### Find The Steepest Monotonic Shelf

The remaining $c$ controls the shape of the transition. Probe the response at $s=j\sqrt{x}$ and remove the constant factor $A^2$ from its squared amplitude:

$$
R(x)=\frac{|H(j\Omega_0\sqrt{x})|^2}{A^2}
=\frac{(A-x)^2+c^2x}{(1-Ax)^2+c^2x},
\qquad x\ge0.
$$

Differentiating gives

$$
R'(x)=
\frac{(1-A^2)\left[(c^2-2A)(x^2+1)+2(1+A^2)x\right]}
{\left[(1-Ax)^2+c^2x\right]^2}.
$$

For a boost, $1-A^2<0$ and the response should decrease. For a cut, $1-A^2>0$ and the response should increase. In both cases, the bracketed expression must be nonnegative for every $x\ge0$. At $x=0$ this requires

$$
c^2\ge2A,
$$

and that condition is also sufficient because every term in the bracket is then nonnegative. At the midpoint,

$$
|R'(1)|=\frac{2|1-A^2|}{(A-1)^2+c^2},
$$

so increasing $c$ makes the transition gentler. The steepest choice that remains monotonic is the boundary

$$
c=\sqrt{2A}.
$$

This boundary is the shelf-slope choice conventionally called $S=1$. It gives the analog low-shelf prototype

$$
H(\Omega_0s)
=A\frac{s^2+\sqrt{2A}s+A}{As^2+\sqrt{2A}s+1}.
$$

### Expand The Low Shelf Into Digital Coefficients

Reuse the same substitution $s\leftarrow K(1-d)/(1+d)$. The low-pass derivation needed the special quadratic $s^2+cs+1$; the shelf needs the slightly more general form

$$
us^2+cs+v.
$$

After clearing $(1+d)^2$, its polynomial is

$$
P_{u,c,v}(d)
=uK^2(1-d)^2+cK(1-d)(1+d)+v(1+d)^2.
$$

Collecting powers of $d$ and multiplying by the convenient common scale $2/(K^2+1)$ gives

$$
\begin{aligned}
\frac{2P_{u,c,v}(d)}{K^2+1}
={}&\left[(u+v)+(u-v)\cos\omega_0+c\sin\omega_0\right]\\
&+2\left[(v-u)-(u+v)\cos\omega_0\right]d\\
&+\left[(u+v)+(u-v)\cos\omega_0-c\sin\omega_0\right]d^2.
\end{aligned}
$$

For the numerator, $(u,c,v)=(1,\sqrt{2A},A)$ and the entire polynomial has the additional factor $A$. For the denominator, $(u,c,v)=(A,\sqrt{2A},1)$. Define

$$
\alpha_s=\frac{\sin\omega_0}{\sqrt{2}},
\qquad
\sqrt{2A}\sin\omega_0=2\sqrt{A}\alpha_s.
$$

Substitution into the collected polynomial gives the unnormalized coefficients

$$
\begin{aligned}
b_0&=A\left[(A+1)-(A-1)\cos\omega_0+2\sqrt{A}\alpha_s\right],\\
b_1&=2A\left[(A-1)-(A+1)\cos\omega_0\right],\\
b_2&=A\left[(A+1)-(A-1)\cos\omega_0-2\sqrt{A}\alpha_s\right],\\
a_0&=(A+1)+(A-1)\cos\omega_0+2\sqrt{A}\alpha_s,\\
a_1&=-2\left[(A-1)+(A+1)\cos\omega_0\right],\\
a_2&=(A+1)+(A-1)\cos\omega_0-2\sqrt{A}\alpha_s.
\end{aligned}
$$

Finally, divide $b_0$, $b_1$, $b_2$, $a_1$, and $a_2$ by $a_0$ so the denominator's leading coefficient is one.

## Other Responses

TODO: derive each remaining prototype independently from its response goals before identifying any shared family:

- High-pass
- Band-pass, including the constant-peak and constant-skirt choices
- Notch
- Peaking
- High shelf

Once those constructions are stable, compare their common structure and perform the shared bilinear-transform expansion into the sample coefficients used by `src/lib/dsp/biquad-eq.ts`.
