import type { Locator } from "../types";
import {
  KEY_SIGNATURE_OPTION_GROUPS,
  type KeySignature,
} from "./pitch-spelling";

export function parseLocatorLabel(locator: Locator): {
  label: string;
  keySignature?: KeySignature;
} {
  let keySignature: KeySignature | undefined;
  const labelWithoutDirectives = locator.label.replace(
    /\[!([a-z][a-z0-9-]*):\s*([^\]]*)\]/gi,
    (_directive, name: string, value: string) => {
      if (name.toLowerCase() !== "key") {
        throw new Error(
          `Unknown score directive ${name} in locator ${locator.id}`,
        );
      }
      if (keySignature) {
        throw new Error(
          `Locator ${locator.id} has multiple key signature directives`,
        );
      }
      keySignature = parseKeySignature(value, locator.id);
      return "";
    },
  );
  if (labelWithoutDirectives.includes("[!")) {
    throw new Error(`Malformed score directive in locator ${locator.id}`);
  }
  const label = keySignature
    ? labelWithoutDirectives.replace(/\s+/g, " ").trim()
    : locator.label;
  return { label, keySignature };
}

function parseKeySignature(value: string, locatorId: string): KeySignature {
  const normalized = normalizeKeySignatureLabel(value);
  for (const group of KEY_SIGNATURE_OPTION_GROUPS) {
    const option = group.options.find(
      (candidate) => normalizeKeySignatureLabel(candidate.label) === normalized,
    );
    if (option) {
      return { fifths: option.fifths, mode: group.mode };
    }
  }
  throw new Error(
    `Unsupported key signature "${value.trim()}" in locator ${locatorId}`,
  );
}

function normalizeKeySignatureLabel(value: string): string {
  return value
    .trim()
    .replaceAll("♯", "#")
    .replaceAll("♭", "b")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
