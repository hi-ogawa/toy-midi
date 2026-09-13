import {
  HeadphonesIcon,
  Mic2Icon,
  PlayIcon,
  PlusIcon,
  UploadIcon,
  HouseIcon,
  CircleHelpIcon,
  MoreVerticalIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

type MockTrack = {
  id: number;
  name: string;
  color: string;
  takes: { name: string; start: number; end: number }[];
};

const INITIAL_TRACKS: MockTrack[] = [
  {
    id: 1,
    name: "Backing",
    color: "#60a5fa",
    takes: [{ name: "Backing.wav", start: 0, end: 100 }],
  },
  {
    id: 2,
    name: "Bass",
    color: "#34d399",
    takes: [
      { name: "Take 1", start: 8, end: 82 },
      { name: "Take 2", start: 38, end: 65 },
    ],
  },
  { id: 3, name: "Harmony", color: "#c4b5fd", takes: [] },
];

const buttonClass =
  "rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-700 hover:text-white aria-pressed:border-neutral-400 aria-pressed:bg-neutral-700 aria-pressed:text-white";

export function RecorderTracksPreview() {
  const [tracks, setTracks] = useState(INITIAL_TRACKS);
  const [armed, setArmed] = useState<number | undefined>();
  const [inputReady, setInputReady] = useState(false);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [inputDevice, setInputDevice] = useState("USB Audio");
  const [inputChannel, setInputChannel] = useState("1");
  const [selected, setSelected] = useState(2);
  const [expanded, setExpanded] = useState<number[]>([2]);
  const [monitoring, setMonitoring] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const armedTrack = tracks.find((track) => track.id === armed);

  function toggleRecording() {
    if (recording) {
      setTracks(
        tracks.map((track) =>
          track.id === armed
            ? {
                ...track,
                takes: [
                  ...track.takes,
                  {
                    name: `Take ${track.takes.length + 1}`,
                    start: 52,
                    end: 76,
                  },
                ],
              }
            : track,
        ),
      );
    }
    setRecording(!recording);
  }

  const input = (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1 text-[11px] text-neutral-400">
        <span className="mr-auto truncate">
          {inputDevice} / Input {inputChannel}
        </span>
        <button
          className="grid size-6 place-items-center text-neutral-500"
          aria-label="Configure audio input"
          onClick={() => setInputModalOpen(true)}
          disabled={recording}
        >
          <Settings2Icon className="size-3.5" />
        </button>
        <button
          className="grid size-6 place-items-center rounded text-neutral-500 aria-pressed:bg-sky-500/25 aria-pressed:text-sky-300"
          aria-label="Input monitoring"
          aria-pressed={monitoring}
          onClick={() => setMonitoring(!monitoring)}
        >
          <HeadphonesIcon className="size-3.5" />
        </button>
      </div>
      <div
        aria-label="Input level illustration"
        className="h-2 overflow-hidden rounded-sm bg-neutral-700"
      >
        <div className="h-full w-2/3 bg-emerald-500/70" />
      </div>
    </div>
  );

  return (
    <div className="relative isolate flex h-[800px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 [contain:layout]">
      <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4">
        <Mic2Icon className="size-4 text-emerald-400" />
        <span className="mr-2 text-sm font-medium">Recorder</span>
        <div className="mr-1 h-5 w-px bg-neutral-600" />
        <button
          className={buttonClass}
          aria-label="Play"
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          <PlayIcon className="size-4" />
        </button>
        <button
          disabled={!inputReady || !armedTrack}
          onClick={toggleRecording}
          aria-label={recording ? "Stop recording" : "Record"}
          className="grid size-7 place-items-center rounded border border-neutral-600 text-red-400 disabled:opacity-30"
        >
          <span
            className={`size-3 border-2 border-current ${recording ? "rounded-sm bg-red-400" : "rounded-full"}`}
          />
        </button>
        <span className="mr-2 font-mono text-xs text-neutral-300">
          009.1 <span className="ml-2 text-neutral-500">00:16.000</span>
        </span>
        <span className="text-xs text-neutral-400">
          120 <span className="text-[10px] text-neutral-500">BPM</span>
        </span>
        <span className="px-2 text-xs text-neutral-400">4/4</span>
        <button className={buttonClass}>1×</button>
        <MockToggle label="Loop" title="Loop" />
        <MockToggle label="Punch" title="Punch" />
        <span className="ml-auto truncate text-xs text-neutral-300">
          Evening practice
        </span>
        <span className="mr-2 text-[10px] text-neutral-500">Saved</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="More" className="text-neutral-400">
              <MoreVerticalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={recording}
              onSelect={() => setInputModalOpen(true)}
            >
              <Mic2Icon />
              Configure input…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button aria-label="Help" className="text-neutral-400">
          <CircleHelpIcon className="size-4" />
        </button>
        <button aria-label="Home" className="text-neutral-400">
          <HouseIcon className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <div className="grid h-8 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800/40 text-[10px] text-neutral-500">
            <div className="border-r border-neutral-700 px-3 py-2">
              Locators <span className="float-right">+</span>
            </div>
            <div className="flex items-center">
              <span className="ml-[8%] border-l border-sky-400 px-2 text-sky-300">
                Verse
              </span>
              <span className="ml-[25%] border-l border-sky-400 px-2 text-sky-300">
                Chorus
              </span>
            </div>
          </div>
          <div className="grid h-10 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800 text-[10px] text-neutral-500">
            <div className="flex items-center border-r border-neutral-700 bg-neutral-800 px-3 text-xs font-semibold text-neutral-100">
              <span className="mr-auto">Tracks</span>
              <button
                className="grid size-7 place-items-center hover:bg-neutral-700"
                title="Add empty audio track"
                onClick={() =>
                  setTracks([
                    ...tracks,
                    {
                      id: Math.max(...tracks.map((track) => track.id)) + 1,
                      name: `Audio ${tracks.length + 1}`,
                      color: "#60a5fa",
                      takes: [],
                    },
                  ])
                }
              >
                <PlusIcon className="size-3.5" />
              </button>
              <button
                title="Add audio tracks from file"
                className="grid size-7 place-items-center hover:bg-neutral-700"
              >
                <UploadIcon className="size-3.5" />
              </button>
            </div>
            <div className="flex justify-between px-2 py-2 font-mono">
              {[1, 3, 5, 7, 9, 11, 13, 15, 17].map((bar) => (
                <span key={bar}>{bar}</span>
              ))}
            </div>
          </div>
          {tracks.map((track) => {
            const hasTakes = track.takes.length >= 2;
            const isExpanded = hasTakes && expanded.includes(track.id);
            const isArmed = armed === track.id;
            return (
              <div
                key={track.id}
                className="border-b border-neutral-700 last:border-0"
              >
                <div className="grid grid-cols-[15rem_1fr]">
                  <div
                    className={`border-r border-neutral-700 border-l-2 px-3 py-2 ${selected === track.id ? "bg-neutral-800 border-l-neutral-300" : "border-l-transparent"}`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        className="mr-auto text-left text-xs font-semibold"
                        onClick={() => setSelected(track.id)}
                      >
                        {track.name}
                      </button>
                      <button
                        className="grid size-7 place-items-center text-neutral-500"
                        aria-label={`${track.name} actions (mockup)`}
                      >
                        <MoreVerticalIcon className="size-3.5" />
                      </button>
                      <button
                        disabled={recording}
                        aria-label={`Arm ${track.name}`}
                        aria-pressed={isArmed}
                        onClick={() => {
                          if (!inputReady) {
                            setInputModalOpen(true);
                            return;
                          }
                          setArmed(isArmed ? undefined : track.id);
                        }}
                        className={`size-7 rounded border text-xs font-semibold disabled:opacity-50 ${isArmed ? "border-red-400/50 bg-red-500/20 text-red-300" : "border-neutral-700 text-neutral-500 hover:text-neutral-200"}`}
                      >
                        R
                      </button>
                      <MockToggle label="M" title={`Mute ${track.name}`} />
                      <MockToggle label="S" title={`Solo ${track.name}`} />
                      <button
                        className="grid size-7 place-items-center rounded border border-neutral-700 text-neutral-400"
                        aria-label={`${track.name} effects (mockup)`}
                      >
                        <SlidersHorizontalIcon className="size-3.5" />
                      </button>
                    </div>
                    {isArmed && input}
                    <div className="mt-2 flex h-6 items-center gap-3">
                      <input
                        aria-label={`${track.name} gain`}
                        type="range"
                        defaultValue="75"
                        className="h-1 min-w-0 flex-1 accent-neutral-400"
                      />
                      <span className="text-[10px] font-mono text-neutral-400">
                        0.0 dB
                      </span>
                    </div>
                  </div>
                  <div
                    className="relative min-h-[72px] bg-neutral-950/40 p-2"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, #ffffff08 1px, transparent 1px)",
                      backgroundSize: "12.5% 100%",
                    }}
                  >
                    {track.takes.length === 0 && !(recording && isArmed) && (
                      <div className="flex h-full items-center justify-center text-xs text-neutral-600">
                        Drop audio here or arm to record
                      </div>
                    )}
                    {track.takes.map((take, index) => (
                      <MockClip
                        key={index}
                        {...take}
                        color={track.color}
                        seed={index + track.id}
                      />
                    ))}
                    {recording && isArmed && (
                      <MockClip
                        name="Recording…"
                        start={52}
                        end={76}
                        color="#fb7185"
                        seed={7}
                      />
                    )}
                    <div className="pointer-events-none absolute inset-y-0 left-[52%] w-px bg-white/40" />
                  </div>
                </div>
                {hasTakes && (
                  <div className="grid h-9 grid-cols-[15rem_1fr] border-t border-neutral-700 bg-neutral-900">
                    <div className="flex items-center border-r border-neutral-700 px-3">
                      <button
                        className="text-xs text-neutral-400"
                        onClick={() =>
                          setExpanded(
                            isExpanded
                              ? expanded.filter((id) => id !== track.id)
                              : [...expanded, track.id],
                          )
                        }
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "▾" : "▸"} Takes · {track.takes.length}
                      </button>
                    </div>
                    <div />
                  </div>
                )}
                {isExpanded && (
                  <div className="bg-neutral-950/50">
                    {track.takes.map((take, index) => (
                      <div
                        key={index}
                        className="grid h-14 grid-cols-[15rem_1fr] border-t border-neutral-800"
                      >
                        <div className="flex items-center gap-2 border-r border-neutral-700 pr-3 pl-7 text-[11px] text-neutral-400">
                          <span className="text-neutral-600">↳</span>
                          <span className="mr-auto truncate">{take.name}</span>
                          <MockToggle
                            label="M"
                            title={`Mute ${track.name} ${take.name}`}
                          />
                          <MockToggle
                            label="S"
                            title={`Solo ${track.name} ${take.name}`}
                          />
                        </div>
                        <div className="relative opacity-70">
                          <MockClip
                            {...take}
                            color={track.color}
                            seed={index + track.id}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-neutral-700 bg-neutral-800/50 px-3 text-[11px] text-neutral-500">
        <span>
          {armedTrack
            ? `${recording ? "Recording into" : "Armed"} ${armedTrack.name}`
            : "No track armed"}
        </span>
        <span className="ml-auto">
          Mock app · audio and permission simulated
        </span>
      </footer>
      {inputModalOpen && (
        <MockInputModal onClose={() => setInputModalOpen(false)}>
          <p className="text-xs leading-relaxed text-neutral-400">
            One shared input for recording and monitoring on any track.
          </p>
          {!permissionGranted ? (
            <div className="mt-5 rounded border border-orange-300/25 bg-orange-300/5 p-4">
              <h3 className="text-sm font-medium text-orange-200">
                Microphone access required
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                Allow access to list your audio devices and enable recording.
              </p>
              <button
                className="mt-4 rounded bg-orange-200 px-3 py-2 text-xs font-semibold text-neutral-900"
                onClick={() => setPermissionGranted(true)}
              >
                Allow microphone access
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <p className="text-xs text-emerald-400">
                Microphone access allowed
              </p>
              <label className="block space-y-2 text-xs text-neutral-300">
                <span>Input device</span>
                <select
                  disabled={inputReady}
                  value={inputDevice}
                  onChange={(event) => setInputDevice(event.target.value)}
                  className="block w-full rounded border border-neutral-600 bg-neutral-900 p-2 disabled:opacity-60"
                >
                  <option>USB Audio</option>
                  <option>Built-in Microphone</option>
                </select>
              </label>
              <label className="block space-y-2 text-xs text-neutral-300">
                <span>Channel</span>
                <select
                  disabled={inputReady}
                  value={inputChannel}
                  onChange={(event) => setInputChannel(event.target.value)}
                  className="block w-full rounded border border-neutral-600 bg-neutral-900 p-2 disabled:opacity-60"
                >
                  <option value="1">Channel 1</option>
                  <option value="2">Channel 2</option>
                </select>
              </label>
              {inputReady && (
                <p className="text-xs text-neutral-400">
                  Input is open. Close input to change the device or channel in
                  this mockup.
                </p>
              )}
              <div className="flex items-center justify-between border-t border-neutral-700 pt-4">
                {inputReady ? (
                  <button
                    className={buttonClass}
                    onClick={() => {
                      setInputReady(false);
                      setArmed(undefined);
                      setMonitoring(false);
                    }}
                  >
                    Close input
                  </button>
                ) : (
                  <button
                    className="rounded bg-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-900"
                    onClick={() => {
                      setInputReady(true);
                      setInputModalOpen(false);
                    }}
                  >
                    Enable input
                  </button>
                )}
                <button
                  className={buttonClass}
                  onClick={() => setInputModalOpen(false)}
                >
                  {inputReady ? "Done" : "Cancel"}
                </button>
              </div>
            </div>
          )}
          <p className="mt-5 text-[11px] text-neutral-500">
            Preview only. Permission and device access are simulated.
          </p>
        </MockInputModal>
      )}
    </div>
  );
}

function MockInputModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog isOpen onClose={onClose} title="Configure input">
      {children}
    </Dialog>
  );
}

function MockToggle({ label, title }: { label: string; title: string }) {
  const [active, setActive] = useState(false);
  return (
    <button
      className={buttonClass}
      aria-label={title}
      aria-pressed={active}
      onClick={() => setActive(!active)}
    >
      {label}
    </button>
  );
}

function MockClip({
  name,
  start,
  end,
  color,
  seed,
}: {
  name: string;
  start: number;
  end: number;
  color: string;
  seed: number;
}) {
  return (
    <div
      className="absolute top-2 bottom-2 overflow-hidden rounded border"
      style={{
        left: `${start}%`,
        width: `${end - start}%`,
        borderColor: `${color}70`,
        background: `color-mix(in srgb, ${color} 18%, #171717)`,
      }}
    >
      <div
        className="relative z-10 truncate px-2 pt-1 text-[10px]"
        style={{ color }}
      >
        {name}
      </div>
      <svg
        aria-hidden="true"
        className="absolute inset-x-0 bottom-1 h-[55%] w-full"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
      >
        {Array.from({ length: 100 }, (_, i) => {
          const height =
            3 +
            30 * Math.abs(Math.sin(i * 1.7 + seed) * Math.sin(i * 0.13 + seed));
          return (
            <rect
              key={i}
              x={i * 4}
              y={(40 - height) / 2}
              width="2"
              height={height}
              fill={color}
              opacity="0.65"
            />
          );
        })}
      </svg>
    </div>
  );
}
