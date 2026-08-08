use crate::Note;

pub const TICKS_PER_BEAT: u16 = 480;

pub fn seconds_to_ticks(seconds: f64, bpm: f64) -> u32 {
    (seconds * bpm / 60.0 * TICKS_PER_BEAT as f64).round() as u32
}

pub fn midi_bytes(notes: &[Note], bpm: f64) -> Vec<u8> {
    use midly::num::{u15, u24, u28, u4, u7};
    use midly::{
        Format, Header, MetaMessage, MidiMessage, Smf, Timing, TrackEvent, TrackEventKind,
    };

    let mut smf = Smf::new(Header::new(
        Format::Parallel,
        Timing::Metrical(u15::new(TICKS_PER_BEAT)),
    ));
    let tempo = (60_000_000.0 / bpm).round() as u32;
    smf.tracks.push(vec![
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::Tempo(u24::new(tempo))),
        },
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
        },
    ]);
    let mut track = vec![TrackEvent {
        delta: u28::new(0),
        kind: TrackEventKind::Meta(MetaMessage::TrackName(b"Grid-guided bass")),
    }];
    let mut previous_tick = 0u32;
    for note in notes {
        let start_tick = seconds_to_ticks(note.project_start, bpm);
        let end_tick = (start_tick + 1).max(seconds_to_ticks(note.project_end, bpm));
        let key = u7::new(note.pitch.clamp(0, 127) as u8);
        track.push(TrackEvent {
            delta: u28::new(start_tick - previous_tick),
            kind: TrackEventKind::Midi {
                channel: u4::new(0),
                message: MidiMessage::NoteOn {
                    key,
                    vel: u7::new(100),
                },
            },
        });
        track.push(TrackEvent {
            delta: u28::new(end_tick - start_tick),
            kind: TrackEventKind::Midi {
                channel: u4::new(0),
                message: MidiMessage::NoteOff {
                    key,
                    vel: u7::new(0),
                },
            },
        });
        previous_tick = end_tick;
    }
    track.push(TrackEvent {
        delta: u28::new(0),
        kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
    });
    smf.tracks.push(track);
    let mut bytes = Vec::new();
    smf.write(&mut bytes).expect("write midi to memory");
    bytes
}
