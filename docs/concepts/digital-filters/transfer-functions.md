# Waves, Feedback, and Transfer Functions

Imagine an unknown but fixed audio circuit. We could play individual inputs and record their outputs, but we want something more useful than a catalog of experiments. We want a model of the system itself that predicts how it transforms an input.

This article develops that model by investigating waves, delays, and feedback. The goal is to understand how a sample computation acquires a frequency response and how its remembered values can sustain a decaying oscillation. Those ideas will give us the machinery to [design a peaking EQ](peaking-eq.md) from the response we want.

## Find a Useful Probe for the System

A steady tone gives us a simple experiment. Send in a cosine at angular frequency $\Omega$ and observe the output after startup motion has faded:

$$
x(t)=\cos(\Omega t)
\quad\longrightarrow\quad
y(t)=M\cos(\Omega t+\phi).
$$

The output has the same frequency, but its amplitude and phase may differ. The amplitude ratio $M$ and phase shift $\phi$ describe what the system does at this frequency. Repeating the experiment at different frequencies traces its **frequency response**.

Why does the frequency stay the same, and why should these experiments tell us about other inputs? We assume a **linear, time-invariant system**, or LTI system. Linearity means that scaling and adding inputs scales and adds their outputs. Time invariance means that delaying an input only delays its output. Together, these properties make a sustained sinusoid retain its frequency. They also let us understand a complicated signal as a combination of waves and combine the corresponding outputs.

We also assume the system is stable, so motion caused by its initial stored energy or remembered values fades. The displayed cosine is the **steady-state response**. Switching the tone on can produce an additional transient, which we will return to when we investigate feedback. These assumptions describe a fixed filter, with its controls held constant.

## Represent Gain and Phase with One Multiplier

A phase-shifted cosine is a mixture of cosine and sine. We could track both components separately, but a complex exponential carries them together:

$$
e^{j\Omega t}=\cos(\Omega t)+j\sin(\Omega t),
\qquad j^2=-1.
$$

Multiplying by a complex number scales and rotates this wave. Write the system's multiplier as $H_a(j\Omega)=Me^{j\phi}$, where the subscript $a$ identifies the continuous-time, analog response. Then

$$
H_a(j\Omega)e^{j\Omega t}=Me^{j(\Omega t+\phi)}.
$$

Taking the real part recovers the output cosine from our experiment. The magnitude of $H_a$ is its amplitude ratio and the angle is its phase shift. Complex notation lets us carry both changes through one calculation.

## Keep the Wave, but Count Samples

To connect this description to an audio program, sample the wave every $T=1/F_s$ seconds, where $F_s$ is the sample rate. At sample $n$,

$$
x[n]=x(nT)=e^{j\Omega nT}=e^{j\omega n},
\qquad \omega=\Omega T.
$$

The physical wave is the same, but $\omega$ measures its phase advance in radians per sample. At 48 kHz, a 12 kHz tone has $\omega=\pi/2$, so each sample advances its phase by a quarter turn.

A discrete-time LTI filter likewise multiplies this wave by a complex response, which we will write as $H_d(e^{j\omega})$. The argument $e^{j\omega}$ is the wave's multiplier from one sample to the next. We can now investigate how a computation on samples produces that response.

## Combine a Wave with a Delayed Copy

Multiplying every sample by a constant changes all frequencies equally. To treat frequencies differently, the computation must relate values from different times. Start with the simplest memory, a delay of one sample. On our wave, that delay becomes a rotation:

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

The average used equal weights. Choosing different weights lets us shape the interference:

$$
y[n]=b_0x[n]+b_1x[n-1]
\quad\Longrightarrow\quad
H_d(e^{j\omega})=b_0+b_1e^{-j\omega}.
$$

The coefficients $b_0$ and $b_1$ say how much of the current and previous input to combine. Adding more delayed copies extends the same idea, with each delay contributing another rotation.

## Feedback Introduces a Denominator

So far, we have remembered only inputs. Once the input and its delayed copies are gone, the output stops. Remembering an output changes that behavior because earlier outputs can keep producing later ones. Add one previous output to the computation:

$$
y[n]=b_0x[n]+b_1x[n-1]-a_1y[n-1].
$$

