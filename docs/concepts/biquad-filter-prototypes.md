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

## First Remove Damping

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

shows the corresponding free modes $e^{\pm j\Omega_0t}$. Their magnitudes do not decay, so $\Omega_0$ is the undamped natural angular frequency set by $d_0$.

## Restore Damping

Put the $d_1S$ term back with $d_1>0$ and evaluate the denominator at the frequency just found:

$$
D(j\Omega_0)=j d_1\Omega_0.
$$

The low-pass response there is finite:

$$
H(j\Omega_0)
=\frac{\Omega_0^2}{j d_1\Omega_0}
=-j\frac{\Omega_0}{d_1}.
$$

Its amplitude is set by damping relative to the natural-frequency scale. Write a relative complex rate $s$ so that

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

The center calculation above showed that the amplitude at $\Omega_0$ is the dimensionless ratio $\Omega_0/d_1$. It is conventional to call this ratio $Q$:

$$
Q=\frac{\Omega_0}{d_1},
\qquad
\frac{d_1}{\Omega_0}=\frac{1}{Q}.
$$

Substituting it into the normalized response gives the low-pass prototype:

$$
H_{\mathrm{LP}}(\Omega_0s)=\frac{1}{s^2+s/Q+1}.
$$

At $s=j$, meaning $S=j\Omega_0$, its amplitude is $Q$. Thus $Q=1/\sqrt{2}$ gives the familiar $-3$ dB value there. Increasing $Q$ reduces damping and eventually creates a resonant rise around the natural-frequency scale.

## Other Responses

TODO: derive each remaining prototype independently from its response goals before identifying any shared family:

- High-pass
- Band-pass, including the constant-peak and constant-skirt choices
- Notch
- Peaking
- Low shelf, including why fixed slope $S=1$ is the steepest monotonic choice
- High shelf

Once those constructions are stable, compare their common structure and perform the shared bilinear-transform expansion into the sample coefficients used by `src/lib/dsp/biquad-eq.ts`.
