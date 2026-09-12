import {
  AudioLinesIcon,
  GitForkIcon,
  Music2Icon,
  PianoIcon,
  Mic2Icon,
} from "lucide-react";
import { useState } from "react";
import { projectStorage } from "../lib/project-storage";
import { routes } from "../lib/routes";
import { MidiProjectList } from "./midi-project-list";
import { RecorderProjectList } from "./recorder/project-list";

type ProjectType = "midi" | "recorder";

export function Home() {
  const [projectType, setProjectType] = useState<ProjectType>(
    () => projectStorage.readPreferences().projectType,
  );

  const selectProjectType = (type: ProjectType) => {
    projectStorage.updatePreferences({ projectType: type });
    setProjectType(type);
  };

  return (
    <div
      data-testid="startup-screen"
      className="fixed inset-0 z-50 overflow-hidden bg-neutral-900"
    >
      {/* Gradient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,#10b9811f_0%,transparent_70%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-8 py-12">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-100 tracking-tight">
              Toy MIDI
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Edit MIDI and record audio
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm text-neutral-500">
            <a
              href={routes.latencyChecker.href()}
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <AudioLinesIcon className="size-4" />
              Latency Checker
            </a>
            <a
              href={routes.scoreViewer.href()}
              data-testid="score-viewer-link"
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <Music2Icon className="size-4" />
              Score Viewer
            </a>
            <a
              href="https://github.com/hi-ogawa/toy-midi/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <GitForkIcon className="size-4" />
              GitHub
            </a>
          </nav>
        </header>

        <main className="mt-14 min-h-0 flex-1">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Your Projects
          </h2>
          <div
            role="tablist"
            aria-label="Project type"
            className="mb-5 flex gap-2 border-b border-neutral-700/70"
          >
            {(["midi", "recorder"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                id={`project-tab-${type}`}
                aria-controls="project-panel"
                aria-selected={projectType === type}
                tabIndex={projectType === type ? 0 : -1}
                onClick={() => selectProjectType(type)}
                onKeyDown={(event) => {
                  let nextType: ProjectType;
                  switch (event.key) {
                    case "ArrowLeft":
                    case "ArrowRight": {
                      nextType = type === "midi" ? "recorder" : "midi";
                      break;
                    }
                    case "Home": {
                      nextType = "midi";
                      break;
                    }
                    case "End": {
                      nextType = "recorder";
                      break;
                    }
                    default: {
                      return;
                    }
                  }
                  event.preventDefault();
                  selectProjectType(nextType);
                  document.getElementById(`project-tab-${nextType}`)?.focus();
                }}
                className="relative -mb-px inline-flex min-w-36 items-center justify-center gap-2.5 rounded-t-lg border-b-2 border-transparent px-5 py-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-neutral-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 aria-selected:border-emerald-400 aria-selected:bg-emerald-400/5 aria-selected:text-emerald-300"
              >
                {type === "midi" ? (
                  <PianoIcon aria-hidden="true" className="size-4" />
                ) : (
                  <Mic2Icon aria-hidden="true" className="size-4" />
                )}
                {type === "midi" ? "MIDI" : "Recorder"}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="project-panel"
            aria-labelledby={`project-tab-${projectType}`}
            tabIndex={0}
          >
            {projectType === "midi" ? (
              <MidiProjectList />
            ) : (
              <RecorderProjectList />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
