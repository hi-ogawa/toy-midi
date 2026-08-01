export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type ExportFileNameOptions = {
  baseName: string;
  extension: string;
};

export function buildExportFileName({
  baseName,
  extension,
}: ExportFileNameOptions): string {
  const safeName = sanitizeBaseName(baseName);
  const normalizedExtension = normalizeExtension(extension);
  const formattedTimestamp = formatTimestamp(new Date());
  return `${safeName}-${formattedTimestamp}${normalizedExtension}`;
}

function sanitizeBaseName(baseName: string): string {
  const trimmed = baseName.trim();
  if (!trimmed) {
    return "toy-midi-export";
  }
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp
    .toISOString()
    .replace(/[T:]/g, "-")
    .replace(/\.\d+Z$/, "");
}
