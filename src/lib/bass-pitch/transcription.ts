// Wire contract of the grid-guided bass transcription wasm module. Field
// names are snake_case because these serialize directly to the Rust `Params`
// and `Note` structs in crates/bass-pitch.
export interface GridTranscribeParams {
  start: number;
  offset: number;
  bpm: number;
  cells_per_beat: number;
  grid_origin: number;
  activity_off_db: number;
  activity_on_db: number;
  activity_pitch: number;
  fmin: number;
  fmax: number;
  boundary_onset_threshold: number;
  sample_rate: number;
  frame_length: number;
  hop_length: number;
}

export interface GridTranscribedNote {
  pitch: number;
  project_start: number;
  project_end: number;
  first_cell: number;
  last_cell: number;
}

// Defaults mirror the evaluated CLI baseline in docs/bass-pitch/evaluation.md.
export const DEFAULT_GRID_ACTIVITY_DB = -25;
export const DEFAULT_GRID_SPLIT_THRESHOLD = 0.4;

export function makeGridTranscribeParams({
  offset,
  bpm,
  cellsPerBeat,
  activityDb,
  splitThreshold,
}: {
  offset: number;
  bpm: number;
  cellsPerBeat: number;
  activityDb: number;
  splitThreshold: number;
}): GridTranscribeParams {
  return {
    start: 0,
    offset,
    bpm,
    cells_per_beat: cellsPerBeat,
    grid_origin: 0,
    activity_off_db: activityDb,
    activity_on_db: activityDb,
    activity_pitch: 36,
    fmin: 30,
    fmax: 400,
    boundary_onset_threshold: splitThreshold,
    sample_rate: 22050,
    frame_length: 2048,
    hop_length: 256,
  };
}
