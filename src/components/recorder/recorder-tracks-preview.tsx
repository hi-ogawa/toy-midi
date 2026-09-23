import {
  AudioWaveformIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  CircleStopIcon,
  HeadphonesIcon,
  LoaderCircleIcon,
  MicIcon,
  MicOffIcon,
  MoreVerticalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  SlidersVerticalIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { openFilePicker } from "../file-drop-input";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { RecorderEffectsToggle } from "./recorder-effects-toggle";
import { RecorderMixToggle } from "./recorder-mix-toggle";

// Interactive mockup for the unified recorder track UI (#464). Permission,
// devices, audio, and recording are simulated; only the interaction model is
// under evaluation.

type Variant =
  | "header-input"
  | "row-input"
  | "record-destination"
  | "input-dock"
  | "input-panel";
type Permission = "prompt" | "granted" | "denied";
type RowLayout = "compact" | "one-line" | "name-menu" | "two-line";
type InputStatus = "closed" | "opening" | "open";

type MockClip = {
  id: string;
  name: string;
  start: number;
  end: number;
  muted: boolean;
};

type MockAudioTrack = {
  kind: "audio";
  id: string;
  name: string;
  clips: MockClip[];
  nextTake: number;
  muted: boolean;
  soloed: boolean;
};

type MockMidiTrack = {
  kind: "midi";
  id: string;
  name: string;
  notes: { start: number; end: number; pitch: number }[];
  muted: boolean;
  soloed: boolean;
};

type MockTrack = MockAudioTrack | MockMidiTrack;

type Scenario = {
  id: string;
  label: string;
  permission: Permission;
  inputStatus: InputStatus;
  armedId?: string;
};

const TIMELINE_BARS = 16;
const TRACK_HEIGHT = 76;
const TWO_LINE_TRACK_HEIGHT = 96;
const ROW_INPUT_TRACK_HEIGHT = 124;
const TAKE_HEIGHT = 48;
const MOCK_DEVICES = ["Scarlett 2i2 USB", "MacBook Pro Microphone"];

const VARIANTS: { id: Variant; label: string; summary: string }[] = [
  {
    id: "header-input",
    label: "A · Header input + row arm",
    summary:
      "Input is one global header control. R on an audio row only chooses where the next take goes, and arming turns input on when needed. Monitoring and the tuner live in the input popover and work without arming.",
  },
  {
    id: "row-input",
    label: "B · Input on armed row",
    summary:
      "The #519 direction. The armed row grows and hosts the route, meter, monitoring, and tuner. With nothing armed, input is reachable only through More → Configure input.",
  },
  {
    id: "record-destination",
    label: "C · Record destination menu",
    summary:
      "No per-row arm. The Record button carries a destination menu, including a new track. Rows only show a marker on the destination. Input is the same header control as A.",
  },
  {
    id: "input-dock",
    label: "D · Input dock + row arm",
    summary:
      "A refined. Input lives in an always-visible bar docked at the bottom, with the meter, monitoring, an inline tuner readout, and the device latency one click away. Track controls only gain R, and the header keeps only Record. Per-track meters are left for a later unified output-meter pass.",
  },
  {
    id: "input-panel",
    label: "E · Input panel + row arm",
    summary:
      "A mini panel that stays open until closed, like Mixer and Reference video but only as large as A's popover. It holds on/off, the meter, and a Tuner toggle that opens the existing separate tuner panel. Monitoring is per track: a headphones toggle next to R routes input through that track's EQ and gain. The route is a read-only label that opens Audio input settings, a modal for per-device configuration: device, channel, latency compensation with Measure, and diagnostics. The header Input button behaves like the other panel toggles and only turns orange while microphone access is required. Bootstrap stays as today: grant access, then turn input on.",
  },
];

const ROW_LAYOUTS: { id: RowLayout; label: string; summary: string }[] = [
  {
    id: "compact",
    label: "Compact one line",
    summary:
      "Keeps today's row height. The five toggles shrink from 28px to 24px, ⋮ becomes a borderless icon right after the name so it reads as track actions rather than another toggle, and the track column widens from 15rem to 17rem.",
  },
  {
    id: "two-line",
    label: "Two lines",
    summary:
      "The name and ⋮ get their own line. Input controls (R, 🎧) sit left and mix controls (M, S, FX) sit right on the second line, above the fader. Rows grow from 76px to 96px. The fader is where a future per-track meter can live, shown here behind monitored faders.",
  },
  {
    id: "name-menu",
    label: "Name as menu",
    summary:
      "The track name becomes the menu trigger, so ⋮ disappears and one line fits R, 🎧, M, S, and FX. Row height is unchanged, but names are still short and the menu is less discoverable.",
  },
  {
    id: "one-line",
    label: "One line (too tight)",
    summary:
      "Today's single line with 🎧 added. Names truncate to a few letters.",
  },
];

const SCENARIOS: Scenario[] = [
  {
    id: "first-visit",
    label: "First visit",
    permission: "prompt",
    inputStatus: "closed",
  },
  {
    id: "returning",
    label: "Permission granted, input off",
    permission: "granted",
    inputStatus: "closed",
  },
  {
    id: "ready",
    label: "Bass armed, input on",
    permission: "granted",
    inputStatus: "open",
    armedId: "bass",
  },
  {
    id: "blocked",
    label: "Microphone blocked",
    permission: "denied",
    inputStatus: "closed",
  },
];

const DECISIONS: { topic: string; values: Record<Variant, string> }[] = [
  {
    topic: "Choosing the destination",
    values: {
      "header-input": "R toggle on every audio row, exclusive.",
      "row-input": "R toggle on every audio row, exclusive.",
      "record-destination":
        "Record ▾ menu lists audio tracks and New audio track.",
      "input-dock": "R toggle on every audio row, exclusive.",
      "input-panel": "R toggle on every audio row, exclusive.",
    },
  },
  {
    topic: "Input on/off",
    values: {
      "header-input":
        "Opens on demand (arm, Record, monitoring, tuner). Off from the popover.",
      "row-input": "Opens when arming. Off by disarming or from the row.",
      "record-destination":
        "Opens on demand (destination, Record, monitoring, tuner).",
      "input-dock":
        "Opens on demand (arm, Record, monitoring, tuner). Off from the dock.",
      "input-panel":
        "As today: grant access, then turn input on or off from the panel.",
    },
  },
  {
    topic: "Route, meter, monitoring, tuner",
    values: {
      "header-input": "Header chip and popover. Armed row adds a thin meter.",
      "row-input": "Inside the armed row only.",
      "record-destination": "Header chip and popover.",
      "input-dock":
        "Bottom dock, always visible. Tuner reads inline. Rows have no meter.",
      "input-panel":
        "Mini panel: on/off, meter, Tuner. Route label opens a settings modal for device, channel, latency, diagnostics.",
    },
  },
  {
    topic: "Tuner without arming",
    values: {
      "header-input": "Yes.",
      "row-input": "No. Arm a track first.",
      "record-destination": "Yes.",
      "input-dock": "Yes.",
      "input-panel": "Yes.",
    },
  },
  {
    topic: "Row layout stability",
    values: {
      "header-input": "Uniform rows. Arming does not resize.",
      "row-input": "Armed row grows, so arming moves rows below it.",
      "record-destination": "Uniform rows with fewest controls.",
      "input-dock": "Uniform rows. Only R is added.",
      "input-panel": "Uniform rows. Only R is added.",
    },
  },
  {
    topic: "Nothing armed",
    values: {
      "header-input": "Record disabled: “Arm a track to record”.",
      "row-input": "Record disabled: “Arm a track to record”.",
      "record-destination": "Record opens the destination menu.",
      "input-dock": "Record disabled: “Arm a track to record”.",
      "input-panel":
        "Record disabled: “Arm a track to record”, or “Turn input on to record”.",
    },
  },
  {
    topic: "Clicks to toggle monitoring or tuner",
    values: {
      "header-input": "Two: open the popover, then toggle.",
      "row-input": "One, but only while a track is armed.",
      "record-destination": "Two: open the popover, then toggle.",
      "input-dock": "One, always visible.",
      "input-panel": "One while the panel is open. Tuner opens its own panel.",
    },
  },
  {
    topic: "Monitoring scope",
    values: {
      "header-input":
        "Global toggle (mock only). Would regress today's monitoring through the Capture channel.",
      "row-input": "Armed row only, through its channel.",
      "record-destination": "Global toggle (mock only). Same regression as A.",
      "input-dock": "Global toggle (mock only). Same regression as A.",
      "input-panel":
        "Per-track 🎧 toggle next to R, through that track's EQ and gain. Several tracks may monitor at once.",
    },
  },
];

function createInitialTracks(): MockTrack[] {
  return [
    {
      kind: "audio",
      id: "backing",
      name: "Backing",
      clips: [
        {
          id: "backing-1",
          name: "backing.wav",
          start: 0,
          end: 16,
          muted: false,
        },
      ],
      nextTake: 1,
      muted: false,
      soloed: false,
    },
    {
      kind: "audio",
      id: "bass",
      name: "Bass",
      clips: [
        { id: "bass-1", name: "Take 1", start: 1, end: 12, muted: false },
        { id: "bass-2", name: "Take 2", start: 4, end: 7, muted: false },
        { id: "bass-3", name: "Take 3", start: 9, end: 13.5, muted: false },
      ],
      nextTake: 4,
      muted: false,
      soloed: false,
    },
    {
      kind: "midi",
      id: "midi",
      name: "MIDI 1",
      notes: Array.from({ length: 22 }, (_, index) => ({
        start: 1 + index * 0.5,
        end: 1.4 + index * 0.5,
        pitch: [0, 3, 5, 7, 5, 3][index % 6],
      })),
      muted: false,
      soloed: false,
    },
    {
      kind: "audio",
      id: "audio-3",
      name: "Audio 3",
      clips: [],
      nextTake: 1,
      muted: false,
      soloed: false,
    },
  ];
}

export function RecorderTracksPreview() {
  const [variant, setVariant] = useState<Variant>("input-panel");
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [resetCount, setResetCount] = useState(0);
  const [rowLayout, setRowLayout] = useState<RowLayout>("compact");
  return (
    <div className="space-y-4">
      <OptionGroup
        label="Candidate"
        options={VARIANTS.map(({ id, label }) => ({ id, label }))}
        value={variant}
        onChange={setVariant}
      />
      <p className="max-w-4xl text-sm leading-6 text-neutral-400">
        {VARIANTS.find((entry) => entry.id === variant)!.summary}
      </p>
      {variant === "input-panel" && (
        <>
          <OptionGroup
            label="Row layout"
            options={ROW_LAYOUTS.map(({ id, label }) => ({ id, label }))}
            value={rowLayout}
            onChange={setRowLayout}
          />
          <p className="max-w-4xl text-sm leading-6 text-neutral-400">
            {ROW_LAYOUTS.find((entry) => entry.id === rowLayout)!.summary}
          </p>
        </>
      )}
      <div className="flex items-center gap-2">
        <OptionGroup
          label="Scenario"
          options={SCENARIOS.map(({ id, label }) => ({ id, label }))}
          value={scenario.id}
          onChange={(id) => {
            setScenario(SCENARIOS.find((entry) => entry.id === id)!);
            setResetCount((count) => count + 1);
          }}
        />
        <button
          type="button"
          onClick={() => setResetCount((count) => count + 1)}
          className="ml-2 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
        >
          Reset
        </button>
      </div>
      {/* Candidates share state so the same situation can be compared across them. */}
      <MockRecorder
        key={`${scenario.id}-${resetCount}`}
        variant={variant}
        scenario={scenario}
        rowLayout={variant === "input-panel" ? rowLayout : "one-line"}
      />
      <DecisionTable variant={variant} />
    </div>
  );
}

function OptionGroup<Id extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: Id; label: string }[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="w-20 text-xs text-neutral-500">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MockRecorder({
  variant,
  scenario,
  rowLayout,
}: {
  rowLayout: RowLayout;
  variant: Variant;
  scenario: Scenario;
}) {
  const [tracks, setTracks] = useState(createInitialTracks);
  const [armedId, setArmedId] = useState(scenario.armedId);
  const [permission, setPermission] = useState(scenario.permission);
  const [inputStatus, setInputStatus] = useState(scenario.inputStatus);
  const [pendingPrompt, setPendingPrompt] = useState<{
    grantOnly?: boolean;
    onReady?: () => void;
  }>();
  const [notice, setNotice] = useState<string>();
  const [device, setDevice] = useState(MOCK_DEVICES[0]);
  const [channel, setChannel] = useState(1);
  const [latencyMs] = useState(12.5);
  const [inputPanelOpen, setInputPanelOpen] = useState(
    scenario.inputStatus === "open",
  );
  const [monitoring, setMonitoring] = useState(false);
  // E monitors per track, through each track's own channel.
  const [monitoredIds, setMonitoredIds] = useState<string[]>([]);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [inputSetupOpen, setInputSetupOpen] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState<{ trackId: string; start: number }>();
  const [expanded, setExpanded] = useState<string[]>(["bass"]);

  const inputOpen = inputStatus === "open";
  const armedTrack = tracks.find((track) => track.id === armedId);
  const audioTracks = tracks.filter(
    (track): track is MockAudioTrack => track.kind === "audio",
  );

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      setPlayhead((position) => {
        const next = position + 0.05;
        return next >= TIMELINE_BARS ? 0 : next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [playing]);

  function openInput(onReady?: () => void) {
    if (inputStatus === "open") {
      onReady?.();
      return;
    }
    if (inputStatus === "opening") {
      return;
    }
    if (permission === "denied") {
      setNotice(
        "Microphone access is blocked. Allow it from the browser’s site settings, then try again.",
      );
      return;
    }
    if (permission === "prompt") {
      setPendingPrompt({ onReady });
      return;
    }
    startOpening(onReady);
  }

  function startOpening(onReady?: () => void) {
    setInputStatus("opening");
    window.setTimeout(() => {
      setInputStatus("open");
      onReady?.();
    }, 700);
  }

  function closeInput() {
    setInputStatus("closed");
    setMonitoring(false);
    setMonitoredIds([]);
    setTunerOpen(false);
  }

  // E keeps today's bootstrap: grant access, then turn input on explicitly.
  // The other candidates open input on demand.
  const onDemandInput = variant !== "input-panel";

  function grantAccess() {
    setPendingPrompt({ grantOnly: true });
  }

  function selectDestination(id?: string) {
    if (pending) {
      return;
    }
    setArmedId(id);
    if (id && onDemandInput) {
      openInput();
    } else if (variant === "row-input") {
      // Input belongs to the armed row, so disarming closes it.
      closeInput();
    }
  }

  function startRecording(trackId: string) {
    openInput(() => {
      setPlaying(true);
      setPending({ trackId, start: playhead });
    });
  }

  function stopRecording() {
    if (!pending) {
      return;
    }
    const end = Math.max(playhead, pending.start);
    if (end - pending.start > 0.25) {
      updateAudioTrack(pending.trackId, (track) => ({
        ...track,
        nextTake: track.nextTake + 1,
        clips: [
          ...track.clips,
          {
            id: crypto.randomUUID(),
            name: `Take ${track.nextTake}`,
            start: pending.start,
            end,
            muted: false,
          },
        ],
      }));
    }
    setPending(undefined);
  }

  function updateAudioTrack(
    id: string,
    update: (track: MockAudioTrack) => MockAudioTrack,
  ) {
    setTracks((tracks) =>
      tracks.map((track) =>
        track.id === id && track.kind === "audio" ? update(track) : track,
      ),
    );
  }

  function updateTrack(id: string, update: Partial<MockTrack>) {
    setTracks((tracks) =>
      tracks.map((track) =>
        track.id === id ? ({ ...track, ...update } as MockTrack) : track,
      ),
    );
  }

  function importAudio({
    trackId,
    name,
    start,
  }: {
    trackId: string;
    name: string;
    start: number;
  }) {
    updateAudioTrack(trackId, (track) => ({
      ...track,
      clips: [
        ...track.clips,
        {
          id: crypto.randomUUID(),
          name,
          start,
          end: Math.min(TIMELINE_BARS, start + 8),
          muted: false,
        },
      ],
    }));
  }

  function removeTrack(id: string) {
    setTracks((tracks) => tracks.filter((track) => track.id !== id));
    if (armedId === id) {
      selectDestination(undefined);
    }
  }

  function addAudioTrack() {
    const track: MockAudioTrack = {
      kind: "audio",
      id: crypto.randomUUID(),
      name: `Audio ${audioTracks.length + 1}`,
      clips: [],
      nextTake: 1,
      muted: false,
      soloed: false,
    };
    setTracks((tracks) => [...tracks, track]);
    return track.id;
  }

  const recordBlocker =
    variant !== "record-destination" && !armedTrack
      ? "Arm a track to record"
      : !onDemandInput && !inputOpen
        ? "Turn input on to record"
        : undefined;

  const inputControl = {
    status: inputStatus,
    permission,
    device,
    channel,
    monitoring,
    tunerOpen,
    onOpen: () =>
      !onDemandInput && permission === "prompt" ? grantAccess() : openInput(),
    onClose: closeInput,
    onMonitoringChange: (next: boolean) =>
      !onDemandInput
        ? setMonitoring(next)
        : next
          ? openInput(() => setMonitoring(true))
          : setMonitoring(false),
    onTunerChange: (next: boolean) =>
      !onDemandInput
        ? setTunerOpen(next)
        : next
          ? openInput(() => setTunerOpen(true))
          : setTunerOpen(false),
    onSetup: () => setInputSetupOpen(true),
  };

  return (
    <div
      className="relative isolate flex h-[680px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 [contain:layout]"
      style={
        {
          "--track-header-width": rowLayout === "compact" ? "17rem" : "15rem",
        } as React.CSSProperties
      }
    >
      <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4">
        <Button
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          onClick={() => {
            if (playing) {
              stopRecording();
            }
            setPlaying(!playing);
          }}
          className={cn(
            "size-9",
            playing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "hover:bg-neutral-700",
          )}
        >
          {playing ? (
            <PauseIcon className="size-5" />
          ) : (
            <PlayIcon className="size-5" />
          )}
        </Button>
        {variant === "record-destination" ? (
          <RecordDestinationButton
            recording={!!pending}
            destination={armedTrack}
            audioTracks={audioTracks}
            onRecord={(trackId) => startRecording(trackId)}
            onStop={stopRecording}
            onDestinationChange={selectDestination}
            onNewTrack={() => {
              const id = addAudioTrack();
              selectDestination(id);
            }}
          />
        ) : (
          <Button
            aria-label={pending ? "Stop recording" : "Record"}
            aria-pressed={!!pending}
            disabled={!!recordBlocker}
            title={recordBlocker ?? (pending ? "Stop recording" : "Record")}
            onClick={() =>
              pending ? stopRecording() : startRecording(armedId!)
            }
            className={cn(
              "size-9",
              pending
                ? "border-red-500/60 bg-red-500/20 text-red-200"
                : "text-red-400 hover:bg-neutral-700",
            )}
          >
            {pending ? (
              <CircleStopIcon className="size-5" />
            ) : (
              <CircleIcon className="size-4 fill-current" />
            )}
          </Button>
        )}
        {(variant === "header-input" || variant === "record-destination") && (
          <HeaderInputControl {...inputControl} />
        )}
        <div className="mx-1 h-5 w-px bg-neutral-600" />
        <span className="font-mono text-sm tabular-nums text-neutral-300">
          {formatBar(playhead)}
        </span>
        <span className="text-xs text-neutral-500">
          Loop · Punch · BPM 120 · 4/4 · …
        </span>
        <div className="flex-1" />
        <span className="text-sm text-neutral-300">Evening practice</span>
        <div className="h-5 w-px bg-neutral-600" />
        <Button
          aria-label="Reference video (placeholder)"
          className="size-9 text-neutral-500 hover:bg-neutral-700"
        >
          <VideoIcon className="size-5" />
        </Button>
        <Button
          aria-label="Mixer (placeholder)"
          className="size-9 text-neutral-500 hover:bg-neutral-700"
        >
          <SlidersVerticalIcon className="size-5" />
        </Button>
        {variant === "input-panel" && (
          <InputPanelToggle
            permission={permission}
            open={inputPanelOpen}
            onClick={() => setInputPanelOpen(!inputPanelOpen)}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Editor menu"
              className="size-9 hover:bg-neutral-700"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setInputSetupOpen(true)}>
              <Settings2Icon />
              Audio input settings…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tracks.map((track) => {
          if (track.kind === "midi") {
            return (
              <TrackFrame
                key={track.id}
                height={
                  rowLayout === "two-line"
                    ? TWO_LINE_TRACK_HEIGHT
                    : TRACK_HEIGHT
                }
                header={
                  <TrackHeader
                    track={track}
                    layout={rowLayout}
                    onMutedChange={(muted) => updateTrack(track.id, { muted })}
                    onSoloedChange={(soloed) =>
                      updateTrack(track.id, { soloed })
                    }
                    menu={
                      <TrackMenu
                        label={track.name}
                        trigger={
                          rowLayout === "name-menu"
                            ? "name"
                            : rowLayout === "compact"
                              ? "ghost"
                              : "icon"
                        }
                        onRename={(name) => updateTrack(track.id, { name })}
                        onRemove={() => removeTrack(track.id)}
                      />
                    }
                  />
                }
                playhead={playhead}
                onSeek={setPlayhead}
              >
                <MidiNotes notes={track.notes} />
              </TrackFrame>
            );
          }
          const armed = armedId === track.id;
          const recording = pending?.trackId === track.id;
          const hasTakeLanes = track.clips.length >= 2;
          const isExpanded = expanded.includes(track.id);
          const rowInput = variant === "row-input" && armed;
          return (
            <div key={track.id}>
              <TrackFrame
                height={
                  rowInput
                    ? ROW_INPUT_TRACK_HEIGHT
                    : rowLayout === "two-line"
                      ? TWO_LINE_TRACK_HEIGHT
                      : TRACK_HEIGHT
                }
                header={
                  <TrackHeader
                    track={track}
                    layout={rowLayout}
                    metering={
                      variant === "input-panel" &&
                      inputOpen &&
                      monitoredIds.includes(track.id)
                    }
                    marker={
                      variant === "record-destination" && armed ? (
                        <span
                          title="Record destination"
                          className="flex items-center gap-1 rounded bg-red-500/20 px-1 text-[10px] font-semibold text-red-300"
                        >
                          <CircleIcon className="size-2 fill-current" />
                          REC
                        </span>
                      ) : undefined
                    }
                    arm={
                      variant === "record-destination" ? undefined : (
                        <>
                          <ArmToggle
                            armed={armed}
                            disabled={!!pending}
                            label={track.name}
                            onClick={() =>
                              selectDestination(armed ? undefined : track.id)
                            }
                          />
                          {variant === "input-panel" && (
                            <MonitorToggle
                              label={track.name}
                              monitoring={monitoredIds.includes(track.id)}
                              disabled={!inputOpen}
                              onClick={() =>
                                setMonitoredIds((ids) =>
                                  ids.includes(track.id)
                                    ? ids.filter((id) => id !== track.id)
                                    : [...ids, track.id],
                                )
                              }
                            />
                          )}
                        </>
                      )
                    }
                    onMutedChange={(muted) => updateTrack(track.id, { muted })}
                    onSoloedChange={(soloed) =>
                      updateTrack(track.id, { soloed })
                    }
                    menu={
                      <TrackMenu
                        label={track.name}
                        trigger={
                          rowLayout === "name-menu"
                            ? "name"
                            : rowLayout === "compact"
                              ? "ghost"
                              : "icon"
                        }
                        removeDisabled={recording}
                        onImport={() =>
                          openFilePicker({
                            accept: "audio/*,.wav",
                            onFile: (file) =>
                              importAudio({
                                trackId: track.id,
                                name: file.name,
                                start: 0,
                              }),
                          })
                        }
                        onRename={(name) => updateTrack(track.id, { name })}
                        onRemove={() => removeTrack(track.id)}
                      />
                    }
                    footer={
                      rowInput ? (
                        <RowInputControls {...inputControl} />
                      ) : armed &&
                        variant === "header-input" &&
                        inputStatus === "open" ? (
                        <MockMeter active />
                      ) : undefined
                    }
                  />
                }
                playhead={playhead}
                onSeek={setPlayhead}
                onDropFile={({ name, position }) =>
                  importAudio({ trackId: track.id, name, start: position })
                }
              >
                <CompLane
                  clips={track.clips}
                  dimmed={recording}
                  emptyLabel={
                    recording
                      ? undefined
                      : armed
                        ? "Press Record to add a take"
                        : variant === "record-destination"
                          ? "Drop audio here or choose it in Record ▾"
                          : "Drop audio here or arm to record"
                  }
                />
                {recording && pending && (
                  <ClipBox
                    start={pending.start}
                    end={Math.max(playhead, pending.start)}
                    label={`Take ${track.nextTake}`}
                    className="border-red-400/70 bg-red-500/25"
                  />
                )}
              </TrackFrame>
              {hasTakeLanes && (
                <TakesDisclosure
                  count={track.clips.length}
                  expanded={isExpanded}
                  onExpandedChange={(next) =>
                    setExpanded((ids) =>
                      next
                        ? [...ids, track.id]
                        : ids.filter((id) => id !== track.id),
                    )
                  }
                />
              )}
              {hasTakeLanes &&
                isExpanded &&
                track.clips.toReversed().map((clip) => (
                  <TakeLane
                    key={clip.id}
                    clip={clip}
                    playhead={playhead}
                    onSeek={setPlayhead}
                    onMutedChange={(muted) =>
                      updateAudioTrack(track.id, (track) => ({
                        ...track,
                        clips: track.clips.map((entry) =>
                          entry.id === clip.id ? { ...entry, muted } : entry,
                        ),
                      }))
                    }
                    onDelete={() =>
                      updateAudioTrack(track.id, (track) => ({
                        ...track,
                        clips: track.clips.filter(
                          (entry) => entry.id !== clip.id,
                        ),
                      }))
                    }
                  />
                ))}
            </div>
          );
        })}
        <div className="grid grid-cols-[var(--track-header-width)_1fr] border-b border-neutral-800">
          <div className="flex gap-2 border-r border-neutral-700 bg-neutral-800 px-3 py-2">
            <Button
              onClick={addAudioTrack}
              className="h-7 gap-1 border-neutral-600 px-2 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              <PlusIcon className="size-3.5" />
              Audio
            </Button>
            <Button className="h-7 gap-1 border-neutral-600 px-2 text-xs text-neutral-500">
              <PlusIcon className="size-3.5" />
              MIDI
            </Button>
          </div>
        </div>
        {tunerOpen &&
          (inputOpen || variant === "input-panel") &&
          variant !== "input-dock" && (
            <div className="absolute top-3 right-4 z-40 w-48 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
              <div className="flex items-center text-xs text-neutral-400">
                Tuner
                <button
                  aria-label="Close tuner"
                  className="ml-auto"
                  onClick={() => setTunerOpen(false)}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              {inputOpen ? (
                <>
                  <div className="mt-2 text-center font-mono text-2xl">E1</div>
                  <div className="text-center text-xs text-emerald-400">
                    +3¢
                  </div>
                </>
              ) : (
                <div className="mt-2 text-center text-xs text-neutral-500">
                  No input. Turn input on to tune.
                </div>
              )}
            </div>
          )}
      </div>

      {variant === "input-panel" && inputPanelOpen && (
        <InputFloatingPanel
          {...inputControl}
          onPanelClose={() => setInputPanelOpen(false)}
        />
      )}
      {variant === "input-dock" && (
        <InputDock
          {...inputControl}
          latencyMs={latencyMs}
          onDeviceChange={setDevice}
          onChannelChange={setChannel}
        />
      )}
      {pendingPrompt && (
        <div className="absolute top-2 left-4 z-50 w-80 rounded-lg bg-neutral-100 p-4 text-sm text-neutral-900 shadow-2xl">
          <div className="text-xs text-neutral-500">
            Simulated browser prompt
          </div>
          <div className="mt-1 font-medium">
            localhost wants to use your microphones
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              className="rounded border border-neutral-300 px-3 py-1"
              onClick={() => {
                setPermission("denied");
                setPendingPrompt(undefined);
                setNotice(
                  "Microphone access is blocked. Allow it from the browser’s site settings, then try again.",
                );
              }}
            >
              Block
            </button>
            <button
              className="rounded bg-blue-600 px-3 py-1 text-white"
              onClick={() => {
                setPermission("granted");
                setPendingPrompt(undefined);
                if (!pendingPrompt.grantOnly) {
                  startOpening(pendingPrompt.onReady);
                }
              }}
            >
              Allow
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="absolute bottom-14 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-start gap-2 rounded-lg border border-orange-700/60 bg-orange-950/90 px-4 py-3 text-xs text-orange-200 shadow-2xl"
        >
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice(undefined)}>
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
      <Dialog
        isOpen={inputSetupOpen}
        onClose={() => setInputSetupOpen(false)}
        title="Audio input settings"
      >
        <MockInputSetup
          device={device}
          channel={channel}
          permission={permission}
          inputOpen={inputOpen}
          onDeviceChange={setDevice}
          onChannelChange={setChannel}
          onGrant={() => {
            setInputSetupOpen(false);
            if (onDemandInput) {
              openInput();
            } else {
              grantAccess();
            }
          }}
        />
      </Dialog>
    </div>
  );
}

type InputControlProps = {
  status: InputStatus;
  permission: Permission;
  device: string;
  channel: number;
  monitoring: boolean;
  tunerOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onMonitoringChange: (monitoring: boolean) => void;
  onTunerChange: (open: boolean) => void;
  onSetup: () => void;
};

function HeaderInputControl(props: InputControlProps) {
  const { status, permission, device, channel, monitoring } = props;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Input"
          className={cn(
            "h-9 max-w-64 gap-2 border-neutral-600 px-2 text-xs",
            permission === "denied"
              ? "bg-orange-500/10 text-orange-200"
              : "text-neutral-300 hover:bg-neutral-700",
          )}
        >
          {permission === "denied" ? (
            <MicOffIcon className="size-4 shrink-0" />
          ) : status === "opening" ? (
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
          ) : (
            <MicIcon
              className={cn(
                "size-4 shrink-0",
                status === "open" ? "text-emerald-400" : "text-neutral-500",
              )}
            />
          )}
          {permission === "denied" ? (
            "Microphone blocked"
          ) : status === "open" ? (
            <>
              <span className="truncate">
                {device} · Ch {channel}
              </span>
              <MockMeter active className="w-12" />
              {monitoring && (
                <HeadphonesIcon className="size-3.5 shrink-0 text-sky-300" />
              )}
            </>
          ) : status === "opening" ? (
            "Opening input…"
          ) : (
            <span className="text-neutral-500">Input off</span>
          )}
          <ChevronDownIcon className="size-3 shrink-0 text-neutral-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-neutral-700 bg-neutral-800 p-3 text-neutral-100"
      >
        <InputPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}

function InputRouteMenu({
  status,
  permission,
  device,
  channel,
  side,
  className,
  onDeviceChange,
  onChannelChange,
}: {
  status: InputStatus;
  permission: Permission;
  device: string;
  channel: number;
  side: "top" | "bottom";
  className?: string;
  onDeviceChange: (device: string) => void;
  onChannelChange: (channel: number) => void;
}) {
  const blocked = permission === "denied";
  const open = status === "open";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Input route"
          disabled={blocked}
          className={cn(
            "h-7 justify-start gap-2 border-neutral-600 px-2 text-xs text-neutral-300 hover:bg-neutral-700",
            className,
          )}
        >
          {blocked ? (
            <MicOffIcon className="size-4 shrink-0 text-orange-300" />
          ) : status === "opening" ? (
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
          ) : (
            <MicIcon
              className={cn(
                "size-4 shrink-0",
                open ? "text-emerald-400" : "text-neutral-500",
              )}
            />
          )}
          <span
            className={cn(
              "truncate",
              blocked && "text-orange-200",
              !open && !blocked && "text-neutral-500",
            )}
          >
            {blocked
              ? "Microphone blocked"
              : status === "opening"
                ? "Opening input…"
                : `${device} · Ch ${channel}`}
          </span>
          <ChevronDownIcon className="ml-auto size-3 shrink-0 text-neutral-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={side}>
        <DropdownMenuLabel>Device</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={device} onValueChange={onDeviceChange}>
          {MOCK_DEVICES.map((entry) => (
            <DropdownMenuRadioItem key={entry} value={entry}>
              {entry}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Channel</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(channel)}
          onValueChange={(value) => onChannelChange(Number(value))}
        >
          {[1, 2].map((entry) => (
            <DropdownMenuRadioItem key={entry} value={String(entry)}>
              Channel {entry}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InputDock({
  status,
  permission,
  device,
  channel,
  monitoring,
  tunerOpen,
  latencyMs,
  onOpen,
  onClose,
  onMonitoringChange,
  onTunerChange,
  onSetup,
  onDeviceChange,
  onChannelChange,
}: InputControlProps & {
  latencyMs: number;
  onDeviceChange: (device: string) => void;
  onChannelChange: (channel: number) => void;
}) {
  const blocked = permission === "denied";
  const open = status === "open";
  return (
    <section
      aria-label="Input dock"
      className="flex h-10 shrink-0 items-center gap-2 border-t border-neutral-700 bg-neutral-800 px-3 text-xs"
    >
      <InputRouteMenu
        status={status}
        permission={permission}
        device={device}
        channel={channel}
        side="top"
        className="w-56"
        onDeviceChange={onDeviceChange}
        onChannelChange={onChannelChange}
      />
      {blocked ? (
        <span className="flex-1 text-orange-200/80">
          Allow microphone access from the browser’s site settings.
        </span>
      ) : (
        <MockMeter active={open} className="h-2 flex-1" />
      )}
      <PanelToggle
        pressed={monitoring}
        disabled={blocked}
        onClick={() => onMonitoringChange(!monitoring)}
        icon={<HeadphonesIcon className="size-3.5" />}
        label="Monitor"
      />
      <Button
        aria-label="Tuner"
        aria-pressed={tunerOpen}
        disabled={blocked}
        onClick={() => onTunerChange(!tunerOpen)}
        className={cn(
          "h-7 w-32 justify-start gap-1.5 border-neutral-600 px-2 text-xs",
          tunerOpen
            ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/35"
            : "text-neutral-300 hover:bg-neutral-700",
        )}
      >
        <AudioWaveformIcon className="size-3.5" />
        Tuner
        {tunerOpen && open && (
          <span className="ml-auto font-mono">
            E1 <span className="text-emerald-300">+3¢</span>
          </span>
        )}
      </Button>
      <button
        type="button"
        title="Recording latency compensation for this device"
        onClick={onSetup}
        className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
      >
        Latency{" "}
        <span className="font-mono text-neutral-200">{latencyMs} ms</span>
      </button>
      <button
        type="button"
        aria-label="Input setup"
        title="Input setup"
        onClick={onSetup}
        className="grid size-7 place-items-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
      >
        <Settings2Icon className="size-3.5" />
      </button>
      <Button
        aria-pressed={open}
        disabled={blocked || status === "opening"}
        onClick={open ? onClose : onOpen}
        className={cn(
          "h-7 w-24 border-neutral-600 text-xs",
          open
            ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
            : "text-neutral-300 hover:bg-neutral-700",
        )}
      >
        {open ? "Input on" : "Input off"}
      </Button>
    </section>
  );
}

function InputPanelToggle({
  permission,
  open,
  onClick,
}: {
  permission: Permission;
  open: boolean;
  onClick: () => void;
}) {
  const needsAccess = permission !== "granted";
  return (
    <Button
      aria-label="Input"
      aria-pressed={open}
      title={needsAccess ? "Input (microphone access required)" : "Input"}
      onClick={onClick}
      className={cn(
        "size-9",
        needsAccess
          ? "border-orange-300/40 bg-orange-300/10 text-orange-200 hover:bg-orange-300/20"
          : open
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
      )}
    >
      <MicIcon className="size-5" />
    </Button>
  );
}

function InputFloatingPanel({
  status,
  permission,
  device,
  channel,
  tunerOpen,
  onOpen,
  onClose,
  onTunerChange,
  onSetup,
  onPanelClose,
}: InputControlProps & { onPanelClose: () => void }) {
  const blocked = permission === "denied";
  const open = status === "open";
  return (
    <section
      aria-label="Input panel"
      className="absolute right-4 bottom-4 z-40 w-64 rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-neutral-700 py-1.5 pr-1.5 pl-3">
        <h2 className="text-xs font-semibold">Input</h2>
        <button
          type="button"
          aria-label="Close Input"
          onClick={onPanelClose}
          className="ml-auto grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="space-y-2.5 p-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Audio input settings"
            onClick={onSetup}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-neutral-700",
              blocked ? "text-orange-200" : "text-neutral-300",
            )}
          >
            <span className="truncate">
              {blocked
                ? "Microphone blocked"
                : permission === "prompt"
                  ? "No microphone access"
                  : status === "opening"
                    ? "Opening input…"
                    : `${device} · Ch ${channel}`}
            </span>
            <Settings2Icon className="size-3.5 shrink-0 text-neutral-500" />
          </button>
          {permission === "prompt" ? (
            <Button
              onClick={onOpen}
              className="h-6 shrink-0 border-orange-300/40 bg-orange-300/10 px-2 text-[11px] text-orange-200 hover:bg-orange-300/20"
            >
              Allow access
            </Button>
          ) : (
            <Button
              aria-pressed={open}
              disabled={blocked || status === "opening"}
              onClick={open ? onClose : onOpen}
              className={cn(
                "h-6 w-12 shrink-0 border-neutral-600 text-[11px]",
                open
                  ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                  : "text-neutral-300 hover:bg-neutral-700",
              )}
            >
              {open ? "On" : "Off"}
            </Button>
          )}
        </div>
        {blocked ? (
          <p className="leading-5 text-orange-200/80">
            Allow microphone access from the browser’s site settings.
          </p>
        ) : (
          <MockMeter active={open} className="h-1.5" />
        )}
        <div className="grid">
          <PanelToggle
            pressed={tunerOpen}
            disabled={blocked}
            onClick={() => onTunerChange(!tunerOpen)}
            icon={<AudioWaveformIcon className="size-3.5" />}
            label="Tuner"
          />
        </div>
      </div>
    </section>
  );
}

function InputPanel({
  status,
  permission,
  device,
  channel,
  monitoring,
  tunerOpen,
  onOpen,
  onClose,
  onMonitoringChange,
  onTunerChange,
  onSetup,
}: InputControlProps) {
  return (
    <div className="space-y-3 text-xs">
      {permission === "denied" ? (
        <p className="leading-5 text-orange-200">
          Microphone access is blocked. Allow it from the browser’s site
          settings, then reopen this panel.
        </p>
      ) : status === "open" ? (
        <>
          <div className="flex items-center gap-2 text-neutral-300">
            <span className="flex-1 truncate">
              {device} · Channel {channel}
            </span>
            <button
              aria-label="Input setup"
              onClick={onSetup}
              className="grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-700"
            >
              <Settings2Icon className="size-3.5" />
            </button>
          </div>
          <MockMeter active />
        </>
      ) : (
        <p className="leading-5 text-neutral-400">
          Input is off. It turns on when you arm a track, record, or use
          monitoring or the tuner.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <PanelToggle
          pressed={monitoring}
          disabled={permission === "denied"}
          onClick={() => onMonitoringChange(!monitoring)}
          icon={<HeadphonesIcon className="size-3.5" />}
          label="Monitoring"
        />
        <PanelToggle
          pressed={tunerOpen}
          disabled={permission === "denied"}
          onClick={() => onTunerChange(!tunerOpen)}
          icon={<AudioWaveformIcon className="size-3.5" />}
          label="Tuner"
        />
      </div>
      <div className="flex gap-2 border-t border-neutral-700 pt-3">
        <Button
          onClick={onSetup}
          className="h-7 flex-1 border-neutral-600 text-xs hover:bg-neutral-700"
        >
          Input setup…
        </Button>
        {status === "open" ? (
          <Button
            onClick={onClose}
            className="h-7 flex-1 border-neutral-600 text-xs hover:bg-neutral-700"
          >
            Turn input off
          </Button>
        ) : (
          <Button
            disabled={permission === "denied" || status === "opening"}
            onClick={onOpen}
            className="h-7 flex-1 border-neutral-600 text-xs hover:bg-neutral-700"
          >
            Turn input on
          </Button>
        )}
      </div>
    </div>
  );
}

function PanelToggle({
  pressed,
  disabled,
  onClick,
  icon,
  label,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Button
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 gap-1.5 border-neutral-600 px-2 text-xs",
        pressed
          ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/35"
          : "text-neutral-300 hover:bg-neutral-700",
      )}
    >
      {icon}
      {label}
    </Button>
  );
}

function RowInputControls({
  status,
  permission,
  device,
  channel,
  monitoring,
  tunerOpen,
  onMonitoringChange,
  onTunerChange,
  onSetup,
}: InputControlProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[11px]">
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            permission === "denied" ? "text-orange-300" : "text-neutral-400",
          )}
        >
          {permission === "denied"
            ? "Microphone blocked"
            : status === "opening"
              ? "Opening input…"
              : `${device} · Ch ${channel}`}
        </span>
        <IconToggle label="Input setup" onClick={onSetup}>
          <Settings2Icon className="size-3.5" />
        </IconToggle>
        <IconToggle
          label="Input monitoring"
          pressed={monitoring}
          onClick={() => onMonitoringChange(!monitoring)}
        >
          <HeadphonesIcon className="size-3.5" />
        </IconToggle>
        <IconToggle
          label="Tuner"
          pressed={tunerOpen}
          onClick={() => onTunerChange(!tunerOpen)}
        >
          <AudioWaveformIcon className="size-3.5" />
        </IconToggle>
      </div>
      <MockMeter active={status === "open"} />
    </div>
  );
}

function IconToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 aria-pressed:bg-sky-500/25 aria-pressed:text-sky-300"
    >
      {children}
    </button>
  );
}

function RecordDestinationButton({
  recording,
  destination,
  audioTracks,
  onRecord,
  onStop,
  onDestinationChange,
  onNewTrack,
}: {
  recording: boolean;
  destination?: MockTrack;
  audioTracks: MockAudioTrack[];
  onRecord: (trackId: string) => void;
  onStop: () => void;
  onDestinationChange: (id?: string) => void;
  onNewTrack: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex">
      <Button
        aria-label={recording ? "Stop recording" : "Record"}
        aria-pressed={recording}
        onClick={() => {
          if (recording) {
            onStop();
          } else if (destination) {
            onRecord(destination.id);
          } else {
            setMenuOpen(true);
          }
        }}
        className={cn(
          "h-9 gap-2 rounded-r-none px-2 text-xs",
          recording
            ? "border-red-500/60 bg-red-500/20 text-red-200"
            : "text-neutral-300 hover:bg-neutral-700",
        )}
      >
        {recording ? (
          <CircleStopIcon className="size-5 text-red-300" />
        ) : (
          <CircleIcon className="size-4 fill-current text-red-400" />
        )}
        <span className="max-w-24 truncate">
          {destination ? destination.name : "Choose track"}
        </span>
      </Button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Record destination"
            disabled={recording}
            className="h-9 w-6 rounded-l-none border-l-0 text-neutral-400 hover:bg-neutral-700"
          >
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Record into</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={destination?.id ?? ""}
            onValueChange={(id) => onDestinationChange(id)}
          >
            {audioTracks.map((track) => (
              <DropdownMenuRadioItem key={track.id} value={track.id}>
                {track.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onNewTrack}>
            <PlusIcon />
            New audio track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MonitorToggle({
  label,
  monitoring,
  disabled,
  onClick,
}: {
  label: string;
  monitoring: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const title = disabled
    ? "Turn input on to monitor"
    : monitoring
      ? `Stop monitoring input on ${label}`
      : `Monitor input through ${label} (use headphones to avoid feedback)`;
  return (
    <span title={title} className="inline-flex">
      <Button
        aria-pressed={monitoring}
        aria-label={`Monitor ${label}`}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700",
          monitoring &&
            "border-sky-500/60 bg-sky-500/25 text-sky-300 hover:bg-sky-500/35",
        )}
      >
        <HeadphonesIcon className="size-3.5" />
      </Button>
    </span>
  );
}

function ArmToggle({
  armed,
  disabled,
  label,
  onClick,
}: {
  armed: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={armed}
      aria-label={armed ? `Disarm ${label}` : `Arm ${label}`}
      title={armed ? `Disarm ${label}` : `Arm ${label} for recording`}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-7 border-neutral-600 text-xs font-semibold text-neutral-300 hover:bg-neutral-700",
        armed && "border-red-500/60 bg-red-500/35 text-red-200",
      )}
    >
      R
    </Button>
  );
}

function TrackHeader({
  track,
  layout,
  metering,
  marker,
  arm,
  menu,
  footer,
  onMutedChange,
  onSoloedChange,
}: {
  track: MockTrack;
  layout: RowLayout;
  metering?: boolean;
  marker?: ReactNode;
  arm?: ReactNode;
  menu: ReactNode;
  footer?: ReactNode;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
}) {
  const name = (
    <span className="min-w-0 truncate text-xs font-semibold">{track.name}</span>
  );
  const tags = (
    <>
      {track.kind === "midi" && (
        <span className="text-[10px] text-neutral-500">MIDI</span>
      )}
      {marker}
    </>
  );
  const mix = (
    <>
      <RecorderMixToggle
        active={track.muted}
        kind="mute"
        className="size-7"
        onClick={() => onMutedChange(!track.muted)}
      />
      <RecorderMixToggle
        active={track.soloed}
        kind="solo"
        className="size-7"
        onClick={() => onSoloedChange(!track.soloed)}
      />
      <RecorderEffectsToggle
        label={track.name}
        open={false}
        onClick={() => {}}
        className="size-7"
      />
    </>
  );
  const fader = footer ?? <MockFader metering={metering} />;
  if (layout === "compact") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {name}
          {tags}
          {menu}
          <div className="flex-1" />
          <div className="flex items-center gap-1 [&_button]:size-6 [&_button]:text-[11px] [&_svg]:size-3">
            {arm}
            {mix}
          </div>
        </div>
        {fader}
      </div>
    );
  }
  if (layout === "two-line") {
    return (
      <div className="space-y-1.5">
        <div className="flex h-6 items-center gap-1">
          {name}
          {tags}
          <div className="flex-1" />
          {menu}
        </div>
        <div className="flex items-center gap-1">
          {arm}
          <div className="flex-1" />
          {mix}
        </div>
        {fader}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {layout === "name-menu" ? menu : name}
        {tags}
        {layout !== "name-menu" && (
          <>
            <div className="flex-1" />
            {menu}
          </>
        )}
        {arm}
        {mix}
      </div>
      {fader}
    </div>
  );
}

function MockFader({ metering }: { metering?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-neutral-700">
        {metering && (
          <MockMeter
            active
            className="absolute inset-0 h-full bg-transparent"
          />
        )}
        <div className="absolute inset-y-0 left-[75%] w-0.5 bg-neutral-300" />
      </div>
      <span className="w-12 text-right font-mono">0.0 dB</span>
    </div>
  );
}

function TrackMenu({
  label,
  trigger = "icon",
  removeDisabled,
  onImport,
  onRename,
  onRemove,
}: {
  label: string;
  trigger?: "icon" | "ghost" | "name";
  removeDisabled?: boolean;
  onImport?: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "name" ? (
          <button
            type="button"
            aria-label={`${label} actions`}
            className="flex min-w-0 flex-1 items-center gap-0.5 rounded px-1 py-1 text-left text-xs font-semibold hover:bg-neutral-700"
          >
            <span className="truncate">{label}</span>
            <ChevronDownIcon className="size-3 shrink-0 text-neutral-500" />
          </button>
        ) : trigger === "ghost" ? (
          <button
            type="button"
            aria-label={`${label} actions`}
            title={`${label} actions`}
            className="grid size-5 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <MoreVerticalIcon className="size-3.5" />
          </button>
        ) : (
          <Button
            aria-label={`${label} actions`}
            className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
          >
            <MoreVerticalIcon className="size-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {onImport && (
          <DropdownMenuItem onSelect={onImport}>
            <UploadIcon />
            Import audio…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            const name = window.prompt("Track name", label)?.trim();
            if (name) {
              onRename(name);
            }
          }}
        >
          <PencilIcon />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={removeDisabled}
          onSelect={onRemove}
          className="text-red-400"
        >
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TrackFrame({
  height,
  header,
  playhead,
  onSeek,
  onDropFile,
  children,
}: {
  height: number;
  header: ReactNode;
  playhead: number;
  onSeek: (position: number) => void;
  onDropFile?: (drop: { name: string; position: number }) => void;
  children: ReactNode;
}) {
  const [dropPosition, setDropPosition] = useState<number>();
  function positionAt(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return (
      Math.round(
        ((event.clientX - rect.left) / rect.width) * TIMELINE_BARS * 4,
      ) / 4
    );
  }
  return (
    <div
      className="grid grid-cols-[var(--track-header-width)_1fr] border-b border-neutral-700 transition-[height]"
      style={{ height }}
    >
      <div className="border-r border-neutral-700 bg-neutral-800 px-3 py-2">
        {header}
      </div>
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(64 64 64 / 0.6) 1px, transparent 1px)",
          backgroundSize: `${100 / TIMELINE_BARS}% 100%`,
        }}
        onClick={(event) => onSeek(positionAt(event))}
        onDragOver={
          onDropFile &&
          ((event) => {
            event.preventDefault();
            setDropPosition(positionAt(event));
          })
        }
        onDragLeave={() => setDropPosition(undefined)}
        onDrop={
          onDropFile &&
          ((event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            setDropPosition(undefined);
            if (file) {
              onDropFile({ name: file.name, position: positionAt(event) });
            }
          })
        }
      >
        {children}
        {dropPosition !== undefined && (
          <div
            className="pointer-events-none absolute inset-y-1 border-l-2 border-dashed border-sky-400 bg-sky-400/10 pl-1 text-[10px] text-sky-200"
            style={{
              left: toPercent(dropPosition),
              width: toPercent(Math.min(8, TIMELINE_BARS - dropPosition)),
            }}
          >
            Add clip at {formatBar(dropPosition)}
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
          style={{ left: toPercent(playhead) }}
        />
      </div>
    </div>
  );
}

function CompLane({
  clips,
  dimmed,
  emptyLabel,
}: {
  clips: MockClip[];
  dimmed: boolean;
  emptyLabel?: string;
}) {
  if (clips.length === 0) {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-neutral-600">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className={cn(dimmed && "opacity-30")}>
      {deriveComp(clips).map((region) => {
        const clip = clips.find((entry) => entry.id === region.clipId)!;
        return (
          <ClipBox
            key={`${region.clipId}-${region.start}`}
            start={region.start}
            end={region.end}
            label={clip.name}
            wave={{ seed: clip.id, start: clip.start, end: clip.end }}
          />
        );
      })}
    </div>
  );
}

function ClipBox({
  start,
  end,
  label,
  wave,
  className,
}: {
  start: number;
  end: number;
  label: string;
  wave?: { seed: string; start: number; end: number };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-y-1 overflow-hidden rounded-sm border border-emerald-400/50 bg-emerald-500/15",
        className,
      )}
      style={{ left: toPercent(start), width: toPercent(end - start) }}
    >
      {wave && (
        <MockWave
          seed={wave.seed}
          style={{
            left: `${((wave.start - start) / (end - start)) * 100}%`,
            width: `${((wave.end - wave.start) / (end - start)) * 100}%`,
          }}
        />
      )}
      <span className="relative truncate px-1 text-[10px] text-emerald-100/80">
        {label}
      </span>
    </div>
  );
}

function MockWave({
  seed,
  style,
}: {
  seed: string;
  style: React.CSSProperties;
}) {
  const bars = 240;
  let state = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 7);
  const heights = Array.from({ length: bars }, () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return 0.15 + (state / 2_147_483_648) * 0.8;
  });
  return (
    <svg
      className="absolute top-0 h-full text-emerald-300/50"
      style={style}
      viewBox={`0 0 ${bars} 2`}
      preserveAspectRatio="none"
    >
      {heights.map((height, index) => (
        <rect
          key={index}
          x={index + 0.25}
          y={1 - height}
          width={0.5}
          height={height * 2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

function MidiNotes({ notes }: { notes: MockMidiTrack["notes"] }) {
  return (
    <>
      {notes.map((note, index) => (
        <div
          key={index}
          className="absolute h-1.5 rounded-sm bg-violet-300/80"
          style={{
            left: toPercent(note.start),
            width: toPercent(note.end - note.start),
            bottom: `${12 + note.pitch * 6}%`,
          }}
        />
      ))}
    </>
  );
}

function TakesDisclosure({
  count,
  expanded,
  onExpandedChange,
}: {
  count: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <div className="grid h-7 grid-cols-[var(--track-header-width)_1fr] border-b border-neutral-700 bg-neutral-900">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className="flex items-center gap-2 border-r border-neutral-700 pl-3 text-xs font-semibold text-neutral-400 hover:bg-neutral-800"
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        Takes
        <span className="text-[10px] font-normal text-neutral-500">
          {count}
        </span>
      </button>
    </div>
  );
}

function TakeLane({
  clip,
  playhead,
  onSeek,
  onMutedChange,
  onDelete,
}: {
  clip: MockClip;
  playhead: number;
  onSeek: (position: number) => void;
  onMutedChange: (muted: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <TrackFrame
      height={TAKE_HEIGHT}
      playhead={playhead}
      onSeek={onSeek}
      header={
        <div className="flex h-full items-center gap-1 pl-5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">
            {clip.name}
          </span>
          <RecorderMixToggle
            active={clip.muted}
            kind="mute"
            className="size-6"
            onClick={() => onMutedChange(!clip.muted)}
          />
          <button
            aria-label={`Delete ${clip.name}`}
            onClick={onDelete}
            className="grid size-6 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-red-300"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      }
    >
      <ClipBox
        start={clip.start}
        end={clip.end}
        label={clip.name}
        wave={{ seed: clip.id, start: clip.start, end: clip.end }}
        className={cn(
          "border-neutral-500/50 bg-neutral-500/10",
          clip.muted && "opacity-40",
        )}
      />
    </TrackFrame>
  );
}

function MockMeter({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const [level, setLevel] = useState(0.4);
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(
      () => setLevel(0.25 + Math.random() * 0.5),
      120,
    );
    return () => window.clearInterval(id);
  }, [active]);
  return (
    <div
      aria-label="Input level illustration"
      className={cn(
        "h-1.5 overflow-hidden rounded-sm bg-neutral-700",
        className,
      )}
    >
      {active && (
        <div
          className="h-full bg-emerald-500/80 transition-[width] duration-100"
          style={{ width: `${level * 100}%` }}
        />
      )}
    </div>
  );
}

function MockInputSetup({
  device,
  channel,
  permission,
  inputOpen,
  onDeviceChange,
  onChannelChange,
  onGrant,
}: {
  device: string;
  channel: number;
  permission: Permission;
  inputOpen: boolean;
  onDeviceChange: (device: string) => void;
  onChannelChange: (channel: number) => void;
  onGrant: () => void;
}) {
  const selectClass =
    "mt-1 h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-100";
  if (permission !== "granted") {
    return (
      <div className="space-y-3 text-sm text-neutral-300">
        <p>
          {permission === "denied"
            ? "Microphone access is blocked. Allow it from the browser’s site settings."
            : "Allow microphone access to choose an input device."}
        </p>
        {permission === "prompt" && (
          <Button
            onClick={onGrant}
            className="h-8 w-full border-neutral-600 text-xs hover:bg-neutral-700"
          >
            Allow microphone access
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto">
      <label className="block text-xs font-medium text-neutral-400">
        Device
        <select
          value={device}
          onChange={(event) => onDeviceChange(event.currentTarget.value)}
          className={selectClass}
        >
          {MOCK_DEVICES.map((entry) => (
            <option key={entry}>{entry}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-neutral-400">
        Channel
        <select
          value={channel}
          onChange={(event) =>
            onChannelChange(Number(event.currentTarget.value))
          }
          className={selectClass}
        >
          <option value={1}>Channel 1</option>
          <option value={2}>Channel 2</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-neutral-400">
        Level
        <MockMeter active={inputOpen} className="mt-2 h-2" />
      </label>
      <section className="space-y-3 border-t border-neutral-700 pt-4 text-xs text-neutral-400">
        <label className="flex items-center gap-2 font-medium">
          <span className="flex-1">Recording latency compensation</span>
          <input
            type="text"
            defaultValue="12.5"
            className="h-8 w-20 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-neutral-100"
          />
          ms
        </label>
        <p className="text-[11px] leading-5 text-neutral-500">
          Stored for this device, so switching devices restores its own value.
        </p>
        <Button
          disabled={!inputOpen}
          className="h-8 w-full border-neutral-600 text-xs hover:bg-neutral-700"
        >
          Measure latency
        </Button>
        <details>
          <summary className="cursor-pointer">How do I set this?</summary>
          <p className="mt-2 leading-5">
            Connect your audio output back to the selected input with a cable,
            then press Measure latency. The checker page shows details.
          </p>
        </details>
      </section>
      <details className="border-t border-neutral-700 pt-4 text-xs">
        <summary className="cursor-pointer text-neutral-400">
          Audio diagnostics
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            ["Sample rate", "48000 Hz"],
            ["Base latency", "5.3 ms"],
            ["Output latency", "21.3 ms"],
            ["Input channels", "2"],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-neutral-400">{label}</dt>
              <dd className="font-mono text-neutral-200">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function DecisionTable({ variant }: { variant: Variant }) {
  return (
    <table className="w-full max-w-6xl border-collapse text-left text-xs">
      <thead>
        <tr className="text-neutral-500">
          <th className="w-48 border-b border-neutral-800 py-2 pr-4 font-medium">
            Decision
          </th>
          {VARIANTS.map((entry) => (
            <th
              key={entry.id}
              className={cn(
                "border-b border-neutral-800 px-3 py-2 font-medium",
                entry.id === variant && "bg-neutral-800 text-neutral-100",
              )}
            >
              {entry.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {DECISIONS.map((decision) => (
          <tr key={decision.topic} className="align-top">
            <td className="border-b border-neutral-800 py-2 pr-4 text-neutral-400">
              {decision.topic}
            </td>
            {VARIANTS.map((entry) => (
              <td
                key={entry.id}
                className={cn(
                  "border-b border-neutral-800 px-3 py-2 text-neutral-400",
                  entry.id === variant && "bg-neutral-800 text-neutral-200",
                )}
              >
                {decision.values[entry.id]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Newest clip wins each overlapping span; muted clips do not participate. */
function deriveComp(clips: MockClip[]) {
  const active = clips.filter((clip) => !clip.muted);
  const edges = [
    ...new Set(active.flatMap((clip) => [clip.start, clip.end])),
  ].sort((a, b) => a - b);
  const regions: { clipId: string; start: number; end: number }[] = [];
  for (const [index, start] of edges.slice(0, -1).entries()) {
    const end = edges[index + 1];
    const owner = active.findLast(
      (clip) => clip.start <= start && clip.end >= end,
    );
    if (!owner) {
      continue;
    }
    const previous = regions.at(-1);
    if (previous?.clipId === owner.id && previous.end === start) {
      previous.end = end;
    } else {
      regions.push({ clipId: owner.id, start, end });
    }
  }
  return regions;
}

function toPercent(bars: number) {
  return `${(bars / TIMELINE_BARS) * 100}%`;
}

function formatBar(position: number) {
  const bar = Math.floor(position) + 1;
  const beat = Math.floor((position % 1) * 4) + 1;
  return `${String(bar).padStart(3, "0")}.${beat}`;
}
