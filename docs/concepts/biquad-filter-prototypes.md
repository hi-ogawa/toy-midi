# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html). We will work through one response at a time, inspect exactly what each requirement decides, and avoid assuming the final filter family in advance.

## Begin With A General Second-Order Response

A continuous second-order input/output system can be written, after scaling the leading denominator coefficient to one, as

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

For a stable real second-order system, $d_0>0$ sets a natural angular-frequency scale and $d_1>0$ supplies damping. Depending on their ratio, its free motion may decay with or without oscillating. Let

$$
\Omega_0=\sqrt{d_0},
\qquad
s=\frac{S}{\Omega_0},
\qquad
\delta=\frac{d_1}{\Omega_0}.
$$

Substitute $S=\Omega_0s$ and divide numerator and denominator by $\Omega_0^2$. Absorb the resulting numerator scales into $n_2$, $n_1$, and $n_0$:

$$
H(s)=\frac{n_2s^2+n_1s+n_0}{s^2+\delta s+1}.
$$

A sinusoid at the natural-frequency scale is represented by $s=j$. We have not chosen a filter family. We still have three numerator coefficients and one damping coefficient, and can ask which of them are fixed by the response we want.

## Try To Preserve Slow Motion

Suppose the output should follow a constant or slowly changing input but reject fast motion:

$$
H(0)=1,
\qquad
H(\infty)=0.
$$

What do these two conditions actually decide?

At zero frequency,

$$
H(0)=n_0,
$$

so unity response fixes

$$
n_0=1.
$$

At high frequency, divide numerator and denominator by $s^2$:

$$
H(s)
=\frac{n_2+n_1/s+n_0/s^2}{1+\delta/s+1/s^2}
\longrightarrow n_2.
$$

Rejection at infinite frequency therefore fixes

$$
n_2=0.
$$

The endpoint requirements alone leave $n_1$ free:

$$
H(s)=\frac{n_1s+1}{s^2+\delta s+1}.
$$

This already approaches zero at high frequency. It is a family of low-pass responses, not yet the familiar all-pole prototype.

## Ask How Fast The Response Should Fall

The remaining numerator term changes the asymptotic attenuation. If $n_1\ne0$, then

$$
H(s)\sim\frac{n_1s}{s^2}=\frac{n_1}{s}
\qquad (|s|\to\infty).
$$

Its magnitude falls as $1/|s|$, which is first-order attenuation. If we want to use the full second-order attenuation available from the quadratic denominator, the response should instead behave as $1/s^2$. That additional requirement fixes

$$
n_1=0.
$$

Only after adding the rolloff requirement have we reached

$$
H(s)=\frac{1}{s^2+\delta s+1}.
$$

The constant numerator was not implied by the endpoint values alone. It follows from the endpoint values together with the decision to require second-order attenuation.

## Inspect The Remaining Freedom

The damping coefficient $\delta$ is still free. At the natural-frequency scale,

$$
H(j)=\frac{1}{-1+j\delta+1}=\frac{1}{j\delta},
\qquad
|H(j)|=\frac{1}{\delta}.
$$

It is conventional to name reciprocal damping $Q$:

$$
Q=\frac{1}{\delta}.
$$

The low-pass prototype is therefore

$$
H_{\mathrm{LP}}(s)=\frac{1}{s^2+s/Q+1}.
$$

At $s=j$, its amplitude is $Q$. Thus $Q=1/\sqrt{2}$ gives the familiar $-3$ dB value there. Increasing $Q$ reduces damping and eventually creates a resonant rise around the natural-frequency scale.

## Other Responses

TODO: derive each remaining prototype independently from its response goals before identifying any shared family:

- High-pass
- Band-pass, including the constant-peak and constant-skirt choices
- Notch
- Peaking
- Low shelf, including why fixed slope $S=1$ is the steepest monotonic choice
- High shelf

Once those constructions are stable, compare their common structure and perform the shared bilinear-transform expansion into the sample coefficients used by `src/lib/dsp/biquad-eq.ts`.
