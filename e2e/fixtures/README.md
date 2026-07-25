# E2E Fixtures

`test-stems.zip` is generated from `e2e/fixtures/test-audio.wav` with these entries in order:

1. `notes.txt`
2. `no_bass.wav`
3. `bass.wav`

Regenerate it from the repository root with:

```sh
node --input-type=module -e 'import { readFile, writeFile } from "node:fs/promises"; import JSZip from "jszip"; const wav = await readFile("e2e/fixtures/test-audio.wav"); const zip = new JSZip(); zip.file("notes.txt", "not audio"); zip.file("no_bass.wav", wav, { compression: "STORE" }); zip.file("bass.wav", wav, { compression: "STORE" }); await writeFile("e2e/fixtures/test-stems.zip", await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));'
```
