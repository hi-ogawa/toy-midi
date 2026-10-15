// List the presets of SF2 or SF3 SoundFonts with their velocity layers, key
// ranges, and samples, to see what a font offers before rendering with it.
//
// Usage:
//   tsx tools/render/soundfont-info.ts font.sf2 [more.sf3 ...]

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const USAGE = "usage: tsx tools/render/soundfont-info.ts <font.sf2>...";

// Generator operators from the SoundFont 2.04 spec.
const INSTRUMENT = 41;
const KEY_RANGE = 43;
const VELOCITY_RANGE = 44;
const SAMPLE_ID = 53;

// sampleType bit that SF3 sets on Ogg Vorbis compressed samples.
const COMPRESSED_SAMPLE = 0x10;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h", default: false } },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length === 0) {
    throw new Error(USAGE);
  }
  for (const fontPath of positionals) {
    console.log(describeSoundFont(fontPath, await readFile(fontPath)));
  }
}

function describeSoundFont(fontPath: string, file: Buffer): string {
  const chunks = readChunks(file);
  const sampleBytes = chunks.get("smpl")?.length ?? 0;
  const samples = readRecords(chunks, "shdr", 46)
    .slice(0, -1)
    .map((record) => ({
      sampleRate: record.readUInt32LE(36),
      sampleType: record.readUInt16LE(44),
    }));
  const sampleRates = samples.map((sample) => sample.sampleRate);
  const compressed = samples.some(
    (sample) => sample.sampleType & COMPRESSED_SAMPLE,
  );
  const lines = [
    `== ${path.basename(fontPath)}: file ${formatMiB(file.length)}, ` +
      `sample data ${formatMiB(sampleBytes)}${compressed ? " (SF3, Ogg Vorbis)" : ""}, ` +
      `${samples.length} samples, ${chunks.has("sm24") ? 24 : 16}-bit, ` +
      `${Math.min(...sampleRates)}-${Math.max(...sampleRates)} Hz`,
  ];

  const presetHeaders = readRecords(chunks, "phdr", 38);
  const presetZones = readZones(chunks, "pbag", "pgen");
  const instrumentHeaders = readRecords(chunks, "inst", 22);
  const instrumentZones = readZones(chunks, "ibag", "igen");
  // Each header's zones run up to the next header's first zone, and a
  // terminal record closes the last one.
  for (let i = 0; i < presetHeaders.length - 1; i++) {
    const header = presetHeaders[i];
    const instruments = new Set(
      presetZones
        .slice(header.readUInt16LE(24), presetHeaders[i + 1].readUInt16LE(24))
        .flatMap((zone) => zone.get(INSTRUMENT)?.readUInt16LE() ?? []),
    );
    let zoneCount = 0;
    const velocityRanges = new Set<string>();
    const keyRanges = new Set<string>();
    const sampleIds = new Set<number>();
    for (const instrument of instruments) {
      const zones = instrumentZones.slice(
        instrumentHeaders[instrument].readUInt16LE(20),
        instrumentHeaders[instrument + 1].readUInt16LE(20),
      );
      // Zones without a sample are global zones with shared defaults.
      for (const zone of zones) {
        const sampleId = zone.get(SAMPLE_ID)?.readUInt16LE();
        if (sampleId === undefined) {
          continue;
        }
        zoneCount++;
        velocityRanges.add(formatRange(zone.get(VELOCITY_RANGE)));
        keyRanges.add(formatRange(zone.get(KEY_RANGE)));
        sampleIds.add(sampleId);
      }
    }
    const bank = header.readUInt16LE(22);
    const program = header.readUInt16LE(20);
    lines.push(
      `   ${bank}/${String(program).padStart(3)} ${readName(header).padEnd(20)} ` +
        `zones ${String(zoneCount).padStart(4)}, velocity layers ${velocityRanges.size}, ` +
        `key ranges ${keyRanges.size}, samples ${sampleIds.size}`,
    );
  }
  return lines.join("\n");
}

// A SoundFont is a RIFF file whose LIST chunks group the sample data (sdta)
// and the preset, instrument, and sample headers (pdta). Map every subchunk
// by its id.
function readChunks(file: Buffer): Map<string, Buffer> {
  const chunks = new Map<string, Buffer>();
  const readList = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      const id = file.toString("latin1", offset, offset + 4);
      const size = file.readUInt32LE(offset + 4);
      const body = file.subarray(offset + 8, offset + 8 + size);
      if (id === "LIST") {
        readList(offset + 12, offset + 8 + size);
      } else {
        chunks.set(id, body);
      }
      // Chunks are padded to an even size.
      offset += 8 + size + (size & 1);
    }
  };
  readList(12, file.length);
  return chunks;
}

function readRecords(
  chunks: Map<string, Buffer>,
  id: string,
  size: number,
): Buffer[] {
  const chunk = chunks.get(id);
  if (!chunk) {
    throw new Error(`Missing ${id} chunk`);
  }
  return Array.from({ length: chunk.length / size }, (_, i) =>
    chunk.subarray(i * size, (i + 1) * size),
  );
}

// Read each zone as a map from generator operator to its 2-byte amount.
function readZones(
  chunks: Map<string, Buffer>,
  bagId: string,
  generatorId: string,
): Map<number, Buffer>[] {
  const bags = readRecords(chunks, bagId, 4);
  const generators = readRecords(chunks, generatorId, 4);
  return bags
    .slice(0, -1)
    .map(
      (bag, i) =>
        new Map(
          generators
            .slice(bag.readUInt16LE(0), bags[i + 1].readUInt16LE(0))
            .map((generator) => [
              generator.readUInt16LE(0),
              generator.subarray(2, 4),
            ]),
        ),
    );
}

function readName(record: Buffer): string {
  return record.toString("latin1", 0, 20).split("\0")[0];
}

// A range amount holds the low value, then the high value.
function formatRange(amount: Buffer | undefined): string {
  return amount ? `${amount[0]}-${amount[1]}` : "0-127";
}

function formatMiB(bytes: number): string {
  return `${(bytes / 2 ** 20).toFixed(1)} MiB`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
