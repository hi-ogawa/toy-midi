# Reverb

A sound in a hall reaches a listener first along the straight line from its source and then, over the next second or two, along countless paths that bounce off the walls. Reverb is what those bounces add. For any one source and listener position, a room acts like a filter, so everything it does to a sound is captured by how it responds to a single click, which is its impulse response. Reverberating a sound means convolving it with that response. This document develops that picture and explains why [our implementation](../../src/lib/dsp/reverb.ts), Dattorro's plate, generates a convincing response from a small network of delays instead of storing one.

Throughout, $F_s$ is the sample rate, 48 kHz in the examples.

## Describe a Room by Its Impulse Response

A click in a hall arrives in three stages. The direct sound comes first. A few milliseconds later the first reflections arrive, off the nearest walls, floor, and ceiling, each one a distinct echo. After that, every reflection is reflected again, so the number of echoes arriving per second keeps growing until they overlap into a hiss with no individual echoes left. That **late reverberation** is most of what we hear as reverb.

Each bounce loses a fixed fraction of the sound's energy to the walls and the air, so the late reverberation loses a fixed number of decibels per second, meaning its level is a straight line in dB. The usual measure of how long it lasts is the **decay time** $T_{60}$, the time to fall by 60 dB. A medium hall is around 1.8 s. Walls, seats, and air absorb high frequencies more than low ones, so highs fade sooner and the tail darkens as it decays.

Since a room is a filter, a sound $x$ reverberated by a room with impulse response $h$ is the convolution

$$
y[n]=\sum_k h[k] \cdot x[n-k].
$$

