# Discovering Analog Biquad Filter Prototypes

The recorder EQ implements several second-order filters with one sample loop. Their coefficients are commonly presented as a table, but a table hides the interesting question: if we started only with the response we wanted, how would we invent each filter?

This document picks up from the continuous second-order system developed in [Modeling an audio effect as a transfer function](transfer-function-and-peaking-eq.md). We will work through one response at a time, inspect exactly what each requirement decides, and avoid assuming the final filter family in advance.

Our starting point is the general continuous second-order response developed in the companion. After scaling the leading denominator coefficient to one, it has the form

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

We have not chosen a filter family or a special frequency. We still have five free coefficients and can ask which of them are fixed by the response we want.

## Constructing a Low-Pass Response

A low-pass filter preserves low frequencies and attenuates high frequencies. The numerator determines its high-frequency rolloff, while the denominator sets the frequency scale and the shape of the transition.

![Low-pass magnitude response falling from unity toward zero](images/low-pass-response.svg)

_Schematic response. The transition shape depends on $Q$._

### Constrain the Low- and High-Frequency Limits

At the two frequency extremes, this goal means

$$
H(0)=1,
\qquad
H(\infty)=0.
$$

At zero frequency,

$$
H(0)=\frac{c_0}{d_0},
$$

so preserving the low-frequency level requires

$$
c_0=d_0.
$$

At high frequency, divide numerator and denominator by $S^2$:

$$
H(S)
=\frac{c_2+c_1/S+c_0/S^2}{1+d_1/S+d_0/S^2}
\longrightarrow c_2.
$$

For the response to approach zero, we need

$$
c_2=0.
$$

With these values, the response becomes

$$
H(S)=\frac{c_1S+d_0}{S^2+d_1S+d_0}.
$$

### Require Second-Order Rolloff

The coefficient $c_1$ determines how quickly the response falls at high frequencies. If $c_1\ne0$, then

$$
H(S)\sim\frac{c_1S}{S^2}=\frac{c_1}{S}
\qquad (|S|\to\infty).
$$

Its magnitude falls as $1/|S|$. To obtain second-order attenuation, with magnitude falling as $1/|S|^2$, we set

$$
c_1=0.
$$

The low-pass response is then

$$
H(S)=\frac{d_0}{S^2+d_1S+d_0}.
$$

### Identify the Natural Frequency

To identify a frequency scale in the denominator, take $d_0>0$ and temporarily set $d_1=0$:

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

shows the free oscillations $e^{\pm j\Omega_0t}$. They have constant amplitude and angular frequency $\Omega_0$, which gives us the natural frequency of this system.

### Normalize the Frequency Scale

Restore the $d_1S$ term and measure the complex rate relative to $\Omega_0$ by writing

$$
S=\Omega_0s.
$$

Substituting $S=\Omega_0s$ and $d_0=\Omega_0^2$, then dividing numerator and denominator by $\Omega_0^2$, gives

$$
\begin{aligned}
H(\Omega_0s)
&=\frac{d_0}{(\Omega_0s)^2+d_1\Omega_0s+d_0}\\
&=\frac{\Omega_0^2}{\Omega_0^2s^2+d_1\Omega_0s+\Omega_0^2}\\
&=\frac{1}{s^2+(d_1/\Omega_0)s+1}.
\end{aligned}
$$

### Express the Remaining Freedom as Q

For $d_1>0$, evaluate the response at the natural frequency, where $s=j$:

$$
H(j\Omega_0)
=\frac{1}{j(d_1/\Omega_0)}
=-j\frac{\Omega_0}{d_1}.
$$

The magnitude at this frequency is $\Omega_0/d_1$. Write

$$
Q=\frac{\Omega_0}{d_1}.
$$

Substituting $Q$ into the normalized response gives the low-pass prototype:

$$
H(\Omega_0s)=\frac{1}{s^2+s/Q+1}.
$$

### Choose a Flat Passband

The squared magnitude shows how $Q$ shapes the passband. Write $\nu=\Omega/\Omega_0$ for the relative frequency. Substituting $s=j\nu$ gives

$$
\begin{aligned}
|H(j\Omega_0\nu)|^2
&=\frac{1}{(1-\nu^2)^2+\nu^2/Q^2}\\
&=\frac{1}{1+(Q^{-2}-2)\nu^2+\nu^4}.
\end{aligned}
$$

Near zero frequency, the $\nu^2$ term determines how the response leaves unity. When $Q^{-2}>2$, the denominator increases, so the magnitude falls. When $Q^{-2}<2$, the denominator initially decreases, so the magnitude rises above unity before falling, creating a bump in the passband.

To keep the passband as flat as possible near zero frequency, cancel the $\nu^2$ term:

$$
Q^{-2}-2=0,
\qquad
Q=\frac{1}{\sqrt{2}}.
$$

The squared magnitude then becomes

$$
|H(j\Omega_0\nu)|^2=\frac{1}{1+\nu^4}.
$$

At the natural frequency, $\nu=1$, the squared magnitude is $1/2$, so the magnitude is $1/\sqrt{2}\approx0.707$. Our EQ displays this mathematical $Q$ directly, so the flat-passband setting is **$Q\approx0.71$ on the control**. On the response graph, which measures magnitude in dB, the level at the selected frequency is approximately **$-3$ dB**, because $20\log_{10}(1/\sqrt{2})\approx-3.01$. The knob shows a linear ratio, while the graph shows its value in decibels.

This shows how $Q$ shapes the response. Above $1/\sqrt{2}$, a peak develops before the rolloff. At the boundary, the passband is maximally flat. This parameter is conventionally called the **quality factor** and serves as the low-pass resonance control.

