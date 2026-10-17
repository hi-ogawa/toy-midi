import type { RenderCaptureApi } from "../../../src/components/render-capture";

// The CLI renders through the render capture page with this global, so the
// file matches Export Audio.
declare global {
  interface Window {
    __toyMidiRenderCapture?: RenderCaptureApi;
  }
}
