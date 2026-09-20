# Waves, Feedback, and Transfer Functions

Imagine an unknown but fixed audio circuit. Testing individual inputs gives us a catalog of experiments. We want a model of the system itself that predicts how it transforms an input.

We will build that model from waves, delays, and feedback, then use it to [design a peaking EQ](peaking-eq.md) from the response we want.

## Find a Useful Probe for the System

Assume a **linear, time-invariant system** (LTI). Linearity means that scaling and adding inputs scales and adds their outputs. Time invariance means that delaying an input only delays its output. We also assume any motion from the initial state decays, so we can study a settled response with the controls held fixed.

Under these assumptions, a steady tone keeps its frequency. The system changes only its amplitude and phase:

$$
x(t)=\cos(\Omega t)
\quad\longrightarrow\quad
y(t)=M\cos(\Omega t+\phi).
$$

The amplitude ratio $M$ and phase shift $\phi$ describe the system at angular frequency $\Omega$. Varying $\Omega$ traces its **frequency response**. This answers our modeling question because a complicated signal can be decomposed into waves, and linearity lets us combine their responses. Startup transients are separate from this steady response, and feedback will explain where they come from.

## Represent Gain and Phase with One Multiplier

A phase-shifted cosine is a mixture of cosine and sine. We could track both components separately, but a complex exponential carries them together:

$$
e^{j\Omega t}=\cos(\Omega t)+j\sin(\Omega t),
\qquad j^2=-1.
$$

A complex multiplier scales and rotates it. Writing the continuous-time response as $H_a(j\Omega)=Me^{j\phi}$ gives

$$
H_a(j\Omega)e^{j\Omega t}=Me^{j(\Omega t+\phi)}.
$$

Taking the real part recovers our output cosine. The magnitude of $H_a$ gives the gain and its angle gives the phase shift, so one multiplication carries both changes.

To connect this description to an audio program, sample the wave every $T=1/F_s$ seconds, where $F_s$ is the sample rate. At sample $n$,

$$
x[n]=x(nT)=e^{j\Omega nT}=e^{j\omega n},
\qquad \omega=\Omega T.
$$

The physical wave is the same, but $\omega$ measures its phase advance in radians per sample. At 48 kHz, a 12 kHz tone has $\omega=\pi/2$, so each sample advances its phase by a quarter turn.

We write the discrete filter's response as $H_d(e^{j\omega})$, using the wave's per-sample multiplier $e^{j\omega}$ as its argument. How does a sample computation produce this frequency-dependent multiplier?

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

Different weights let us shape this interference. Combining $b_0$ of the current input and $b_1$ of the previous input gives response $b_0+b_1e^{-j\omega}$. Each additional delay contributes another rotation.

## Feedback Introduces a Denominator

Once the input and its delayed copies are gone, the average stops. Feeding a previous output back into the computation lets motion continue:

$$
y[n]=b_0x[n]+b_1x[n-1]-a_1y[n-1].
$$

To describe that continuing motion, we need to include decay as well as sustained oscillation. Extend our probe to $x[n]=z^n$. Writing $z=re^{j\theta}$ gives $z^n=r^ne^{jn\theta}$, so radius controls growth or decay and angle controls oscillation. A delay multiplies this more general probe by $z^{-1}$.

Try a particular output with the same exponential shape, $y[n]=H_d(z)z^n$. Substitution gives

$$
H_d=b_0+b_1z^{-1}-a_1H_dz^{-1},
\qquad
H_d(z)=\frac{b_0+b_1z^{-1}}{1+a_1z^{-1}}.
$$

This ratio is the **transfer function**. The denominator appears because the output participates in its own computation. Evaluating on the unit circle, $z=e^{j\omega}$, recovers the response to sustained tones.

Once the input and its delayed copy are zero, $y[n]=-a_1y[n-1]$. This **natural motion** depends on the remembered output and decays when $|a_1|\lt 1$. It is the transient we set aside when measuring the steady frequency response.

## Two Delays Can Hold a Decaying Oscillation

