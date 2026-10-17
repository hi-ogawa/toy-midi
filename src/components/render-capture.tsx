import { useEffect } from "react";
import { downloadBlob } from "../lib/export-utils";
import { importProject } from "../lib/project-import";
import { EditorRuntime } from "../lib/runtime";
import { encodeWav } from "../lib/wav";

export interface RenderCaptureApi {
  /**
   * Render the project archive at `src` the way Export Audio does and download
   * the WAV.
   */
  renderArchive(src: string): Promise<void>;
}

// Bare Export Audio for command-line render tools such as packages/render-audio.
export function RenderCapture() {
  useEffect(() => {
    window.__toyMidiRenderCapture = { renderArchive };
    return () => {
      delete window.__toyMidiRenderCapture;
    };
  }, []);
  return null;
}

async function renderArchive(src: string) {
  const runtime = new EditorRuntime();
  const [, project] = await Promise.all([
    runtime.init(),
    fetch(src)
      .then((response) => response.blob())
      .then((blob) => importProject(new File([blob], "project.zip"))),
  ]);
  await runtime.deserializeProject(project);
  downloadBlob(encodeWav(await runtime.renderMix()), "render.wav");
}