Every input sample starts its own copy of the impulse response, scaled by its value, and the copies add up. It's the same picture as the upsampler's bumps in [Oversampling](oversampling.md#upsample-by-interpolating), except that here each bump is a whole room's echo, two seconds long.

## See Why Convolving Directly Is Costly

At 48 kHz, a 1.8 s impulse response is 86,400 samples, so computing the sum directly takes 86,400 multiplications per output sample and channel. In stereo that's about 8 billion multiplications per second. Convolution reverbs do work this way, using the FFT to make it affordable, but they also need a recorded response for every room, and changing the decay means recording or editing another one.

What makes the late reverberation sound like a room is not its exact samples, though. Once the echoes overlap, the ear hears only a few properties: how quickly the echoes thicken into hiss, how fast the hiss fades, and how much faster its highs fade than its lows. Any response with those properties sounds like a room. So instead of storing a response, a reverb can compute one that has them, with a network that reuses its own output. The plate below does it with about 40 multiplications per sample.

## Make Echoes Decay with a Feedback Delay

The simplest way to make a response that goes on and on is to feed a delay's output back to its input, which is the feedback of [Generalize the Weights and Add Feedback](digital-filters/transfer-functions.md#generalize-the-weights-and-add-feedback) with a long delay $D$:

$$
y[n]=x[n]+g \cdot y[n-D].
$$

A click comes out at once, then again $D$ samples later at $g$, again at $g^2$, and so on, so every trip around the loop lowers the level by the same $-20\log_{10}g$ dB. A level that falls by a fixed amount in each fixed time is exactly the room's straight-line decay, so the loop gives exponential decay for free. The decay time follows from how many trips fit in it,

$$
T_{60}=\frac{60}{-20\log_{10}g} \cdot \frac{D}{F_s},
$$

so setting $g$ sets the decay time.

The trouble is everything else. The echoes are $D$ apart and never get denser, so a long $D$ sounds like a flutter of repeats, and a short $D$ makes the loop ring at the frequencies whose period divides $D$, which sounds metallic. One loop has the decay but none of the density.

## Thicken the Echoes with All-Passes

An **all-pass** is a feedback delay with a feedforward path added, chosen so that it passes every frequency at the same gain:

$$
w[n]=x[n]-g \cdot w[n-D], \qquad y[n]=w[n-D]+g \cdot w[n],
\qquad
H(z)=\frac{g+z^{-D}}{1+g z^{-D}}.
$$

The numerator and denominator have the same magnitude for every $z$ on the unit circle, so $|H|=1$ at every frequency. Its impulse response is still a train of echoes, $g$ at once, then $1-g^2$ at $D$, then $-g(1-g^2)$ at $2D$, and so on, but because the echoes add up to a flat spectrum, it changes when the sound arrives without changing its tone. That's the property a reverb needs, because it scatters a sound in time without coloring it. Chaining all-passes multiplies their echoes, since each echo of the first becomes a whole train in the second, so a few short all-passes turn one click into a dense burst. Reverb designs call this **diffusion**.

An all-pass delays a sound by $D$ samples on average across frequency, but not equally at every frequency. Its delay swings between $D(1-|g|)/(1+|g|)$ and $D(1+|g|)/(1-|g|)$, which for $g=0.5$ is from a third of $D$ to three times $D$. That matters below, where all-passes sit inside a loop.

## Follow a Click Through the Plate

Dattorro's network combines the two ideas. All-passes make the echoes dense, a loop makes them last, and gains inside the loop make them fade. A click passes through it in this order:

$$
\text{pre-delay} \rightarrow \text{input low-pass} \rightarrow \text{4 diffusers} \rightarrow \text{tank} \rightarrow \text{output taps}.
$$

The paper gives every length in samples at 29,761 Hz. They're really durations, so they're rescaled to keep their length in seconds at the actual sample rate.

![The plate's response to a click over the first 150 ms. Nothing comes out during the 20 ms pre-delay, then a few separate echoes arrive, which thicken into dense noise by about 60 ms, differently in the left and right outputs](images/reverb-impulse-onset.svg)

### Delay and Band-Limit the Input

The **pre-delay** holds the whole response back, here by 20 ms. In a hall, it's the gap between the direct sound and the first reflections, and in a mix it keeps a note's attack clear of its own reverb. A one-pole **low-pass** then sets how much high end enters the reverb at all. The paper's default, kept here, lets nearly the full band in.

### Diffuse Before the Tank

Four all-passes, 3.6 to 12.7 ms long, scatter the click into a burst of echoes before it reaches the loop. Without them, a sharp attack would circle the loop as one recognizable click and come back each time as a distinct repeat. With them, what the loop receives is already noise-like, and the first separate echoes in the figure are that burst reaching the outputs, already thickening.

### Circulate in a Figure Eight

The loop, which the paper calls the **tank**, has two halves. Each half runs the sound through an all-pass, a long delay, a damping low-pass, a gain, a second all-pass, a second delay, and another gain, and then feeds it into the other half, so the sound traces a figure eight through both. The input enters both halves at once. A full trip around the figure eight takes about 0.73 s, and every trip passes through four more all-passes, so the echoes keep multiplying as the response goes on, much as a room's reflections do.

The tank's delays differ from each other and share no common period, so the loop's echoes don't line up into a repeating pattern. The paper also slowly varies two of the tank's all-pass lengths to break up its resonances further. Our implementation leaves that modulation out.

### Set the Decay Time

A trip around the figure eight passes four gains, two in each half, so it lowers the level by $-80\log_{10}g$ dB in $T\approx0.73$ s, counting the all-passes by their average delay. Like the single loop above, the decay time is then

$$
T_{60}=\frac{60}{-80\log_{10}g} \cdot T,
\qquad\text{so}\qquad
g=10^{-3T/(4T_{60})}.
$$

For 1.8 s that gives $g\approx0.50$, which is also the paper's default.

Measured from the impulse response, the low frequencies take about 1.96 s to fall 60 dB, about 9% longer. That's the all-passes' uneven delay. A sound at a frequency where the tank's all-passes delay longer takes longer to go around, but it still loses the same amount per trip, so it fades more slowly. The tail's last energy sits at those frequencies, which stretches the measured decay. With the tank's all-passes switched off, the same gain measures 1.79 s.

### Damp the Highs

The damping low-pass in each half is a one-pole filter with its cutoff at 6 kHz. It barely touches low frequencies, but at 8 kHz it takes away about 4 dB on each half, so 8 dB on each trip around the figure eight, on top of the gains. Highs therefore lose more per trip and fade faster, as they do in a hall, and the tail grows darker as it decays:

![The energy still to come after each moment of the response, by octave band, as straight lines in dB. 250 Hz and 1 kHz fall 60 dB in about 1.95 s, 4 kHz in 1.74 s, and 8 kHz in 1.50 s](images/reverb-decay-bands.svg)

| Octave band | Decay time |
| ----------- | ---------- |
| 250 Hz      | 1.96 s     |
| 1 kHz       | 1.95 s     |
| 4 kHz       | 1.74 s     |
| 8 kHz       | 1.50 s     |

The lines are straight because each trip takes off the same number of dB, which is the exponential decay the single loop showed, now on a dense response.

### Tap Two Uncorrelated Outputs

The input is mono, a send bus summed into one signal, and the stereo image comes from the tank. Each output adds up seven points along the tank's delays, from both halves, with alternating signs, and the left and right outputs use different points. They hear the same circulating sound, so they decay alike, but at any moment they sum different echoes, so their waveforms are unrelated. Measured on the impulse response from 50 ms on, their correlation is about 0. Two ears receiving the same decay with unrelated waveforms hear the reverb as surrounding them rather than coming from one point, which is what a real room's reflections do, arriving from every direction.

## References

- J. Dattorro, [Effect Design, Part 1: Reverberator and Other Filters](https://ccrma.stanford.edu/~dattorro/EffectDesignPart1.pdf), J. Audio Eng. Soc., vol. 45, no. 9, 1997, the plate network, its default parameters, and its output taps
- M. R. Schroeder, "Natural Sounding Artificial Reverberation", J. Audio Eng. Soc., vol. 10, no. 3, 1962, the feedback delay and the all-pass as reverb building blocks
- M. R. Schroeder, "New Method of Measuring Reverberation Time", J. Acoust. Soc. Am., vol. 37, 1965, measuring the decay from the energy still to come, as the decay figure and the tests do
- J. O. Smith, [Artificial Reverberation](https://ccrma.stanford.edu/~jos/pasp/Artificial_Reverberation.html), in _Physical Audio Signal Processing_, the all-pass, the feedback delay, and the networks built from them
- [Reverb landscape](https://gist.github.com/hi-ogawa-agent/a1f910fea4abb6aa032196b991d3a864), what reverb is, its algorithms, and how mixes use it, which led to choosing this plate
