# Legacy project conversion

Use **Convert to recorder** on a MIDI project in the project list to open a new recorder copy. The original project and its audio assets remain available. Converting again creates another copy.

The recorder's **Import project** action accepts native recorder archives and legacy v1/v2 `.toymidi` archives. Archive type comes from the manifest. Importing a legacy archive into the recorder does not add files to the legacy asset store.

Conversion preserves:

- Notes, velocity, tab annotations, tuning, key signature, and MIDI program in one MIDI track.
- Tempo, time signature, and locators.
- Master, MIDI, audio, and metronome gains, plus track mute and solo.
- Audio track order, names, and timeline offsets.

Encoded audio is decoded to 48 kHz PCM with all channels retained. The recorder uses the decoded duration. Missing or undecodable audio fails conversion with the track name before a recorder copy is saved.

Viewport position, zoom, grid snap, linked audio offsets, and metronome enabled state are not transferred because the recorder does not persist equivalent project fields. Global recorder preferences, including auto-scroll, stay unchanged. The recorder's empty recording track and other new settings use recorder defaults.
