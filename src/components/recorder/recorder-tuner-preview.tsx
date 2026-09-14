import { RecorderTunerContent } from "./recorder-tuner";

export function RecorderTunerPreview() {
  return (
    <div className="w-80 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
      <RecorderTunerContent
        result={{
          status: "pitched",
          note: "E",
          octave: 1,
          cents: 3,
          frequencyHz: 41.28,
          levelDb: -18.4,
        }}
        referenceFrequencyHz={440}
      />
    </div>
  );
}
