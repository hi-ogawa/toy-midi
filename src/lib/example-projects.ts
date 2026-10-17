import { routes } from "./routes";

// The examples are project files in llm-music-probe's compositions, which are
// curated by hand. Their raw URLs on main always serve the latest version, so
// editing a file there updates the example without a release.
const PIECES_URL =
  "https://raw.githubusercontent.com/hi-ogawa/llm-music-probe/main/compositions/pieces/";

export const EXAMPLE_PROJECTS = [
  {
    path: "corner-store-thirds/corner-store-thirds.json",
    title: "Corner Store Thirds",
    description: "Hip-hop loop layered from drum and percussion kits",
  },
  {
    path: "slow-tide/slow-tide.json",
    title: "Slow Tide",
    description: "Ambient waltz that drifts across the stereo field",
  },
  {
    path: "overture-in-d-minor/overture-in-d-minor.json",
    title: "Overture in D minor",
    description: "Orchestral overture that builds into each new section",
  },
  {
    path: "dorian-vamp-funk/dorian-vamp-funk.json",
    title: "Dorian Vamp Funk",
    description: "Slap bass, clav and sax riffs over an E Dorian vamp",
  },
  {
    path: "cliche/cliche.json",
    title: "Clichê",
    description: "Bossa nova for flute, nylon guitar and brushes",
  },
  {
    path: "tide-engine/tide-engine.json",
    title: "Tide Engine",
    description: "Film cue that grows from one viola figure to full orchestra",
  },
  {
    path: "night-drive-in-db/night-drive-in-db.json",
    title: "Night Drive in D♭",
    description: "City pop with sax lead, slap bass and a last-chorus key lift",
  },
].map((example) => ({
  ...example,
  href: `${routes.draft.href()}?${new URLSearchParams({ src: PIECES_URL + example.path })}`,
}));
