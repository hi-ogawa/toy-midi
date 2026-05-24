# Score Model and Renderer Scope

## Problem Context

Explore a future MIDI-to-score renderer as a focused extension of the transcription workflow.

The current real workflow is:

1. Transcribe bass in toy-midi.
2. Export MIDI.
3. Import that MIDI into MuseScore.
4. Let MuseScore infer normal notation.
5. Add a linked part with tab.
6. Manually adjust string/fret choices.
7. Record MuseScore playback with desktop screen recording.

For this use case, MuseScore's MIDI import result is already good enough. The goal is not to solve arbitrary MIDI-to-score inference. The goal is to understand and eventually reproduce the subset of MuseScore's model/render behavior that works for MIDI files produced in this bass transcription workflow.

The new score feature should operate on isolated MIDI data, not toy-midi's internal project or note data structures. The import boundary is MIDI plus user-provided musical assumptions such as time signature, quantization, and related notation settings.

The first concern is not tab notation or video export. The first concern is understanding how workflow MIDI plus import assumptions becomes the notation-level score representation that MuseScore currently infers correctly, then using that representation to render normal score notation.

## Current Scope

1. Research MIDI plus import assumptions to score representation conversion and inference.
2. Define the smallest useful score model for normal notation rendering.
3. Render normal score notation from that model.

## Follow-Up Scope

1. Add tab notation as another view of the score model.
2. Preserve bass-specific metadata such as string/fret information when available.
3. Add video-oriented presentation features such as continuous horizontal layout, autoscroll, and export/recording support.

## Research Questions

- What notation-level structure does MuseScore infer from representative workflow MIDI?
- Which parts of MuseScore's inference are actually needed for the bass transcription cases?
- Which ambiguity should be resolved by explicit user import settings instead of automatic inference?
- What import settings must the score tool ask for before building the score model?
- What is the minimal model needed for readable normal notation?
- Which concepts from existing notation engines are worth borrowing at the model level?
- Survey the MusicXML ecosystem and identify the best path for model validation and rendering experiments.

## Important Boundaries

- Do not start by designing a tab renderer.
- Do not treat raw MIDI alone as sufficient renderer input; import assumptions are part of the input.
- Do not scope this as a MuseScore clone.
- Keep video workflow concerns downstream of model and normal notation rendering.

## Initial Milestone

Produce a research/design note covering:

- MIDI import assumptions.
- Required inference steps.
- Minimal score representation concepts.
- Deferred hard cases.
- Criteria for validating the model through normal notation rendering.

Research note: [2026-05-24-musescore-score-model-research.md](2026-05-24-musescore-score-model-research.md)
