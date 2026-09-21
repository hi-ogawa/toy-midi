# Digital Filters

These articles connect wave motion and feedback to filter response design and the coefficients used by a sample loop. Peaking EQ is the worked example that brings the general ideas together.

The intended reader is comfortable with complex waves and differential equations but new to digital signal processing. We start from simple sample computations and generalize them, using the resulting equations to reconstruct the peaking-EQ design and the coefficients used by the sample loop.

- [Waves, feedback, and transfer functions](transfer-functions.md) develops delays, natural modes, and the relationship between the continuous $s$-plane and sampled $z$-plane.
- [Designing a peaking EQ](peaking-eq.md) constructs a response from center gain and bandwidth requirements.
- [From an analog response to digital coefficients](bilinear-transform.md) explains the bilinear transform and frequency warping, then converts the peaking response into sample-loop coefficients.

Start with transfer functions for the foundations, or go directly to the peaking-EQ design if those ideas are familiar. The bilinear-transform article connects the response design to its digital implementation.

The [original interactive derivation](https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html) presents the full narrative with waveform and filter-response explorers.
