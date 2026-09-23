export function RouteError({
  error,
  backHref,
  backLabel,
}: {
  error: unknown;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900 text-neutral-400">
      {String(error)}
      <a href={backHref} className="text-emerald-400 hover:text-emerald-300">
        {backLabel}
      </a>
    </div>
  );
}