To describe that continuing motion, we need to include decay as well as sustained oscillation. Extend our probe to $x[n]=z^n$. Writing $z=re^{j\theta}$ gives $z^n=r^ne^{jn\theta}$, so radius controls growth or decay and angle controls oscillation. A delay multiplies this more general probe by $z^{-1}$.

A delay still preserves the shape of this exponential, so try a particular output of the same shape, $y[n]=H_d(z)z^n$. Substitution gives

$$
H_d=b_0+b_1z^{-1}-a_1H_dz^{-1},
\qquad
H_d(z)=\frac{b_0+b_1z^{-1}}{1+a_1z^{-1}}.
$$

This ratio is the **transfer function**. The denominator appears because the output participates in its own computation. Evaluating on the unit circle, $z=e^{j\omega}$, recovers the response to sustained tones.

Feedback also lets the output continue after the input ends. With $x=0$, this recurrence gives $y[n]=-a_1y[n-1]$. Its natural motion decays when $|a_1|\lt 1$, and the initial state determines how much of that motion is present.

## Two Delays Can Hold a Decaying Oscillation

One remembered output can decay, but it cannot hold a freely chosen oscillation frequency. What becomes possible with one more remembered value? Extend the recurrence to two delays on each path:

$$
y[n]=b_0x[n]+b_1x[n-1]+b_2x[n-2]
-a_1y[n-1]-a_2y[n-2].
$$

Substituting the same exponential probe and collecting the output terms gives

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

The remembered outputs gave us decay and oscillation in discrete time. A continuous system can exhibit the same behavior, but describes change through rates instead of sample updates. Connecting the two will let us design a response in whichever setting makes its properties easier to arrange.

Start with an output that moves toward its input at a rate proportional to their difference:

$$
\tau y'(t)=x(t)-y(t),
\qquad \tau>0.
$$

The response time $\tau$ sets how quickly it follows. For a constant input $x(t)=X$, the mismatch decays as $y(t)-X=[y(0)-X]e^{-t/\tau}$. Feedback has a physical meaning here because the current output determines how much further it needs to move.

To find the response to a moving input, use the same exponential idea in continuous time. Write $x(t)=e^{st}$ with $s=\sigma+j\Omega$, so

$$
e^{st}=e^{\sigma t}e^{j\Omega t}.
$$

The real part $\sigma$ controls growth or decay per unit time, while the imaginary part $\Omega$ controls angular frequency. Differentiation multiplies this exponential by $s$, just as a delay multiplies the sampled probe by $z^{-1}$. Trying $y(t)=H_a(s)e^{st}$ in the follower equation therefore gives

$$
\tau sH_a=1-H_a,
\qquad H_a(s)=\frac{1}{1+\tau s}.
$$

At $s=j\Omega$, this is the multiplier for a sustained tone. When $\Omega\tau$ is small, the output closely follows the input. At higher frequencies, its finite response time produces attenuation and phase lag. The denominator root $s=-1/\tau$ is also the decay rate of the initial mismatch. The forced response and the fading startup motion come from the same equation.

Adding a second derivative introduces the possibility of oscillation:

$$
y''+d_1y'+d_0y=x.
$$

For a mechanical picture, think of $y$ as displacement and $x$ as applied force, with mass scaled to one. The terms $d_1y'$ and $d_0y$ describe damping and restoring force. The system can now overshoot and return, producing the continuous counterpart of the discrete oscillation.

We can also shape how the input drives this motion by allowing a weighted combination of $x$ and its derivatives. With primes denoting derivatives in time, the same exponential substitution gives

$$
y''+d_1y'+d_0y=c_2x''+c_1x'+c_0x
\quad\Longrightarrow\quad
H_a(s)=\frac{c_2s^2+c_1s+c_0}{s^2+d_1s+d_0}.
$$

Once again we have a ratio of quadratics. Setting the input to zero leaves the denominator as the equation for natural motion. A pair of roots $-\gamma\pm j\Omega_d$ gives a decaying oscillation $e^{-\gamma t}\cos(\Omega_dt+\phi)$ for $\gamma>0$. Compare this with $r^n\cos(n\theta+\phi)$ from the discrete pole pair. One describes decay and oscillation through a continuous rate, the other through a per-sample multiplier.

## Connect the Two Planes by Sampling a Mode

We now have two descriptions of a decaying oscillation. To relate them directly, sample the continuous mode at times $t=nT$:

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
