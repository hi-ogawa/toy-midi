import { useEffect } from "react";
import { importProject } from "../lib/project-import";
import { EditorRuntime } from "../lib/runtime";
import { encodeWav } from "../lib/wav";

export interface RenderCaptureApi {
  /**
   * Render a base64 project archive the way Export Audio does, returning the
   * base64 WAV and the number of MIDI tracks the render leaves out.
   */
  renderArchive(archive: string): Promise<{
    wav: string;
    midiTrackCount: number;
  }>;
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

async function renderArchive(archive: string) {
  const runtime = new EditorRuntime();
  const zip = await fetch(`data:application/zip;base64,${archive}`);
  const [, project] = await Promise.all([
    runtime.init(),
    importProject(new File([await zip.blob()], "project.zip")),
  ]);
  await runtime.deserializeProject(project);
  return {
    wav: await encodeBase64(encodeWav(await runtime.renderMix())),
    midiTrackCount: project.midiTracks?.length ?? 0,
  };
}

function encodeBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Drop the data URL's "data:<type>;base64," prefix.
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