One real feedback coefficient can produce decay or alternating signs. Adding a second output delay allows an oscillation with a chosen frequency. With up to two delays on each path, the same substitution gives

$$
H_d(z)=\frac{b_0+b_1z^{-1}+b_2z^{-2}}
{1+a_1z^{-1}+a_2z^{-2}}.
$$

This ratio of quadratics is a **biquad**. To find its natural motion, set the input to zero and substitute $y[n]=z^n$. The recurrence reduces to

$$
z^2+a_1z+a_2=0.
$$

Its roots are the multipliers of the natural modes. A conjugate pair $re^{\pm j\theta}$ produces real motion of the form

$$
y[n]=Cr^n\cos(n\theta+\phi).
$$

For $0\lt r\lt 1$, the radius $r$ sets decay and the angle $\theta$ sets oscillation. Two real coefficients can control both because the conjugate factors combine into a real quadratic.

Uncanceled denominator roots are called **poles**. A pole pair near the unit circle can produce a strong response to nearby sustained frequencies. The numerator's uncanceled roots are **zeros**, and a zero on the unit circle cancels that tone when the denominator is nonzero. These give us ways to shape a response, not just analyze one.

## Continuous Motion Uses Rates Instead of Multipliers

To design an EQ, it is useful to have the same model in continuous time, where we can arrange response properties before converting them to sample weights. The exponential now has a complex rate $s=\sigma+j\Omega$:

$$
e^{st}=e^{\sigma t}e^{j\Omega t}.
$$

The real part sets growth or decay per second, while the imaginary part sets angular frequency. Differentiation multiplies this wave by $s$, just as a sample delay multiplies $z^n$ by $z^{-1}$.

A damped oscillator provides the continuous counterpart of two output delays. Its equation contains acceleration, damping, and restoring terms, $y''+d_1y'+d_0y$. Allowing a weighted input and its derivatives gives

$$
y''+d_1y'+d_0y=c_2x''+c_1x'+c_0x
\quad\Longrightarrow\quad
H_a(s)=\frac{c_2s^2+c_1s+c_0}{s^2+d_1s+d_0}.
$$

The ratio follows by substituting $x=e^{st}$ and $y=H_a(s)e^{st}$. As before, the denominator also determines the motion with zero input. Roots $-\gamma\pm j\Omega_d$ give $e^{-\gamma t}\cos(\Omega_dt+\phi)$ up to an amplitude factor. For $\gamma>0$, this is the same decaying oscillation we described with radius and angle in discrete time.

## Connect the Two Planes by Sampling a Mode

Sampling the continuous exponential at $t=nT$ makes the relationship exact:

$$
e^{snT}=(e^{sT})^n.
$$

Its per-sample multiplier is therefore

$$
z=e^{sT},
\qquad |z|=e^{\sigma T},
\qquad \arg z=\Omega T\pmod{2\pi}.
$$

![Exact sampling maps a conjugate pair in the left half of the s-plane to a pair inside the z-plane unit circle. A decaying waveform and its samples show the same motion.](images/filter-mode-planes.svg)

The imaginary axis $s=j\Omega$ maps to the unit circle because sustained oscillation has unit magnitude per step. The left half-plane maps inside the circle because decay has magnitude less than one. The right half-plane maps outside it because growth has magnitude greater than one.

Moving left in the $s$-plane makes decay faster. Its discrete counterpart moves toward the center of the unit circle. Moving vertically changes continuous frequency, which corresponds to changing the angle around the circle.

The imaginary axis wraps around the circle repeatedly. Frequencies separated by $2\pi/T$ have the same sampled multiplier, which explains why sampling cannot distinguish them.

Sampling a mode does not yet specify how to convert a complete filter for arbitrary inputs. The [bilinear transform](bilinear-transform.md) makes that conversion with a different mapping, preserving the decay regions while changing the frequency correspondence.

With these interpretations in place, [the peaking-EQ design](peaking-eq.md) can use a continuous quadratic response to arrange the shape before converting it to a sample recurrence.
