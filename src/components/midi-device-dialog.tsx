import { Dialog } from "./ui/dialog";
import type { UseMidiDeviceResult } from "./use-midi-device";

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
    return (
      <div className="space-y-3">
        <label className="block text-xs font-medium text-neutral-400">
          Device
          <select
            value={deviceId ?? ""}
            onChange={(event) =>
              selectDevice(event.currentTarget.value || undefined)
            }
            className="mt-1 h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-100"
          >
            <option value="">Off</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
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
