import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  HouseIcon,
  ListTodoIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { routes } from "../lib/routes";
import { pluralCount } from "../utils/plural-count";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

export function ExamplesPage() {
  const examplesQuery = useQuery({
    queryKey: ["examples"],
    queryFn: fetchExamples,
    retry: false,
  });

  useEffect(() => {
    document.title = "Examples - Toy MIDI";
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-900">
      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-8 py-12">
        <header className="flex shrink-0 items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-100 tracking-tight">
              Examples
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Agent-composed pieces, newest first. Each one opens as an unsaved
              draft.
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm text-neutral-500">
            <a
              href={routes.home.href()}
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <HouseIcon className="size-4" />
              Home
            </a>
            <a
              href="https://github.com/hi-ogawa/toy-midi/issues/862"
              target="_blank"
              rel="noreferrer"
              title="Pieces still being iterated on"
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <ListTodoIcon className="size-4" />
              Tracker
            </a>
          </nav>
        </header>

        <main className="mt-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/45 shadow-2xl shadow-black/20">
          {examplesQuery.isPending ? (
            <p className="p-8 text-center text-sm text-neutral-500">
              Loading examples…
            </p>
          ) : examplesQuery.isError ? (
            <p className="p-8 text-center text-sm text-orange-300">
              {examplesQuery.error.message}
            </p>
          ) : (
            <ExampleList examples={examplesQuery.data} />
          )}
        </main>
      </div>
    </div>
  );
}

function ExampleList({ examples }: { examples: Example[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>();

  function toggleTag(tag: string) {
    setActiveTag((current) => (current === tag ? undefined : tag));
  }

  const filteredExamples = examples.filter(
    (example) =>
      (!activeTag || example.tags.includes(activeTag)) &&
      matchesExampleSearch({ example, query }),
  );
  const hasFilter = Boolean(query.trim() || activeTag);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-700/70 p-4">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-emerald-500">
          <SearchIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-neutral-500"
          />
          <input
            type="text"
            aria-label="Search examples"
            placeholder="Search names, descriptions and tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-200 outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="rounded p-1 text-neutral-400 hover:text-neutral-200"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <TagFilter
          tagCounts={countTags(examples)}
          activeTag={activeTag}
          onToggle={toggleTag}
        />
        {activeTag && (
          <button
            type="button"
            aria-label={`Remove tag filter ${activeTag}`}
            onClick={() => setActiveTag(undefined)}
            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-emerald-600 bg-emerald-600 py-0.5 pr-1.5 pl-2.5 text-xs text-white hover:bg-emerald-500"
          >
            <span className="truncate">{activeTag}</span>
            <XIcon aria-hidden="true" className="size-3.5 shrink-0" />
          </button>
        )}
        <p
          role="status"
          className="ml-auto text-right text-xs whitespace-nowrap tabular-nums text-neutral-400"
        >
          {hasFilter ? `${filteredExamples.length} of ` : ""}
          {pluralCount(examples.length, "example")}
        </p>
      </div>
      <ul className="min-h-0 overflow-y-auto scrollbar-thin p-3">
        {filteredExamples.length === 0 ? (
          <li className="py-3 text-center text-sm text-neutral-500">
            No matching examples
          </li>
        ) : (
          filteredExamples.map((example) => (
            <ExampleListItem
              key={example.url}
              example={example}
              activeTag={activeTag}
              onTagToggle={toggleTag}
            />
          ))
        )}
      </ul>
    </>
  );
}

function ExampleListItem({
  example,
  activeTag,
  onTagToggle,
}: {
  example: Example;
  activeTag?: string;
  onTagToggle: (tag: string) => void;
}) {
  return (
    <li className="rounded-lg px-3 py-3 hover:bg-neutral-800/70">
      <div className="flex items-center gap-2">
        <a
          href={getExampleHref(example)}
          className="font-medium text-neutral-100 hover:text-emerald-400"
        >
          {example.name}
        </a>
        <a
          href={example.writeup}
          target="_blank"
          rel="noreferrer"
          title="Write-up"
          aria-label={`Write-up for ${example.name}`}
          className="rounded p-0.5 text-neutral-500 transition-colors hover:text-emerald-400"
        >
          <FileTextIcon aria-hidden="true" className="size-4" />
        </a>
        <time
          dateTime={example.date}
          className="ml-auto text-xs tabular-nums text-neutral-500"
        >
          {example.date}
        </time>
      </div>
      <p className="mt-0.5 text-sm text-neutral-400">{example.description}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {example.tags.map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            active={tag === activeTag}
            onToggle={onTagToggle}
          />
        ))}
      </div>
    </li>
  );
}

function TagFilter({
  tagCounts,
  activeTag,
  onToggle,
}: {
  tagCounts: [string, number][];
  activeTag?: string;
  onToggle: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="h-9 shrink-0 gap-1.5 rounded-lg border-neutral-700 bg-neutral-900 px-3 text-sm font-normal text-neutral-300 hover:border-neutral-500 hover:bg-neutral-900">
          Tags
          <ChevronsUpDownIcon
            aria-hidden="true"
            className="size-4 opacity-50"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder="Filter tags…" />
          <CommandList>
            <CommandEmpty>No matching tags</CommandEmpty>
            {tagCounts.map(([tag, count]) => (
              <CommandItem
                key={tag}
                value={tag}
                onSelect={() => {
                  onToggle(tag);
                  setOpen(false);
                }}
              >
                <CheckIcon
                  aria-hidden="true"
                  className={tag === activeTag ? "opacity-100" : "opacity-0"}
                />
                <span className="min-w-0 flex-1 truncate">{tag}</span>
                <span className="text-xs tabular-nums text-neutral-500">
                  {count}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagChip({
  tag,
  active,
  onToggle,
}: {
  tag: string;
  active: boolean;
  onToggle: (tag: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(tag)}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200",
      )}
    >
      {tag}
    </button>
  );
}

function countTags(examples: Example[]) {
  const counts = new Map<string, number>();
  for (const example of examples) {
    for (const tag of example.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function matchesExampleSearch({
  example,
  query,
}: {
  example: Example;
  query: string;
}) {
  const text =
    `${example.name} ${example.description} ${example.tags.join(" ")}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

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

type Example = z.infer<typeof catalogSchema>[number];

async function fetchExamples(): Promise<Example[]> {
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

function getExampleHref(example: Example) {
  return `${routes.draft.href()}?${new URLSearchParams({ src: example.url })}`;
}
