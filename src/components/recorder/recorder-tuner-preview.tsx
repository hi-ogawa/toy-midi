import { RecorderTunerContent } from "./recorder-tuner";

export function RecorderTunerPreview() {
  return (
    <div className="w-80 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
      <RecorderTunerContent
        analysis={{
          status: "pitched",
          confidence: 1,
          frequencyHz: 41.28,
          levelDb: -18.4,
        }}
      />
    </div>
  );
}
