import { Dialog } from "./ui/dialog";
import type { UseMidiDeviceResult } from "./use-midi-device";

const OFF_VALUE = "off";

export function MidiDeviceDialog({
  isOpen,
  onClose,
  midiDevice,
}: {
  isOpen: boolean;
  onClose: () => void;
  midiDevice: UseMidiDeviceResult;
}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="MIDI Device">
      <MidiDeviceContent midiDevice={midiDevice} />
    </Dialog>
  );
}

function MidiDeviceContent({
  midiDevice: { devices, deviceId, isAccessDenied, selectDevice },
}: {
  midiDevice: UseMidiDeviceResult;
}) {
  if (devices) {
    const options = [{ id: OFF_VALUE, name: "Off" }, ...devices];
    return (
      <div className="space-y-3 text-sm">
        <div
          role="radiogroup"
          aria-label="MIDI Device"
          className="flex flex-col gap-2"
        >
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-2 text-neutral-100"
            >
              <input
                type="radio"
                name="midi-device"
                checked={(deviceId ?? OFF_VALUE) === option.id}
                onChange={() =>
                  selectDevice(option.id === OFF_VALUE ? undefined : option.id)
                }
              />
              {option.name}
            </label>
          ))}
        </div>
        {devices.length === 0 && (
          <p role="status" className="text-xs text-neutral-400">
            No MIDI devices found. A device appears here once you connect it.
          </p>
        )}
      </div>
    );
  }
  return (
    <p role="status" className="text-sm text-neutral-400">
      {isAccessDenied
        ? "MIDI access was denied. Allow it in your browser's site settings, then open this dialog again."
        : "Waiting for MIDI access…"}
    </p>
  );
}