The $Q$ knob in an EQ interface also controls the magnitude at the selected frequency. Since that magnitude is $Q$, its level is $20\log_{10}Q$ dB. A value of $Q=1$ therefore means 0 dB at that one frequency, while the surrounding curve has a peak.

This differs from the peaking EQ in the companion, where gain sets the center level and $Q$ sets the width. Here $Q$ controls both the transition shape and the level at the selected frequency, so those two effects change together when we turn the knob.

### Derive the Digital Coefficients

To convert this analog response into a digital filter, use the bilinear substitution from the [peaking-EQ derivation](transfer-function-and-peaking-eq.md#10-expand-the-mapping-until-the-runtime-coefficients-appear). For the requested digital frequency $\omega_0=2\pi f_0/F_s$, it is

$$
s\leftarrow K\frac{1-z^{-1}}{1+z^{-1}},
\qquad
K=\cot\frac{\omega_0}{2}.
$$

This maps the requested digital frequency, $z=e^{j\omega_0}$, to the analog natural frequency, $s=j$. The resulting digital response is

$$
H_d(z)=H\bigl(\Omega_0s(z)\bigr).
$$

Write $d=z^{-1}$ for the delay. The denominator has the quadratic form

$$
s^2+cs+1.
$$

Substituting for $s$ and multiplying by $(1+d)^2$ gives the polynomial

$$
P_c(d)=K^2(1-d)^2+cK(1-d)(1+d)+(1+d)^2.
$$

Expanding and dividing by $K^2+1$, as in the companion, gives

$$
\frac{P_c(d)}{K^2+1}
=\left(1+\frac{c\sin\omega_0}{2}\right)
-2\cos\omega_0d
+\left(1-\frac{c\sin\omega_0}{2}\right)d^2.
$$

For the low-pass denominator, $c=1/Q$. Writing

$$
\alpha=\frac{\sin\omega_0}{2Q}.
$$

puts the scaled denominator in the form

$$
\frac{P_{1/Q}(d)}{K^2+1}
=(1+\alpha)-2\cos\omega_0d+(1-\alpha)d^2.
$$

The analog numerator is one. Multiplying it by $(1+d)^2$ and dividing by the same scale factor gives

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

## Constructing a Low-Shelf Response

The low-pass construction makes the high-frequency response vanish. A low shelf asks for a different destination: preserve high frequencies while changing the level of low frequencies.

![Low-shelf magnitude response transitioning from a boosted level to unity](images/low-shelf-response.svg)

_Schematic response showing a boost, with $M>1$._

### Set the Two Endpoint Levels

The response should now connect two nonzero plateaus:

$$
H(0)=M,
\qquad
H(\infty)=1,
\qquad
M>0.
$$

Here $M>1$ boosts low frequencies and $0<M<1$ cuts them. Return to the general second-order response:

$$
H(S)=\frac{c_2S^2+c_1S+c_0}{S^2+d_1S+d_0}.
$$

At zero frequency, the ratio of the constant terms sets the level:

$$
H(0)=\frac{c_0}{d_0}=M,
\qquad
c_0=Md_0.
$$

At high frequency, the ratio of the leading coefficients is $c_2$. Preserving that level requires $c_2=1$, so the response becomes

$$
H(S)=\frac{S^2+c_1S+Md_0}{S^2+d_1S+d_0}.
$$

The endpoint levels leave $c_1$, $d_1$, and $d_0$ to determine the transition.

### Choose a Frequency Scale Between the Two Quadratics

For $d_0>0$, substituting $S=j\Omega$ gives

$$
H(j\Omega)=\frac{Md_0-\Omega^2+jc_1\Omega}{d_0-\Omega^2+jd_1\Omega}.
$$

The real parts of the numerator and denominator vanish at $\sqrt{Md_0}$ and $\sqrt{d_0}$, respectively. These give us two frequency scales. Choose $\Omega_0$ halfway between them on a logarithmic frequency axis, which means taking their geometric mean:

$$
\Omega_0=\sqrt{\sqrt{Md_0}\sqrt{d_0}},
\qquad
\Omega_0^2=\sqrt{M}\,d_0.
$$

The factor $\sqrt{M}$ now appears naturally. Abbreviate it as

$$
A=\sqrt{M},
\qquad
d_0=\frac{\Omega_0^2}{A}.
$$

Measure the complex rate relative to this frequency by writing $S=\Omega_0s$. Substituting and dividing both polynomials by $\Omega_0^2$ gives

$$
\begin{aligned}
H(\Omega_0s)
&=\frac{\Omega_0^2s^2+c_1\Omega_0s+M\Omega_0^2/A}{\Omega_0^2s^2+d_1\Omega_0s+\Omega_0^2/A}\\
&=\frac{s^2+(c_1/\Omega_0)s+A}{s^2+(d_1/\Omega_0)s+1/A}.
\end{aligned}
$$

Multiplying both numerator and denominator by $A$ puts the response in the form

$$
H(\Omega_0s)
=A\frac{s^2+(c_1/\Omega_0)s+A}{As^2+(Ad_1/\Omega_0)s+1}.
$$

Write $c_n=c_1/\Omega_0$ and $c_d=Ad_1/\Omega_0$ for the two linear coefficients:

$$
H(\Omega_0s)
=A\frac{s^2+c_n s+A}{As^2+c_d s+1}.
$$

We can now use the response at $s=j$ to relate these coefficients.

### Place the Center Halfway Between the Levels

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

### Choose the Steepest Monotonic Transition

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

### Derive the Digital Coefficients

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
