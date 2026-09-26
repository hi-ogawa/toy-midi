// Projects saved before every audio track could record kept their takes on a
// separate Capture track. Loading folds it into audioTracks under this id, and
// it is an ordinary track from then on.
export const RECORDING_TRACK_ID = "__capture__";
