import { SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";

export function ProjectListSearch({
  query,
  onQueryChange,
  count,
  total,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  count: number;
  total: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function clear() {
    onQueryChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-emerald-500">
        <SearchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-500"
        />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search projects"
          placeholder="Search projects…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clear();
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-200 outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="rounded p-1 text-neutral-400 hover:text-neutral-200"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <p role="status" className="mt-2 text-xs text-neutral-500">
        {count} of {total} projects
      </p>
    </div>
  );
}

export function matchesProjectSearch({
  name,
  query,
}: {
  name: string;
  query: string;
}) {
  const normalizedName = name.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => normalizedName.includes(word));
}
