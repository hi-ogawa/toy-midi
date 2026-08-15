import {
  CircleHelpIcon,
  ExternalLinkIcon,
  FileMusicIcon,
  FolderIcon,
  MoreVerticalIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useWindowEvent } from "../hooks/use-window-event";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { flushAutoSave } from "../lib/project-session";
import { projectStorage } from "../lib/project-storage";
import { useProjectStore } from "../lib/project-store";
import { routes } from "../lib/routes";
import { AudioToMidi } from "./audio-to-midi";
import { HelpOverlay } from "./help-overlay";
import { Mixer } from "./mixer";
import { PianoRoll } from "./piano-roll";
import { ProjectScorePreview } from "./project-score-preview";
import { Settings } from "./settings";
import { Transport } from "./transport";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { FloatingPanel } from "./ui/floating-panel";
import { cn } from "./ui/utils";

type EditorProps = {
  projectId: string;
  initialProjectName: string;
};

export function Editor({ projectId, initialProjectName }: EditorProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isScorePreviewOpen, setIsScorePreviewOpen] = useState(false);
  const [scorePreviewSize, setScorePreviewSize] = useState({
    width: 800,
    height: 448,
  });
  const [projectName, setProjectName] = useState(initialProjectName);
  const [audioToMidiTrackId, setAudioToMidiTrackId] = useState<string>();
  const audioToMidiTrack = useProjectStore((state) =>
    state.audioTracks.find((track) => track.id === audioToMidiTrackId),
  );
  const scorePreviewResizeHandleRef = useCallback(
    (handle: HTMLButtonElement | null) => {
      if (!handle) {
        return;
      }

      let drag:
        | {
            pointerId: number;
            startX: number;
            startY: number;
            width: number;
            height: number;
          }
        | undefined;

      const onPointerDown = (event: PointerEvent) => {
        const panel = handle.offsetParent;
        if (!(panel instanceof HTMLElement)) {
          return;
        }
        const rect = panel.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          width: rect.width,
          height: rect.height,
        };
        handle.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }
        setScorePreviewSize({
          width: Math.min(
            window.innerWidth - 32,
            Math.max(576, drag.width + drag.startX - event.clientX),
          ),
          height: Math.min(
            window.innerHeight - 32,
            Math.max(288, drag.height + drag.startY - event.clientY),
          ),
        });
      };
      const onPointerEnd = (event: PointerEvent) => {
        if (drag?.pointerId === event.pointerId) {
          drag = undefined;
        }
      };

      handle.addEventListener("pointerdown", onPointerDown);
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerEnd);
      handle.addEventListener("pointercancel", onPointerEnd);
      handle.addEventListener("lostpointercapture", onPointerEnd);
      return () => {
        handle.removeEventListener("pointerdown", onPointerDown);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerEnd);
        handle.removeEventListener("pointercancel", onPointerEnd);
        handle.removeEventListener("lostpointercapture", onPointerEnd);
      };
    },
    [setScorePreviewSize],
  );

  // Update document title when project name changes
  useEffect(() => {
    document.title = `${projectName} - Toy MIDI`;
  }, [projectName]);

  // Keyboard shortcuts for overlays
  useWindowEvent("keydown", (e) => {
    if (isShortcutTextInputTarget(e.target)) {
      return;
    }

    if (matchKeyboardEvent(e, "Escape")) {
      if (isSettingsOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsSettingsOpen(false);
      } else if (isHelpOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen(false);
      }
    }
    if (e.key === "?" && !e.repeat) {
      e.preventDefault();
      setIsHelpOpen((prev) => !prev);
    }
  });

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport
        projectName={projectName}
        controls={
          <>
            <Button
              data-testid="score-preview-button"
              onClick={() => setIsScorePreviewOpen((open) => !open)}
              aria-pressed={isScorePreviewOpen}
              title="Score preview"
              className={cn(
                "size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
                isScorePreviewOpen &&
                  "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <FileMusicIcon className="size-5" />
            </Button>
            <Button
              data-testid="settings-button"
              onClick={() => setIsSettingsOpen(true)}
              title="Project"
              className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
            >
              <SettingsIcon className="size-5" />
            </Button>
            <Button
              data-testid="mixer-button"
              onClick={() => setIsMixerOpen((open) => !open)}
              aria-pressed={isMixerOpen}
              title="Mixer"
              className={cn(
                "size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
                isMixerOpen &&
                  "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <SlidersHorizontalIcon className="size-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="app-menu-button"
                  title="More"
                  aria-label="More"
                  className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
                >
                  <MoreVerticalIcon className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a
                    href={routes.home.href()}
                    data-testid="all-projects-menu-item"
                  >
                    <FolderIcon />
                    All Projects
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="help-menu-item"
                  onSelect={() => setIsHelpOpen(true)}
                >
                  <CircleHelpIcon />
                  Help &amp; Shortcuts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {isMixerOpen && (
        <FloatingPanel
          closeLabel="Close Mixer"
          onClose={() => setIsMixerOpen(false)}
          title="Mixer"
          testId="mixer-panel"
        >
          <Mixer />
        </FloatingPanel>
      )}
      {isScorePreviewOpen && (
        <FloatingPanel
          closeLabel="Close Score Preview"
          onClose={() => setIsScorePreviewOpen(false)}
          title="Score preview"
          headerActions={
            <a
              href={routes.projectScore.href({ projectId })}
              target="_blank"
              rel="noreferrer"
              onClick={() => flushAutoSave()}
              className="flex items-center gap-1 text-xs font-normal text-neutral-400 hover:text-neutral-200"
            >
              Open full score
              <ExternalLinkIcon className="size-3" />
            </a>
          }
          testId="score-preview-panel"
          className="flex flex-col overflow-hidden"
          contentClassName="min-h-0 flex-1 p-0"
          style={scorePreviewSize}
        >
          <button
            ref={scorePreviewResizeHandleRef}
            type="button"
            aria-label="Resize Score Preview"
            data-testid="score-preview-resize-handle"
            className="absolute top-0 left-0 z-10 size-4 cursor-nwse-resize touch-none border-t-2 border-l-2 border-neutral-400"
          />
          <ProjectScorePreview title={projectName} />
        </FloatingPanel>
      )}
      {/* TODO: coordinate active floating panels so Mixer and Audio to MIDI do
          not overlap when both are open. */}
      {audioToMidiTrack && (
        <FloatingPanel
          closeLabel="Close Audio to MIDI"
          onClose={() => setAudioToMidiTrackId(undefined)}
          testId="audio-to-midi-panel"
          title={
            <span className="flex items-center gap-2">
              <SparklesIcon className="size-4" />
              Audio to MIDI
            </span>
          }
        >
          <AudioToMidi key={audioToMidiTrack.id} track={audioToMidiTrack} />
        </FloatingPanel>
      )}
      <Dialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Project"
        testId="settings-dialog"
      >
        <Settings
          projectName={projectName}
          projectScoreHref={routes.projectScore.href({ projectId })}
          onProjectNameChange={(name) => {
            if (name && name !== projectName) {
              projectStorage.updateMetadata(projectId, { name });
              setProjectName(name);
            }
          }}
          onProjectScoreOpen={() => {
            flushAutoSave();
            setIsSettingsOpen(false);
          }}
          onAudioToMidiClick={(trackId) => {
            setIsSettingsOpen(false);
            setAudioToMidiTrackId(trackId);
          }}
        />
      </Dialog>
    </div>
  );
}
