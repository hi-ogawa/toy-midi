import { routes } from "./routes";

// Each example is a share link copied from the editor and pasted into
// `src/examples/<id>.txt`. Update one by opening it, editing, and pasting the
// new link over the file.
const SHARE_LINKS = import.meta.glob<string>("../examples/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const EXAMPLE_PROJECTS = [
  {
    id: "corner-store-thirds",
    title: "Corner Store Thirds",
    description: "Hip-hop loop layered from drum and percussion kits",
  },
  {
    id: "slow-tide",
    title: "Slow Tide",
    description: "Ambient waltz that drifts across the stereo field",
  },
  {
    id: "overture-in-d-minor",
    title: "Overture in D minor",
    description: "Orchestral overture that builds into each new section",
  },
  {
    id: "dorian-vamp-funk",
    title: "Dorian Vamp Funk",
    description: "Slap bass, clav and sax riffs over an E Dorian vamp",
  },
  {
    id: "cliche",
    title: "Clichê",
    description: "Bossa nova for flute, nylon guitar and brushes",
  },
  {
    id: "tide-engine",
    title: "Tide Engine",
    description: "Film cue that grows from one viola figure to full orchestra",
  },
  {
    id: "night-drive",
    title: "Night Drive in D♭",
    description: "City pop with sax lead, slap bass and a last-chorus key lift",
  },
].map((example) => ({ ...example, href: getExampleHref(example.id) }));

// The link points at whichever deployment it was copied from, so keep only its
// hash, which carries the project.
function getExampleHref(id: string): string {
  const link = SHARE_LINKS[`../examples/${id}.txt`];
  return routes.draft.href() + new URL(link.trim()).hash;
}
