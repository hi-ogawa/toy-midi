# Loudness

A peak meter says how close a signal comes to full scale, but not how loud it sounds. A dense pad and a sparse plucked bass can peak at the same level while one sounds far louder than the other. Streaming services normalize playback by loudness, at around −14 LUFS, and they only turn loud tracks down. A quiet export therefore plays quieter than everything around it, however clean its peaks are.

Export Audio reports the loudness of the mix and of each track, measured the way ITU-R BS.1770 defines it, with loudness range from EBU Tech 3342. The numbers match what ffmpeg's `ebur128` filter prints for the same file. This page explains what goes into them and how to read them.

## Weight the Signal Like an Ear

Loudness starts as mean power, like an RMS meter, but the signal is filtered first. The filter, called K-weighting, is two biquads in series:

- A high shelf of about +4 dB above roughly 1.5 kHz, which models how the head boosts presence frequencies.
- A high-pass around 38 Hz, 6 dB down at that frequency, which models how little the lowest frequencies contribute to perceived loudness.

![K-weighting at 48 kHz is flat through the midrange, about +0.7 dB at 1 kHz, rises to +4 dB above 2 kHz, and falls to −6 dB at 38 Hz and further below.](images/loudness-k-weighting.svg)

BS.1770 publishes the coefficients at 48 kHz. They come from analog prototypes through the bilinear transform, so the meter recomputes them for any sample rate the same way the [digital filter articles](digital-filters/bilinear-transform.md) derive the peaking EQ.

The consequence for mixing is that low end counts for less than a flat meter would show. A bass that reads 7 LU under the mix can still sound full, because much of its energy sits where K-weighting discounts it.

## Add Channels as Power

After weighting, each channel's mean square is added, with left and right weighted equally. Loudness is that sum on a log scale:

$$
L = -0.691 + 10 \log_{10} \sum_c \overline{y_c^2}.
$$

The −0.691 offset cancels K-weighting's gain at 1 kHz, so a full-scale 1 kHz sine in both channels reads 0 LUFS. One LU is one dB, so loudness differences read like fader moves.

Because channels add as power, panning changes loudness when the panner moves energy between channels. The app pans stereo sources with Web Audio's `StereoPannerNode`, which folds one channel into the other rather than attenuating it, so a centered stereo voice gets up to 3 LU louder at hard pan. The meter measures after pan, so the numbers include this.

## Gate Out the Quiet Parts

Integrated loudness is not the mean over the whole file. The signal is cut into 400 ms blocks that overlap by 75%, and two gates decide which blocks count:

1. The absolute gate drops blocks below −70 LUFS, which removes silence.
2. The relative gate takes the mean power of the remaining blocks and drops those more than 10 LU below it.

The integrated value is the mean power of the blocks that pass both gates. This is why a part that rests for half the song reads at its playing level, not at its level averaged over the rests. The countermelody in the catalog song Clichê rests for its first 15 seconds and between phrases, so 36% of its blocks fall under the gate:

![The countermelody's momentary loudness over Clichê. Blocks under the relative gate at −51.1 LUFS are shaded, and its integrated loudness of −40.8 LUFS sits about 2 LU above the plain mean of −42.7 over every block.](images/loudness-gating.svg)

For dense parts the gate barely matters, because almost every block passes it.

## Measure the Range Between Sections

Loudness range (LRA) describes how much the level moves between sections. It uses 3 s short-term windows taken every 100 ms, gated at −70 LUFS and again 20 LU below their mean. LRA is the spread between the 10th and 95th percentiles of what remains, so a brief fill or a single loud hit doesn't widen it.

An LRA near 1 LU means the song sits at one level throughout. Arrangements usually lift a few LU into a chorus, and orchestral pieces can span 10 LU or more. Clichê measures 1.2 LU, which is very flat, and short-term loudness shows why:

![Short-term loudness of Clichê's mix stays in a 1.2 LU band. The melody runs about 2 LU under the mix, the bass 7 to 9 LU below it, and the countermelody 14 to 22 LU below while it plays.](images/loudness-short-term.svg)

The same curves also show what an integrated number hides, which is when each part plays and how its level moves between sections.

## Measure While Rendering

Every statistic above is built from mean power over windows that are whole multiples of 100 ms. A 400 ms block is four consecutive 100 ms segments, and a 3 s window is thirty. The meter therefore only keeps one number per 100 ms, the weighted power summed over channels, and computes the gates and percentiles from that list when asked. A whole song costs a few kilobytes, so the export measures every track in the same offline render as the mix instead of keeping each track's audio.

## Relate Track Loudness to the Mix

Each track is measured after its EQ, gain, pan, mute and solo, and the master gain, so its number describes what it contributes to the exported file. Gain is an exact offset, so 3 dB more on a fader reads 3 LU louder.

Track numbers don't add up to the mix number. The difference between a track and the mix converts to a power share, $`10^{\Delta/10}`$, where −3 LU is about half of the mix, −10 LU a tenth, and −20 LU one percent:

![In Clichê, the melody is 69% of the mix's power at 1.6 LU below it, and the bass 19% at 7.2 LU below. The countermelody is 2%, and hat and ride 0.1%. The shares sum to 103%.](images/loudness-track-share.svg)

Those shares only sum to 100% for uncorrelated parts, and each track is gated on its own, so the sum lands near but not at 100%. This is why the mix is measured from the master rather than derived from the tracks.

Loudness doesn't model masking. A part 18 LU down in its own register can be clear, while one 8 LU down in the melody's register can disappear. Percussion also reads quieter than it sounds, because 400 ms blocks average its transients away. Use track numbers to find parts worth listening to, not as a verdict.

## Find the Peak Between Samples

The samples of a file are not the waveform a converter plays. The analog output passes smoothly through each sample and can crest between two of them, above every sample value. A sine at a quarter of the sample rate, phased so its samples fall halfway between its crests, peaks 3 dB above its largest sample:

![A full-scale sine at a quarter of the sample rate with a 45° phase has every sample at ±0.71, 3 dB below full scale, while the waveform crests at full scale between them.](images/loudness-true-peak.svg)

True peak estimates that crest by upsampling 4x and taking the largest absolute value. The upsampler is a windowed-sinc interpolator, which reconstructs the band-limited waveform the samples describe. An odd-length filter centers a tap on each original sample, so only the three in-between phases need computing, and the original samples count as they are.

The export renders in floating point, so a mix can exceed full scale without distortion until it is written. The WAV file is 16-bit, which clips anything above 0 dBTP, and the dialog warns when the mix peaks there. Lossy encoding also creates overs between samples, which is why delivery targets keep true peak at or below −1 dBTP.

## Aim for a Delivery Level

A common target for music on streaming services is about −14 LUFS integrated with true peak at or below −1 dBTP. The gap between true peak and integrated loudness decides whether master gain alone gets there. With a 12 dB gap, raising the master to −14 LUFS lands the peak at −2 dBTP, which fits. Once the gap passes about 13 dB, as with punchy drums or a dry plucked bass, reaching −14 LUFS needs a limiter.

## References

- [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770), which defines K-weighting, gating, and true peak.
- [EBU Tech 3341](https://tech.ebu.ch/publications/tech3341), with test signals for integrated loudness and true peak.
- [EBU Tech 3342](https://tech.ebu.ch/publications/tech3342), which defines loudness range.
- [libebur128](https://github.com/jiixyj/libebur128), whose K-weighting design at arbitrary sample rates the meter follows.
