import { routes } from "./routes";

// The examples are project files in the catalog gist, which is curated by
// hand. Its raw URLs always serve the latest revision, so editing a file there
// updates the example without a release.
const CATALOG_URL =
  "https://gist.githubusercontent.com/hi-ogawa-agent/349526d87606848b9dfb206355a4bdc1/raw/";

export const EXAMPLE_PROJECTS = [
  {
    file: "corner-store-thirds.json",
    title: "Corner Store Thirds",
    description: "Hip-hop loop layered from drum and percussion kits",
  },
  {
    file: "slow-tide.json",
    title: "Slow Tide",
    description: "Ambient waltz that drifts across the stereo field",
  },
  {
    file: "overture-in-d-minor.json",
    title: "Overture in D minor",
    description: "Orchestral overture that builds into each new section",
  },
  {
    file: "dorian-vamp-funk.json",
    title: "Dorian Vamp Funk",
    description: "Slap bass, clav and sax riffs over an E Dorian vamp",
  },
  {
    file: "cliche.json",
    title: "Clichê",
    description: "Bossa nova for flute, nylon guitar and brushes",
  },
  {
    file: "tide-engine.json",
    title: "Tide Engine",
    description: "Film cue that grows from one viola figure to full orchestra",
  },
  {
    file: "night-drive-in-db.json",
    title: "Night Drive in D♭",
    description: "City pop with sax lead, slap bass and a last-chorus key lift",
  },
].map((example) => ({
  ...example,
  href: `${routes.draft.href()}?${new URLSearchParams({ src: CATALOG_URL + example.file })}`,
}));
