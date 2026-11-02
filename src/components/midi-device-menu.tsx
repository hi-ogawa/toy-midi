import { KeyboardMusicIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";
import type { UseMidiDeviceResult } from "./use-midi-device";

const OFF_VALUE = "off";

export function MidiDeviceMenu({
  midiDevice: { devices, deviceId, isSupported, requestAccess, selectDevice },
}: {
  midiDevice: UseMidiDeviceResult;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={!isSupported}
          title={
            isSupported
              ? "MIDI Device"
              : "MIDI devices aren't supported in this browser"
          }
          aria-label="MIDI Device"
          className={cn(
            "size-9",
            deviceId
              ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
              : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
          )}
        >
          <KeyboardMusicIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {devices ? (
          <DropdownMenuRadioGroup
            value={deviceId ?? OFF_VALUE}
            onValueChange={(value) =>
              selectDevice(value === OFF_VALUE ? undefined : value)
            }
          >
            <DropdownMenuRadioItem value={OFF_VALUE}>Off</DropdownMenuRadioItem>
            {devices.map((device) => (
              <DropdownMenuRadioItem key={device.id} value={device.id}>
                {device.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuItem onSelect={() => requestAccess()}>
            Allow MIDI access
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
