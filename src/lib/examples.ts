import { z } from "zod";
import { routes } from "./routes";

// The catalog is curated by hand in llm-music-probe. Its raw URL on main always
// serves the latest version, so editing it there updates the examples without
// a release.
const CATALOG_URL =
  "https://raw.githubusercontent.com/hi-ogawa/llm-music-probe/main/compositions/catalog.json";

const catalogSchema = z.array(
  z.object({
    name: z.string(),
    description: z.string(),
    date: z.string(),
    tags: z.array(z.string()),
    url: z.string(),
    writeup: z.string(),
  }),
);

export type Example = z.infer<typeof catalogSchema>[number];

export async function fetchExamples(): Promise<Example[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_URL);
  } catch {
    throw new Error("Could not fetch the examples.");
  }
  if (!response.ok) {
    throw new Error(`Could not fetch the examples (HTTP ${response.status}).`);
  }
  return catalogSchema.parse(await response.json());
}

export function getExampleHref(example: Example) {
  return `${routes.draft.href()}?${new URLSearchParams({ src: example.url })}`;
}
