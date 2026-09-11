# Modeling an Audio Effect as a Transfer Function

From complex wave ratios to delayed-sample coefficients and feedback.

This is the Markdown companion to [the interactive peaking-EQ derivation](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html), developed for [PR #466](https://github.com/hi-ogawa/toy-midi/pull/466). It preserves the ten-section explanation and calculations, while the linked original provides the diagrams and interactive explorers.

The goal is to reconstruct the peaking-EQ mathematics. We first investigate how waves respond to delays and feedback, then explore the oscillation made possible by second-order systems. With that machinery understood, we can choose a response and derive the coefficients that implement it.

The explanation assumes a mathematics or physics background. It distinguishes what follows from an equation from what we choose to obtain a desired response, so the design choices and coefficients remain reconstructable. It develops fixed-filter mathematics. Runtime state handling and parameter changes are separate concerns.

Continue with [Discovering Analog Biquad Filter Prototypes](biquad-filter-prototypes.md) for other response shapes.

## 1. The object we want describes the system itself

Imagine an unknown but fixed audio circuit. We could test individual inputs and record individual outputs, but that produces a catalog of experiments rather than a model. We want a rule belonging to the box itself: give it a description of an input and it predicts the corresponding output.

$$
x(t) = \cos (\Omega t) \to y(t) = M \cos (\Omega t + \phi)
$$

A steady tone provides a particularly clean probe. After startup motion has died away, its output has the same frequency. The pair **M** and **φ** belongs to the system at angular frequency Ω, rather than to this tone experiment alone. Repeating the probe at different frequencies makes those pairs trace the system's **frequency response**.

### Why does the frequency stay fixed?

This is a consequence of two assumptions. **Linearity** means scaled and added inputs produce scaled and added outputs. **Time invariance** means running the same experiment later changes nothing.

### Why is this enough?

Under the same assumptions, a complicated signal can be understood as a combination of waves. If we know the response to each frequency, linearity tells us how to combine their responses.

Together, these assumptions define a **linear time-invariant system**, abbreviated **LTI**. The transfer-function model developed below applies to this class of systems.

**Steady state matters.** Switching a tone on can also excite a transient determined by stored energy or remembered values. Frequency response describes what remains after a stable system's transient decays.

## 2. A wave turns the unknown box into one multiplier

A real cosine shifted in phase becomes a mixture of cosine and sine. Tracking those two components separately is possible but clumsy. A complex exponential carries both at once:

$$
e^{j\Omega t} = \cos (\Omega t) + j \sin (\Omega t)
$$

Multiplying this wave by a complex number both scales and rotates it:

$$
H(j\Omega) = M e^{j\phi} \Longrightarrow H(j\Omega)e^{j\Omega t} = M e^{j(\Omega t + \phi)}
$$

Its magnitude is the amplitude multiplier M. Its angle is the phase shift φ. Taking the real part returns the physical cosine. Complex notation compresses two real calculations into one.

## 3. Keep the same idea, but count samples

To connect this wave description to computation, we need values at instants spaced T seconds apart. The sample index n now counts those instants, and the continuous wave becomes a sequence:

$$
x[n] = x(nT) = e^{j\Omega nT} = e^{j\omega n} \quad \text{with} \quad \omega = \Omega T
$$

The angle now advances by ω radians each time n increases by one. A fixed discrete-time LTI system has its own complex response to this sampled wave:

$$
e^{j\omega n} \to H(e^{j\omega})e^{j\omega n}
$$

**Concrete audio scale: $F_s = 48$ kHz.** Here $T = 1/48000$ second and $\omega = 2\pi f/F_s$. Therefore $\omega/\pi = f/(24\text{ kHz})$, so 6 kHz is $0.25\pi$ radians/sample, 12 kHz is $0.5\pi$, and the 24 kHz Nyquist frequency is $\pi$.

## 4. Delayed copies create frequency selectivity

Multiplying each sample by a constant changes every frequency equally. To distinguish frequencies, the computation must relate values from different times. A one-sample delay is the simplest place to investigate how memory changes the response.

$$
x[n] = e^{j\omega n} \Longrightarrow x[n - 1] = e^{j\omega (n-1)} = e^{-j\omega}x[n]
$$

On a pure wave, one delay is a rotation by -ω. Its angle depends on frequency, but a delay by itself still changes no amplitude. Frequency selection appears when the delayed copy is **combined** with the original.

### Averaging reveals interference

Averaging the current and previous samples gives a concrete example:

$$
y[n] = \frac{x[n] + x[n - 1]}{2}
$$

### Slow wave: reinforcement

Adjacent samples are similar, so their average remains close to the input.

### Alternating wave: cancellation

At ω = π, adjacent samples have opposite signs, so their average is zero.

For the exponential probe $x[n] = e^{j\omega n}$, the average has response:

$$
H(e^{j\omega}) = \frac{1 + e^{-j\omega}}{2} \quad \quad H(e^{j0}) = 1, \quad H(e^{j\pi}) = 0
$$

The original and delayed copies are vectors. Their relative angle changes with ω, so their sum changes with ω. This frequency-dependent reinforcement and cancellation is the basic mechanism of a filter.

### The weights give us a family of responses

The average used weight 1/2 for both copies. Allowing independent weights lets us explore which part of its behavior depends on that particular choice:

$$
y[n] = b_{0}x[n] + b_{1}x[n - 1]
$$

The letters $b_{0}$ and $b_{1}$ are conventional names, not new physical quantities. They say how much of the current input and delayed input to combine. For the probe $x[n] = e^{j\omega n}$:

$$
\begin{gathered}
y[n] = b_{0}x[n] + b_{1}x[n - 1]\\
= b_{0}x[n] + b_{1}e^{-j\omega}x[n]\\
= (b_{0} + b_{1}e^{-j\omega})x[n]
\end{gathered}
$$

For this sinusoidal probe, y[n] / x[n] is the same complex number at every n. That multiplier is the frequency response:

$$
H(e^{j\omega}) = \frac{y[n]}{x[n]} = b_{0} + b_{1}e^{-j\omega}
$$

### Optional background: why weighted delayed copies?

Any discrete signal can be decomposed into scaled, shifted impulses. Linearity and time invariance then make the output a weighted sum of delayed input copies: $y[n] = \sum_{k} h[k]x[n - k]$. This is convolution. The weights $h[k]$ form the impulse response, and the finite feed-forward weights used in filter equations are conventionally named $b_{k}$.

## 5. Feedback is where the denominator comes from

So far, the computation remembers inputs. What becomes possible if it also remembers an output? To investigate feedback, it will help to include decaying and growing exponentials alongside permanent waves. The per-sample multiplier $e^{j\omega}$ can be extended to a complex number z whose magnitude need not be 1:

$$
z = re^{j\omega}, \quad x[n] = z^{n} = r^{n}e^{j\omega n}
$$

The angle ω controls oscillation, while r < 1 gives decay and r > 1 gives growth. At r = 1 we recover the pure wave. Whatever nonzero z we choose, a delay still acts through one multiplier:

$$
x[n - 1] = z^{-1}x[n]
$$

Adding one previous output gives the recurrence we want to investigate:

$$
y[n] = b_{0}x[n] + b_{1}x[n - 1] - a_{1}y[n - 1]
$$

For input $x[n] = z^{n}$, try a particular solution y[n] = H(z)x[n]. Its delayed value is also multiplied by $z^{-1}$, so substitution gives an equation for H:

$$
\begin{gathered}
H = b_{0} + b_{1}z^{-1} - a_{1}Hz^{-1}\\
H(1 + a_{1}z^{-1}) = b_{0} + b_{1}z^{-1}
\end{gathered}
$$

$$
H(z) = \frac{b_{0} + b_{1}z^{-1}}{1 + a_{1}z^{-1}}
$$

This rational function is the **transfer function**. For the pure waves of section 4, evaluate it at $z = e^{j\omega}$ to recover the frequency response $H(e^{j\omega})$. We have extended the same exponential calculation to include growth and decay.

The numerator is the weighted combination we directly feed forward from the input. The denominator appears because the unknown output is also fed back into its own computation.

### Without feedback

Once the input ends, a finite list of delayed input values eventually becomes zero. This is a **finite impulse response**, or FIR.

### With feedback

Previous outputs can keep producing later outputs after the input ends. A stable feedback mode decays but can continue indefinitely. This is an **infinite impulse response**, or IIR.

### An output that follows its input gives feedback a physical meaning

A concrete continuous-time model makes this dependence on the output easier to interpret. Suppose the output changes at a rate proportional to its distance from the current input:

$$
\tau y'(t) = x(t) - y(t), \quad \tau > 0
$$

Let x(t) be the incoming signal and y(t) the outgoing signal. The response time τ determines how quickly it follows. The output y also appears on the right because its current value affects its own evolution, which is continuous feedback.

For a constant input x(t) = X, solving the first-order equation gives:

$$
y(t) = X + [y(0) - X]e^{-t/\tau}
$$

For a constant input, the initial mismatch decays on the timescale τ. How well can the output follow an input that keeps moving? A sinusoidal input lets us compare its oscillation timescale with τ.

### Solve for a sinusoidal input

We prescribe the input x(t) and solve for the output y(t). For an exponential input, try a particular solution of the same shape:

$$
x(t) = e^{St}, \quad y(t) = H(S)e^{St}
$$

Here S = σ + jΩ is a complex rate. Its real part describes growth or decay, and its imaginary part describes oscillation. Differentiation multiplies the exponential by S, so substituting into τy′ + y = x and canceling $e^{St}$ gives:

$$
\tau SH(S) + H(S) = 1 \quad \Rightarrow \quad H(S) = 1/(1 + \tau S)
$$

For a sustained pure wave, S = jΩ. The general solution is this particular solution plus the homogeneous solution:

$$
y(t) = H(j\Omega)e^{j\Omega t} + Ce^{-t/\tau}
$$

C is fixed by the initial output. Its term fades, leaving the wave multiplied by H(jΩ). Taking the real part gives the physical response to a cosine. The particular solution describes the sustained response, while the homogeneous term describes the fading effect of the initial state.

$$
\begin{gathered}
|H(j\Omega)| = 1/\sqrt{1 + (\Omega \tau)^{2}}\\
\arg H(j\Omega) = -\arctan (\Omega \tau)
\end{gathered}
$$

When Ωτ is small, the output closely follows the input. When it is large, the amplitude falls approximately as 1/(Ωτ). The negative phase is the lag of an output that takes time to follow. The denominator root S = -1/τ is also the decay rate of the homogeneous solution.

### Approximate the differential equation one time step at a time

To connect this continuous follower to our sample computation, we can approximate its evolution over a short interval T. The change is approximately the interval length times the rate at the start:

$$
y(t + T) - y(t) \approx Ty'(t) = (T/\tau)[x(t) - y(t)]
$$

Write x[n] = x(nT) and y[n] = y(nT), and define k = T/τ. Taking this approximation as our sample update gives the forward Euler rule:

$$
\begin{gathered}
y[n + 1] = y[n] + k(x[n] - y[n])\\
= (1-k)y[n] + kx[n]
\end{gathered}
$$

For 0 < T < τ, we have 0 < k < 1. Each step moves the output a fraction k of the distance toward the input. This is the differential equation's rate-of-change rule applied over one finite interval.

Shifting the index back by one puts this in our earlier recurrence notation:

$$
y[n] = (1-k)y[n - 1] + kx[n - 1]
$$

This has $b_{0} = 0$, $b_{1} = k$, and $a_{1} = -(1-k)$. Both values on the right come from the start of the interval. The response formula already derived above therefore gives:

$$
H(e^{j\omega}) = ke^{-j\omega}/[1 - (1-k)e^{-j\omega}]
$$

The differential equation has led directly to a discrete feedback filter. Its response approaches the continuous follower's response as T shrinks with k = T/τ and ω = ΩT. At finite spacing, it is a numerical approximation of that continuous system.

### Derive the continuous-response limit

Multiply the numerator and denominator by $e^{j\omega}$:

$$
H = k/[e^{j\omega} - 1 + k]
$$

Substitute k = T/τ and ω = ΩT, then divide by T/τ:

$$
\begin{gathered}
H = (T/\tau)/[e^{j\Omega T} - 1 + T/\tau ]\\
= 1/[1 + \tau (e^{j\Omega T} - 1)/T]
\end{gathered}
$$

Hold the physical frequency Ω and response time τ fixed as T shrinks. The remaining quotient is the derivative of $e^{j\Omega T}$ at T = 0. Equivalently, expand the exponential:

$$
\begin{gathered}
e^{j\Omega T} = 1 + j\Omega T + O(T^{2})\\
(e^{j\Omega T} - 1)/T = j\Omega + O(T) \quad \to \quad j\Omega
\end{gathered}
$$

Therefore the discrete response tends to the continuous follower's response:

$$
H \quad \to \quad 1/(1 + j\Omega \tau)
$$

The physical wave stays the same while its per-sample angle ω = ΩT shrinks with the sample spacing.

### Explore the same follower

The [follower explorer](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html#feedback) uses the update we just derived, $y[n] = (1-k)y[n - 1] + kx[n - 1]$. Its $k$ control changes how quickly the output follows, while the probe frequency selects the wave whose attenuation and lag we inspect.

The explorer shows 65 samples of a settled cosine response. The startup transient has already faded.

Small k makes the output follow slowly and smooths out more of the oscillation. At k = 1, the rule becomes y[n] = x[n - 1]. Its magnitude is 1 at every frequency, but its phase still shows the one-sample delay.

## 6. Extend the recurrence by one more delay

The first-order follower gives us decay and smoothing. What new behavior becomes possible with another remembered value? Adding a second delay to each path extends the same recurrence:

$$
\begin{gathered}
y[n] = b_{0}x[n] + b_{1}x[n - 1] + b_{2}x[n - 2]\\
- a_{1}y[n - 1] - a_{2}y[n - 2]
\end{gathered}
$$

Applying the general mode $z^{n}$ and factoring it out gives:

$$
H(z) = \frac{b_{0} + b_{1}z^{-1} + b_{2}z^{-2}}{1 + a_{1}z^{-1} + a_{2}z^{-2}}
$$

A quadratic numerator over a quadratic denominator gives this structure its name, **biquad**, short for “biquadratic.”

### What new behavior can two output delays hold?

To find the motion supported by the remembered values alone, set the input to zero. The trial solution $y[n] = z^{n}$ turns the homogeneous recurrence into:

$$
\begin{gathered}
z^{n} = -a_{1}z^{n-1} - a_{2}z^{n-2}\\
\Longrightarrow z^{2} + a_{1}z + a_{2} = 0
\end{gathered}
$$

This quadratic determines two natural multipliers $p_{1}$ and $p_{2}$. They are also roots of the transfer-function denominator, called **poles** when not canceled by the numerator. Factoring the denominator gives:

$$
\begin{gathered}
1 + a_{1}z^{-1} + a_{2}z^{-2}\\
= (1 - p_{1}z^{-1})(1 - p_{2}z^{-1})
\end{gathered}
$$

Each root contributes a natural mode $p^{n}$, which decays when |p| < 1. So far we have inferred behavior from a given recurrence. We can also work backward and design a decaying response by choosing both roots inside the unit circle, then expanding their factors to recover $a_{1}$ and $a_{2}$. Our audio computation uses real coefficients, so the roots must either both be real or form a complex-conjugate pair.

### The conjugate pair exposes frequency and decay separately

To explore a decaying oscillation, take the conjugate pair $p_{1} = re^{j\theta}$ and $p_{2} = re^{-j\theta}$, with 0 < r < 1. Expanding their factors reveals the corresponding real coefficients:

$$
\begin{gathered}
(1 - p_{1}z^{-1})(1 - p_{2}z^{-1})\\
= 1 - (p_{1} + p_{2})z^{-1} + p_{1}p_{2}z^{-2}\\
= 1 - 2r \cos (\theta)z^{-1} + r^{2}z^{-2}
\end{gathered}
$$

The pair produces the real waveform $r^{n}\cos(\theta n + \phi)$. Its angle θ sets the oscillation frequency, while its radius r sets the decay. This is the new behavior revealed by extending the recurrence to second order.

### The pole pair also shapes the frequency response

The same pole pair can produce a response peak near its angle when the input is a sustained wave. Here C normalizes the response to 1 at zero frequency:

$$
H(z) = \frac{C}{1 - 2r \cos (\theta)z^{-1} + r^{2}z^{-2}} \quad \text{with} \quad C = 1 - 2r \cos (\theta) + r^{2}
$$

The [pole-pair explorer](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html#biquad) shows the poles, their natural motion, and the frequency response. Its controls set the pole angle $\theta$ and radius $r$, while the response graph varies the probe frequency $\omega$. The dashed line marks $\omega = \theta$.

The two poles share a radius and have opposite angles so the coefficients remain real.

The natural mode $r^{n}\cos(\theta n)$ oscillates at angle $\theta$ per sample and decays with radius $r$.

The numerator has an analogous role. Its roots are **zeros** of the response, so a zero on the unit circle cancels a particular frequency when the denominator is nonzero. We will use both numerator and denominator when constructing the peaking EQ.

### The continuous counterpart is a damped oscillator

The same extension is worth exploring in continuous time. Including a second derivative adds inertia to the first-order picture from section 5 and leads to the oscillator equation:

$$
y'' + d_{1}y' + d_{0}y = x
$$

In a mechanical interpretation, x is an applied force and y is displacement, with mass scaled to one. The terms $d_{1}y'$ and $d_{0}y$ describe damping and restoring force. Sinusoidal forcing produces a sinusoidal response with a frequency-dependent amplitude and phase, while the initial state can excite a decaying free oscillation.

Allowing a weighted combination of x and its derivatives gives us control over the input side as well. This gives the continuous counterpart of choosing several input-delay weights:

$$
y'' + d_{1}y' + d_{0}y = c_{2}x'' + c_{1}x' + c_{0}x
$$

Primes here mean derivatives with respect to physical time t. The same trial input $x(t) = e^{St}$ and particular solution $y(t) = H(S)e^{St}$ give:

$$
(S^{2} + d_{1}S + d_{0})H(S) = c_{2}S^{2} + c_{1}S + c_{0}
$$

$$
H(S) = \frac{c_{2}S^{2} + c_{1}S + c_{0}}{S^{2} + d_{1}S + d_{0}}
$$

Again we get a ratio of quadratics, and setting the input to zero makes its denominator the natural-motion equation. To construct a mode with decay rate γ and oscillation frequency $\Omega_{d}$, both positive, we want roots $-\gamma \pm j\Omega_d$. Their product shows which coefficients produce it:

$$
S^{2} + 2\gamma S + \gamma ^{2} + \Omega_{d}^{2} = (S + \gamma - j\Omega_{d})(S + \gamma + j\Omega_{d})
$$

Thus $d_{1} = 2\gamma$ and $d_{0} = \gamma ^{2} + \Omega_{d}^{2}$ produce $e^{-\gamma t}\cos(\Omega_d t + \phi)$, the familiar damped oscillation. Compare it with $r^{n}\cos(\theta n + \phi)$ above. In discrete time, pole radius and angle set decay and oscillation, while in continuous time, the real and imaginary parts do.

We now have two settings for the same exponential-and-polynomial reasoning. When choosing an EQ response, we can work in the setting where its desired properties are easiest to arrange.

Related implementation context: [toy-midi issue #465](https://github.com/hi-ogawa/toy-midi/issues/465) and [PR #466](https://github.com/hi-ogawa/toy-midi/pull/466).

## 7. Specify the peaking effect before choosing coefficients

The previous sections explored what second-order systems can do. We now have a specific design goal: a peaking EQ that adjusts a band of frequencies while leaving the endpoints unchanged. Three controls describe the desired correction: center frequency $f_{0}$, center amplitude ratio M, and width Q.

### Unity away from the peak

The response tends to amplitude 1 at the low and high ends. The effect adds a local correction rather than changing the entire signal level.

### Exact center ratio

At $f_{0}$, the requested amplitude multiplier is M. For example, M = 2 doubles the sinusoid's amplitude at the center.

### One width control

Larger Q concentrates the correction more tightly around $f_{0}$. Its precise bandwidth meaning will come from the prototype.

### Matching boost and cut

Replacing M with 1/M should exchange poles and zeros, making the fixed boost and cut exact inverse systems.

The [peaking-EQ explorer](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html#peak-goal) previews the response we want to construct using the final coefficients, whose derivation follows in the next three sections.

In that explorer, orange markers show the halfway amplitude $\sqrt{M}$, displayed as $G/2$ dB when the center gain is $G$ dB. The [width calculation in section 8](#the-product-determines-the-width) explains this level.

The graph uses decibels because audio displays conventionally show equal boosts and cuts symmetrically around zero. The filter design itself only needs amplitude ratios.

## 8. Shape a local boost or cut

The pole-pair example showed how a system can favor frequencies near an oscillation frequency. For a peaking EQ, we want control over that local boost or cut while leaving frequencies far below and above it unchanged. How can we shape the numerator and denominator to do both?

The continuous second-order family from section 6 gives us room to explore that question. We can first arrange the unchanged endpoints, then use the remaining freedom to set the center gain. Its general response is:

$$
H(S) = \frac{c_{2}S^{2} + c_{1}S + c_{0}}{S^{2} + d_{1}S + d_{0}}
$$

### What do the two frequency extremes tell us?

At zero frequency, S = 0, so only the constant terms remain:

$$
H(0) = c_{0}/d_{0}
$$

For the high-frequency limit, S = jΩ with Ω growing without bound. Dividing numerator and denominator by $S^{2}$ exposes the terms that survive:

$$
H(S) = \frac{c_{2} + c_{1}/S + c_{0}/S^{2}}{1 + d_{1}/S + d_{0}/S^{2}} \quad \to \quad c_{2}
$$

Thus unity at both extremes requires $c_{0} = d_{0}$ and $c_{2} = 1$. These conditions leave the linear coefficients free:

$$
H(S) = \frac{S^{2} + c_{1}S + d_{0}}{S^{2} + d_{1}S + d_{0}}
$$

### What happens at the intended center?

For a sinusoid at the intended center frequency $\Omega_{0}$, the complex rate is $S = j\Omega_{0}$. Substituting it into the response above gives:

$$
H(j\Omega_{0}) = \frac{d_{0} - \Omega_{0}^{2} + jc_{1}\Omega_{0}}{d_{0} - \Omega_{0}^{2} + jd_{1}\Omega_{0}}
$$

The same real term $d_{0} - \Omega_{0}^{2}$ appears in both numerator and denominator. If we choose $d_{0} = \Omega_{0}^{2}$, it vanishes at this frequency, leaving a particularly simple center response:

$$
H(j\Omega_{0}) = \frac{jc_{1}\Omega_{0}}{jd_{1}\Omega_{0}} = c_{1}/d_{1}
$$

This choice gives us a family with unity endpoints and a center gain controlled by the ratio of the linear coefficients. Its response at a general complex rate S is now:

$$
H(S) = \frac{S^{2} + c_{1}S + \Omega_{0}^{2}}{S^{2} + d_{1}S + \Omega_{0}^{2}}
$$

### Measure frequency relative to the center

The center calculation is already complete. To simplify the remaining algebra, divide both polynomials by $\Omega_{0}^{2}$:

$$
H(S) = \frac{(S/\Omega_{0})^{2} + (c_{1}/\Omega_{0})(S/\Omega_{0}) + 1}{(S/\Omega_{0})^{2} + (d_{1}/\Omega_{0})(S/\Omega_{0}) + 1}
$$

Writing $s = S/\Omega_{0}$, $c_{z} = c_{1}/\Omega_{0}$, and $c_{p} = d_{1}/\Omega_{0}$ abbreviates these ratios. At the center, s = j. At any probe frequency Ω, s = jν with $\nu = \Omega /\Omega_{0}$.

Since $S = \Omega_{0}s$, the same response can be written as $H(\Omega_{0}s)$. For this peaking family we use positive $c_{p}$ and $c_{z}$:

$$
H(\Omega_{0}s) = \frac{s^{2} + c_{z}s + 1}{s^{2} + c_{p}s + 1}
$$

### The ratio fixes the center gain

The center gain is $c_{1}/d_{1} = c_{z}/c_{p}$. For the requested amplitude ratio M, we therefore need $c_{z}/c_{p} = M$. What does the remaining freedom in these two coefficients control?

### What happens between the endpoints and center?

The endpoint and center values alone do not establish the shape between them. Evaluating the response at s = jν and taking its squared magnitude gives:

$$
|H(j\Omega_{0}\nu)|^{2} = \frac{(1-\nu ^{2})^{2} + c_{z}^{2}\nu ^{2}}{(1-\nu ^{2})^{2} + c_{p}^{2}\nu ^{2}}
$$

For ν > 0, dividing by $\nu ^{2}$ puts the frequency dependence in one nonnegative quantity:

$$
u = (\nu - 1/\nu)^{2}, \quad |H|^{2} = F(u) = (u + c_{z}^{2})/(u + c_{p}^{2})
$$

As frequency approaches the center from below, u decreases from infinity to zero. Above the center, it increases back toward infinity. Meanwhile:

$$
F'(u) = (c_{p}^{2} - c_{z}^{2})/(u + c_{p}^{2})^{2}
$$

For a boost, $c_{z} > c_{p}$, so F decreases with u. The response therefore rises toward the center and falls afterward. For a cut the signs reverse, giving one dip. Equal coefficients give a flat response. Since u is unchanged by ν → 1/ν, the analog shape is symmetric on a logarithmic frequency axis.

### The product determines the width

To measure the width of this correction, use the geometric halfway amplitude between unity and the center gain M, namely $\sqrt{M}$. For M ≠ 1, its two crossing frequencies satisfy $|H|^{2} = M = c_{z}/c_{p}$:

$$
(u + c_{z}^{2})/(u + c_{p}^{2}) = c_{z}/c_{p} \quad \Rightarrow \quad (c_{p} - c_{z})(u - c_{z}c_{p}) = 0
$$

Since $c_{p} \ne c_{z}$, this gives $u = c_{z}c_{p}$. Writing $w = \sqrt{c_{z}c_{p}}$, the frequency condition is:

$$
|\nu - 1/\nu | = w
$$

The positive solution below the center and the one above it are:

$$
\nu_{\mathrm{low}} = [\sqrt{w^{2} + 4} - w]/2, \quad \nu_{\mathrm{high}} = [\sqrt{w^{2} + 4} + w]/2
$$

Their difference reveals the meaning of the coefficient product:

$$
\nu_{\mathrm{high}} - \nu_{\mathrm{low}} = w = \sqrt{c_{z}c_{p}}
$$

Thus the ratio $c_{z}/c_{p}$ sets center gain, while the square root of their product sets normalized halfway bandwidth. We define Q as the reciprocal of that bandwidth:

$$
Q = 1/(\nu_{\mathrm{high}} - \nu_{\mathrm{low}}) = 1/\sqrt{c_{z}c_{p}}
$$

Larger Q therefore means a narrower correction. At M = 1 the response is flat, so distinct halfway crossings no longer exist.

### Express the coefficients in terms of gain and width

We can now solve for the positive coefficients using the two properties we have derived:

$$
\begin{gathered}
c_{z}/c_{p} = M, \quad c_{z}c_{p} = 1/Q^{2}\\
\Rightarrow \quad c_{z} = \sqrt{M}/Q, \quad c_{p} = 1/(Q\sqrt{M})
\end{gathered}
$$

Abbreviating $\sqrt{M}$ as $A$ gives the form we will convert into a digital filter:

$$
H(\Omega_{0}s) = \frac{s^{2} + (A/Q)s + 1}{s^{2} + s/(AQ) + 1}, \quad A = \sqrt{M}
$$

Swapping $c_{z}$ and $c_{p}$ inverts the response. Their ratio becomes 1/M while their product stays unchanged, so matching boost and cut have the same halfway bandwidth.

## 9. Turn the continuous model into delayed samples

We have constructed the continuous response H(S), expressed in normalized form as $H(\Omega_{0}s)$. How can we turn it into a sample recurrence while retaining the peak we just designed?

### What did the earlier Euler step approximate?

Section 5 approximated a derivative by [y[n + 1] - y[n]]/T. On the exponential sequence $z^{n}$, this gives a substitution for the derivative multiplier:

$$
S \leftarrow (z - 1)/T
$$

We checked that the follower's response approaches its continuous counterpart as T shrinks. At finite spacing, however, a pure discrete wave $z = e^{j\omega}$ gives:

$$
(e^{j\omega} - 1)/T = (\cos \omega - 1)/T + j \sin (\omega)/T
$$

This generally has a nonzero real part. The continuous frequency response was evaluated on S = jΩ, so the Euler substitution takes us away from that frequency axis. Its effect cannot be described simply as reading the same response curve at a different frequency.

### Try averaging the two endpoint rates

The trapezoid rule offers another approximation. To derive it, let I(t) be the integral of f(t), so I′(t) = f(t). Over an interval T, the change in I is the integral of f. Approximating that area by T times the average of the two endpoint values gives:

$$
I[n] - I[n - 1] \approx (T/2)(f[n] + f[n - 1])
$$

Taking the trapezoid approximation as our discrete integration rule, probe it with $f[n] = z^{n}$ and seek a particular solution I[n] proportional to the same exponential. Both delayed values then acquire the factor $z^{-1}$:

$$
I[n - 1] = z^{-1}I[n], \quad f[n - 1] = z^{-1}f[n]
$$

Substitution into the update collects the integral samples on one side and the input samples on the other:

$$
(1 - z^{-1})I[n] = (T/2)(1 + z^{-1})f[n]
$$

The discrete integrator therefore multiplies this exponential by:

$$
I[n]/f[n] = (T/2) \frac{1 + z^{-1}}{1 - z^{-1}}
$$

In continuous time, a particular integral of $f(t) = e^{St}$ is $I(t) = e^{St}/S$. Its multiplier is 1/S. Replacing that continuous integrator with the discrete one gives:

$$
1/S \leftarrow (T/2) \frac{1 + z^{-1}}{1 - z^{-1}}
$$

Taking reciprocals yields the substitution for S, called the **bilinear transform**:

$$
S \leftarrow (2/T) \frac{1 - z^{-1}}{1 + z^{-1}}
$$

As a consistency check, hold a continuous exponential $e^{St}$ fixed and sample it at spacing T, so $z = e^{ST}$. We expect the discrete derivative multiplier to approach S as T shrinks, and it does:

$$
(2/T)(1 - e^{-ST})/(1 + e^{-ST}) \quad \to \quad S \quad \text{as} \quad T \to 0
$$

This validates the continuous limit. To understand what happens at finite spacing, we again evaluate the substitution on the frequency circle.

### The frequency circle now maps to the frequency axis

For $z = e^{j\omega}$, factoring out $e^{-j\omega /2}$ from the numerator and denominator gives:

$$
\begin{gathered}
(1 - e^{-j\omega})/(1 + e^{-j\omega})\\
= [2j \sin (\omega /2)]/[2 \cos (\omega /2)] = j \tan (\omega /2)
\end{gathered}
$$

The mapped rate is purely imaginary. Thus the discrete filter samples the continuous frequency response along its original axis, with a changed frequency coordinate:

$$
S = j\Omega (\omega), \quad \Omega (\omega) = (2/T) \tan (\omega /2)
$$

For 0 ≤ ω < π, this mapping increases from zero to infinity. It preserves the sequence of response values, including the single peak or dip and its amplitude, while stretching their spacing along the frequency axis. This is **frequency warping**. The high-frequency analog limit becomes the digital endpoint at ω = π.

### Optional note: preservation of decay

The mapping also takes continuous poles in the left half-plane to discrete poles inside the unit circle, so decaying natural modes remain decaying.

## 10. Expand the mapping until the runtime coefficients appear

To obtain sample weights, we expand the substitution from section 9 in powers of the delay $z^{-1}$. The prototype uses $s = S/\Omega_{0}$, and the center is $\Omega_{0} = (2/T)\tan(\omega_{0}/2)$. Substituting both expressions gives:

$$
\begin{gathered}
s = S/\Omega_{0} \quad \leftarrow \quad \frac{2/T}{(2/T) \tan (\omega_{0}/2)} \frac{1 - z^{-1}}{1 + z^{-1}}\\
= \cot (\omega_{0}/2) \frac{1 - z^{-1}}{1 + z^{-1}}
\end{gathered}
$$

The factors 2/T cancel. Abbreviating the remaining factor as $K = \cot(\omega_{0}/2)$ and the delay as $d = z^{-1}$ leaves:

$$
s \leftarrow K(1-d)/(1+d)
$$

The EQ response we constructed in section 8 was:

$$
H(\Omega_{0}s) = \frac{s^{2} + (A/Q)s + 1}{s^{2} + s/(AQ) + 1}, \quad A = \sqrt{M}
$$

The numerator and denominator differ only in the coefficient of s. We can expand $s^{2} + cs + 1$ once, then use c = A/Q for the numerator and c = 1/(AQ) for the denominator. Substituting s ← K(1-d)/(1+d) gives:

$$
s^{2} + cs + 1 \quad \leftarrow \quad \frac{K^{2}(1-d)^{2}}{(1+d)^{2}} + \frac{cK(1-d)}{1+d} + 1
$$

Multiplying the numerator and denominator of the full response by the same factor $(1+d)^{2}$ leaves their ratio unchanged and clears these fractions. Call the resulting polynomial $P_{c}(d)$:

$$
P_{c}(d) = K^{2}(1-d)^{2} + cK(1-d)(1+d) + (1+d)^{2}
$$

Collect the current, one-delay, and two-delay terms:

$$
P_{c}(d) = (K^{2} + cK + 1) + 2(1-K^{2})d + (K^{2} - cK + 1)d^{2}
$$

The full response is a ratio of two such polynomials, so dividing each by the same constant $K^{2} + 1$ leaves that ratio unchanged. For either polynomial, this gives:

$$
P_{c}(d)/(K^{2} + 1) = [1 + cK/(K^{2} + 1)] + [2(1-K^{2})/(K^{2} + 1)]d + [1 - cK/(K^{2} + 1)]d^{2}
$$

This scale is useful because the remaining fractions satisfy these identities:

$$
\begin{gathered}
K/(K^{2}+1) = \sin (\omega_{0})/2\\
(1-K^{2})/(1+K^{2}) = -\cos (\omega_{0})
\end{gathered}
$$

Substituting them gives:

$$
P_{c}(d)/(K^{2} + 1) = [1 + c \sin (\omega_{0})/2] - 2\cos (\omega_{0})d + [1 - c \sin (\omega_{0})/2]d^{2}
$$

For the numerator, $c = A/Q$, and for the denominator, $c = 1/(AQ)$. Abbreviating $\sin(\omega_{0})/(2Q)$ as α gives the two polynomials:

$$
P_{A/Q}(d)/(K^{2} + 1) = (1 + \alpha A) - 2\cos (\omega_{0})d + (1 - \alpha A)d^{2}
$$

$$
P_{1/(AQ)}(d)/(K^{2} + 1) = (1 + \alpha /A) - 2\cos (\omega_{0})d + (1 - \alpha /A)d^{2}
$$

The digital response is their ratio, with $d = z^{-1}$:

$$
H_{d}(z) = \frac{(1 + \alpha A) - 2\cos (\omega_{0})z^{-1} + (1 - \alpha A)z^{-2}}{(1 + \alpha /A) - 2\cos (\omega_{0})z^{-1} + (1 - \alpha /A)z^{-2}}
$$

This has the form $(b_{0} + b_{1}z^{-1} + b_{2}z^{-2})/(a_{0} + a_{1}z^{-1} + a_{2}z^{-2})$. The coefficients are now the weights of the displayed powers of $z^{-1}$.

### The five numbers return to the sample loop

For the implementation's center frequency $f_{0}$ in hertz, $\omega_{0} = 2\pi f_{0}T = 2\pi f_{0}/F_{s}$, where $F_{s} = 1/T$.

The sample loop needs y[n] explicitly on the left. Dividing every coefficient by $a_{0}$ makes its coefficient one and leaves five normalized weights:

$$
\begin{gathered}
y[n] = \beta_{0}x[n] + \beta_{1}x[n - 1] + \beta_{2}x[n - 2]\\
- \gamma_{1}y[n - 1] - \gamma_{2}y[n - 2]
\end{gathered}
$$

With $\beta_{i} = b_{i}/a_{0}$ and $\gamma_{i} = a_{i}/a_{0}$, the coefficients computed from $f_{0}$, M, Q, and $F_{s}$ are:

$$
\omega_{0} = 2\pi f_{0}/F_{s}, \quad A = \sqrt{M}, \quad \alpha = \sin (\omega_{0})/(2Q)
$$

$$
\begin{gathered}
\beta_{0} = (1 + \alpha A)/(1 + \alpha /A)\\
\beta_{1} = -2\cos (\omega_{0})/(1 + \alpha /A)\\
\beta_{2} = (1 - \alpha A)/(1 + \alpha /A)
\end{gathered}
$$

$$
\begin{gathered}
\gamma_{1} = -2\cos (\omega_{0})/(1 + \alpha /A)\\
\gamma_{2} = (1 - \alpha /A)/(1 + \alpha /A)
\end{gathered}
$$

### A numerical example of the DSP weights

Consider a 1 kHz center, +6 dB gain, and Q = 1 at a 48 kHz sample rate. The gain knob corresponds to amplitude ratio M = 1.995262. Substituting these settings into the formulas above gives $\omega_{0} = 0.130900$, A = 1.412538, and α = 0.065263.

The five weights used in the sample loop are, rounded to six decimal places:

$$
\begin{gathered}
\beta_{0} = 1.043953, \quad \beta_{1} = -1.895321, \quad \beta_{2} = 0.867722\\
\gamma_{1} = -1.895321, \quad \gamma_{2} = 0.911675
\end{gathered}
$$

With those values substituted, the recurrence is:

$$
\begin{gathered}
y[n] \approx 1.043953x[n] - 1.895321x[n - 1] + 0.867722x[n - 2]\\
+ 1.895321y[n - 1] - 0.911675y[n - 2]
\end{gathered}
$$

Formula convention: Robert Bristow-Johnson's [Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/). Runtime reference: [toy-midi eq.ts at 4c36ca47](https://github.com/hi-ogawa/toy-midi/blob/4c36ca479f4c4fa565d6ecc4b07f7fc29f2600fa/src/lib/dsp/eq.ts#L156).
