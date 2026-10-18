import { runRenderAudio } from "./render-audio";
import { runScoreVideo } from "./score-video";
import { rewriteLine, style } from "./terminal";

const USAGE = `Usage: toy-midi <command> [options]

Commands:
  score-video <input.musicxml> <output.mp4>     Render a scrolling score video
  render-audio <input.toymidi.zip> <output.wav>  Render a project's mix to WAV

Run \`toy-midi <command> --help\` for the command's options.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "score-video": {
      await runScoreVideo(args);
      break;
    }
    case "render-audio": {
      await runRenderAudio(args);
      break;
    }
    case undefined:
    case "--help":
    case "-h": {
      console.log(USAGE);
      break;
    }
    default: {
      throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
    }
  }
}

main().catch((error) => {
  // Errors carry user-facing messages, so skip stack traces. Clear any
  // in-place progress line first.
  rewriteLine("");
  console.error(
    style("red", error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
});
