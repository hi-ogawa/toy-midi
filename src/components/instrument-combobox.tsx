import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { DRUM_KIT_BANK, DRUM_KITS, GM_PROGRAMS } from "../lib/general-midi";
import type { MidiPreset } from "../lib/recorder/runtime";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

// GM instrument groups for organized display
const INSTRUMENT_GROUPS = [
  { label: "Piano", start: 0, end: 8 },
  { label: "Chromatic Percussion", start: 8, end: 16 },
  { label: "Organ", start: 16, end: 24 },
  { label: "Guitar", start: 24, end: 32 },
  { label: "Bass", start: 32, end: 40 },
  { label: "Strings", start: 40, end: 48 },
  { label: "Ensemble", start: 48, end: 56 },
  { label: "Brass", start: 56, end: 64 },
  { label: "Reed", start: 64, end: 72 },
  { label: "Pipe", start: 72, end: 80 },
  { label: "Synth Lead", start: 80, end: 88 },
  { label: "Synth Pad", start: 88, end: 96 },
  { label: "Synth Effects", start: 96, end: 104 },
  { label: "Ethnic", start: 104, end: 112 },
  { label: "Percussive", start: 112, end: 120 },
  { label: "Sound Effects", start: 120, end: 128 },
] as const;

export function InstrumentCombobox({
  value,
  onValueChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: MidiPreset;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onValueChange: (value: MidiPreset) => void;
}) {
  const [open, setOpen] = useState(false);

  function renderItem(preset: MidiPreset) {
    const label = formatPresetLabel(preset);
    const selected =
      (value.bank ?? 0) === (preset.bank ?? 0) &&
      value.program === preset.program;
    return (
      <CommandItem
        key={label}
        value={label}
        onSelect={() => {
          onValueChange(preset);
          setOpen(false);
        }}
        className="text-xs"
      >
        <CheckIcon
          className={`mr-2 size-4 ${selected ? "opacity-100" : "opacity-0"}`}
        />
        {label}
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid="instrument-select"
          role="combobox"
          aria-label={ariaLabel}
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "h-8 w-44 justify-between gap-1.5 border-neutral-600 bg-neutral-900 px-3 text-sm font-normal text-neutral-100 hover:border-neutral-500 hover:bg-neutral-900",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {formatPresetLabel(value)}
          </span>
          <ChevronsUpDownIcon className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search instruments..." />
          <CommandList>
            <CommandEmpty>No instrument found.</CommandEmpty>
            {INSTRUMENT_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {GM_PROGRAMS.slice(group.start, group.end).map((_, i) =>
                  renderItem({ program: group.start + i }),
                )}
              </CommandGroup>
            ))}
            <CommandGroup heading="Drum Kits">
              {DRUM_KITS.map(({ program }) =>
                renderItem({ bank: DRUM_KIT_BANK, program }),
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function formatPresetLabel({ bank = 0, program }: MidiPreset): string {
  if (bank === DRUM_KIT_BANK) {
    // The synth falls back to the standard kit for a program without a kit.
    const kit = DRUM_KITS.find((kit) => kit.program === program);
    return `Drums ${program}: ${kit?.name ?? DRUM_KITS[0].name}`;
  }
  if (bank !== 0) {
    return `Bank ${bank}, ${program}`;
  }
  return `${program}: ${GM_PROGRAMS[program]}`;
}
