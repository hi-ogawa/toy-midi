# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html). We will work through one response at a time, inspect exactly what each requirement decides, and avoid assuming the final filter family in advance.

## Begin With A General Second-Order Response

A continuous second-order input/output system can be written, after scaling the leading denominator coefficient to one, as

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

We have not chosen a filter family or a special frequency. We still have five free coefficients and can ask which of them are fixed by the response we want.

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

## Find The Frequency Scale In The Result

The denominator still contains $d_0$ and $d_1$. Each denominator root $S=r$ contributes free motion proportional to $e^{rt}$, which decays when $\mathrm{Re}(r)<0$. For the real quadratic $S^2+d_1S+d_0$, both roots decay exactly when $d_0>0$ and $d_1>0$: complex roots have real part $-d_1/2$, while real roots have negative sum $-d_1$ and positive product $d_0$, making both negative.

Probe the denominator with a sinusoid by setting $S=j\Omega$:

$$
D(j\Omega)=d_0-\Omega^2+j d_1\Omega.
$$

The constant and quadratic terms cancel when

$$
\Omega^2=d_0.
$$

This reveals a distinguished angular frequency in the response:

$$
\Omega_0=\sqrt{d_0}.
$$

The definition is not an arbitrary normalization introduced in advance. It is the frequency where the restoring and second-derivative terms balance. Measure all complex frequencies relative to it:

$$
s=\frac{S}{\Omega_0}.
$$

Substitute $S=\Omega_0s$ and use $d_0=\Omega_0^2$:

$$
H(s)
=\frac{1}{s^2+(d_1/\Omega_0)s+1}.
$$

Only one dimensionless coefficient remains. Call it

$$
\delta=\frac{d_1}{\Omega_0}.
$$

The response is now

$$
H(s)=\frac{1}{s^2+\delta s+1}.
$$

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
