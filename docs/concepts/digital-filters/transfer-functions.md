# Waves, Feedback, and Transfer Functions

A filter changes the strength and phase of different frequencies. To understand how, start with one wave and ask what delays and feedback do to it. The same calculation will connect sample recurrences, continuous differential equations, and the geometry of their natural motion.

This is background for [designing a peaking EQ](peaking-eq.md). We assume fixed linear, time-invariant filters. For stable filters, startup motion fades and a sustained sinusoidal input leaves a sinusoidal output at the same frequency.

## Describe a Wave's Gain and Phase Together

A cosine can leave a filter with a different amplitude and phase. A complex exponential packages both changes into one multiplier:

$$
e^{j\Omega t}=\cos(\Omega t)+j\sin(\Omega t),
\qquad
H_a(j\Omega)=Me^{j\phi}.
$$

Multiplying gives $Me^{j(\Omega t+\phi)}$. Taking its real part recovers the output cosine. The magnitude of $H_a$ is the amplitude ratio and its angle is the phase shift. Varying $\Omega$ traces the **frequency response**.

Samples arrive every $T=1/F_s$ seconds. At sample $n$, the same wave is $e^{j\Omega nT}=e^{j\omega n}$, where $\omega=\Omega T$ is radians per sample. At 48 kHz, a 12 kHz tone has $\omega=\pi/2$, so each sample advances its phase by a quarter turn.

## Combine a Wave with a Delayed Copy

A one-sample delay rotates the sampled wave:

$$
x[n-1]=e^{j\omega(n-1)}=e^{-j\omega}x[n].
$$

The delay alone changes phase but not amplitude. Combining the delayed copy with the original can reinforce or cancel it. For example,

$$
y[n]=\frac{x[n]+x[n-1]}{2}
\quad\Longrightarrow\quad
H_d(e^{j\omega})=\frac{1+e^{-j\omega}}{2}.
$$

A slow wave changes little between samples, so its average stays close to its original value. At $\omega=\pi$, successive samples have opposite signs, so the average vanishes. The relative angle between the copies makes the same computation treat different frequencies differently.

More generally, weighted delays give $y[n]=\sum_k b_kx[n-k]$. Their frequency response is the corresponding weighted sum of rotations, $\sum_k b_ke^{-jk\omega}$.

## Feedback Introduces a Denominator

Now let a previous output influence the next one:

$$
y[n]=b_0x[n]+b_1x[n-1]-a_1y[n-1].
$$

To include decay as well as sustained oscillation, use the probe $x[n]=z^n$. Writing $z=re^{j\theta}$ gives $z^n=r^ne^{jn\theta}$, so radius controls growth or decay and angle controls oscillation. A delay still multiplies the probe by $z^{-1}$.

Try a particular output of the same shape, $y[n]=H_d(z)z^n$. Substitution gives

$$
H_d=b_0+b_1z^{-1}-a_1H_dz^{-1},
\qquad
H_d(z)=\frac{b_0+b_1z^{-1}}{1+a_1z^{-1}}.
$$

This ratio is the **transfer function**. The denominator appears because the output participates in its own computation. Evaluating on the unit circle, $z=e^{j\omega}$, recovers the response to sustained tones.

Feedback also lets the output continue after the input ends. With $x=0$, this recurrence gives $y[n]=-a_1y[n-1]$. Its natural motion decays when $|a_1|\lt 1$, and the initial state determines how much of that motion is present.

## Two Delays Can Hold a Decaying Oscillation

With two input delays and two output delays, the same reasoning gives

$$
H_d(z)=\frac{b_0+b_1z^{-1}+b_2z^{-2}}
{1+a_1z^{-1}+a_2z^{-2}}.
$$

This ratio of quadratics is a **biquad**. To find its natural motion, set the input to zero and substitute $y[n]=z^n$. The recurrence reduces to

$$
z^2+a_1z+a_2=0.
$$

Its roots determine the natural modes. Roots of the transfer-function denominator that remain after cancellation are called **poles**. A conjugate pair $p_1=re^{j\theta}$ and $p_2=re^{-j\theta}$ gives real coefficients because

$$
(1-p_1z^{-1})(1-p_2z^{-1})
=1-2r\cos\theta\,z^{-1}+r^2z^{-2}.
$$

The corresponding real motion is proportional to $r^n\cos(n\theta+\phi)$. For $r\lt 1$, it oscillates while decaying. A pole pair near the unit circle can also produce a strong response to nearby sustained frequencies. The numerator shapes that response too. Its uncanceled roots are **zeros**, and a zero on the unit circle cancels the corresponding tone when the denominator is nonzero.

## Continuous Motion Uses Rates Instead of Multipliers

In continuous time, use $e^{st}$ with $s=\sigma+j\Omega$:

$$
e^{st}=e^{\sigma t}e^{j\Omega t}.
$$

The real part $\sigma$ controls growth or decay per unit time, while the imaginary part $\Omega$ controls angular frequency. Differentiation multiplies this mode by $s$, just as a delay multiplies a sampled mode by $z^{-1}$.

For example, the second-order equation

$$
y''+d_1y'+d_0y=c_2x''+c_1x'+c_0x
$$

therefore has transfer function

$$
H_a(s)=\frac{c_2s^2+c_1s+c_0}{s^2+d_1s+d_0}.
$$

The denominator also describes the motion with zero input. A pair of roots $-\gamma\pm j\Omega_d$ gives a decaying oscillation $e^{-\gamma t}\cos(\Omega_dt+\phi)$. We have the same behavior as the discrete pole pair, expressed with a rate rather than a per-sample multiplier.

## Connect the Two Planes by Sampling a Mode

Sample that continuous mode at times $t=nT$:

$$
e^{snT}=(e^{sT})^n.
$$

Its exact per-sample multiplier is therefore

$$
z=e^{sT},
\qquad |z|=e^{\sigma T},
\qquad \arg z=\Omega T\pmod{2\pi}.
$$

![Exact sampling maps a conjugate pair in the left half of the s-plane to a pair inside the z-plane unit circle. A decaying waveform and its samples show the same motion.](images/filter-mode-planes.svg)

| Motion                | Continuous rate $s$       | Sampled multiplier $z$ |
| --------------------- | ------------------------- | ---------------------- |
| Decay                 | $\operatorname{Re}s\lt 0$ | $\lvert z\rvert\lt 1$  |
| Sustained oscillation | $s=j\Omega$               | $\lvert z\rvert=1$     |
| Growth                | $\operatorname{Re}s\gt 0$ | $\lvert z\rvert\gt 1$  |

Moving left in the $s$-plane makes decay faster. Its discrete counterpart moves toward the center of the unit circle. Moving vertically changes continuous frequency, which corresponds to changing the angle around the circle.

The imaginary axis wraps around the circle repeatedly. Frequencies separated by $2\pi/T$ have the same sampled multiplier, which is the mode-level picture of aliasing. The strip $-\pi/T\lt \Omega\lt \pi/T$ supplies one turn of distinct angles.

This exponential relationship describes exact samples of an individual mode. It does not by itself specify a complete digital filter for arbitrary sampled inputs. That requires a choice of how to convert the system. The [bilinear-transform companion](bilinear-transform.md) makes a different, rational mapping that preserves the decay regions but changes the frequency correspondence.

With these interpretations in place, [the peaking-EQ design](peaking-eq.md) can use a continuous quadratic response to arrange the shape before converting it to a sample recurrence.
