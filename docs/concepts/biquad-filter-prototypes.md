# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html). We will work through one response at a time, inspect exactly what each requirement decides, and avoid assuming the final filter family in advance.

## Begin With A General Second-Order Response

A continuous second-order input/output system can be written, after scaling the leading denominator coefficient to one, as

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

We have not chosen a filter family or a special frequency. We still have five free coefficients and can ask which of them are fixed by the response we want.

## Try To Preserve Low Frequencies

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

## Ask How Fast The Response Should Fall

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

## Inspect $d_0$ By Itself

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

## Measure Frequency Relative To $\Omega_0$

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

## Name The Remaining Freedom

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

## Map The Analog Frequency To Sample Delays

Let $T=1/F_s$ be the sample interval and let the requested digital frequency be $\omega_0=2\pi f_0/F_s$ radians per sample. The bilinear transform substitutes

$$
S\leftarrow\frac{2}{T}\frac{1-z^{-1}}{1+z^{-1}}.
$$

For a digital sinusoid $z=e^{j\omega}$,

$$
\frac{1-e^{-j\omega}}{1+e^{-j\omega}}
=j\tan\frac{\omega}{2}.
$$

The digital frequency $\omega_0$ should reach the analog prototype at $S=j\Omega_0$. This requires the prewarped analog frequency

$$
\Omega_0=\frac{2}{T}\tan\frac{\omega_0}{2}.
$$

Since $s=S/\Omega_0$, the normalized substitution becomes

$$
s\leftarrow K\frac{1-z^{-1}}{1+z^{-1}},
\qquad
K=\cot\frac{\omega_0}{2}.
$$

At $z=e^{j\omega_0}$ this gives $s=j$, so the analog prototype's natural-frequency point lands at the requested digital frequency.

## Expand The Digital Response

Define the digital response by applying that substitution to the analog response:

$$
H_d(z)=H\bigl(\Omega_0s(z)\bigr).
$$

Write $r=z^{-1}$ to keep the expansion compact. Substituting into the low-pass prototype gives

$$
H_d(z)
=\frac{1}
{K^2\left(\dfrac{1-r}{1+r}\right)^2
+\dfrac{K}{Q}\left(\dfrac{1-r}{1+r}\right)+1}.
$$

Multiply numerator and denominator by $(1+r)^2$:

$$
H_d(z)
=\frac{(1+r)^2}
{K^2(1-r)^2+(K/Q)(1-r)(1+r)+(1+r)^2}.
$$

Expanding and collecting powers of $r$ produces

$$
H_d(z)=
\frac{1+2r+r^2}
{(K^2+K/Q+1)+2(1-K^2)r+(K^2-K/Q+1)r^2}.
$$

This already has the biquad form. Its coefficients may all be multiplied by the same nonzero factor without changing the response. Choose

$$
C=\frac{1-\cos\omega_0}{2}.
$$

Using $K=\cot(\omega_0/2)$ and the half-angle identities gives

$$
\begin{aligned}
C(K^2+1)&=1,\\
C\frac{K}{Q}&=\frac{\sin\omega_0}{2Q}=\alpha,\\
2C(1-K^2)&=-2\cos\omega_0.
\end{aligned}
$$

After multiplying the collected coefficients by $C$, the unnormalized digital response is

$$
H_d(z)=
\frac{\dfrac{1-\cos\omega_0}{2}
+(1-\cos\omega_0)z^{-1}
+\dfrac{1-\cos\omega_0}{2}z^{-2}}
{(1+\alpha)-2\cos\omega_0z^{-1}+(1-\alpha)z^{-2}},
\qquad
\alpha=\frac{\sin\omega_0}{2Q}.
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

These are the low-pass coefficients used by `calculateBiquadEqCoefficients`. They enter the existing Direct Form I recurrence as

$$
y[n]=b_0x[n]+b_1x[n-1]+b_2x[n-2]-a_1y[n-1]-a_2y[n-2].
$$

## Other Responses

TODO: derive each remaining prototype independently from its response goals before identifying any shared family:

- High-pass
- Band-pass, including the constant-peak and constant-skirt choices
- Notch
- Peaking
- Low shelf, including why fixed slope $S=1$ is the steepest monotonic choice
- High shelf

Once those constructions are stable, compare their common structure and perform the shared bilinear-transform expansion into the sample coefficients used by `src/lib/dsp/biquad-eq.ts`.
