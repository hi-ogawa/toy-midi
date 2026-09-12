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
import { Tabs } from "./ui/tabs";

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
          <Tabs
            label="Project type"
            value={projectType}
            onValueChange={selectProjectType}
            options={[
              {
                value: "midi",
                content: <MidiProjectList />,
                label: (
                  <>
                    <PianoIcon aria-hidden="true" className="size-4" />
                    MIDI
                  </>
                ),
              },
              {
                value: "recorder",
                content: <RecorderProjectList />,
                label: (
                  <>
                    <Mic2Icon aria-hidden="true" className="size-4" />
                    Recorder
                  </>
                ),
              },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
