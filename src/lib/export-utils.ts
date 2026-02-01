type ExportFileNameOptions = {
  baseName: string;
  extension: string;
  timestamp?: Date;
};

function formatTimestamp(timestamp: Date): string {
  return timestamp
    .toISOString()
    .replace(/[T:]/g, "-")
    .replace(/\.\d+Z$/, "");
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function sanitizeBaseName(baseName: string): string {
  const trimmed = baseName.trim();
  if (!trimmed) return "toy-midi-export";
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export function buildExportFileName({
  baseName,
  extension,
  timestamp = new Date(),
}: ExportFileNameOptions): string {
  const safeName = sanitizeBaseName(baseName);
  const normalizedExtension = normalizeExtension(extension);
  const formattedTimestamp = formatTimestamp(timestamp);
  return `${safeName}-${formattedTimestamp}${normalizedExtension}`;
}
