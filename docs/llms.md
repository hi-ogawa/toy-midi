# Toy MIDI

> Toy MIDI is a browser-based DAW for editing MIDI and recording audio. This guide is for agents. It explains the two ways an agent can work with a project: driving the app open in the user's browser, or writing a share link that opens a song in the app.

Projects live in the browser's own storage. The app has no server, no accounts, and no API to call over HTTP. Its pages are:

- `/`, the project list.
- `/recorder/<projectId>`, a project saved in this browser.
- `/draft#p=<payload>`, a project carried in a share link. It opens unsaved, so the person who opens it can edit it and then save their own copy.

Paths in this guide are relative to the site this guide was served from, such as `https://toy-midi.hiro18181.workers.dev`.

## Choose How to Work

Drive the open app when you need to listen and revise. You can play, seek, and loop the project and hear what you changed, which is how arrangement and mixing work gets done. This needs webmcp-bridge and a browser on the same machine as you.

Write a share link when you cannot reach the user's browser, such as from a remote or cloud session, or when you are composing and the user will tell you what they think in words. You write the project as JSON, encode it into a link, and post the link.

## Drive the Open App

The app exposes its project to agents through [webmcp-bridge](https://github.com/hi-ogawa/toy-midi/tree/main/packages/webmcp-bridge), a small server on the user's machine that a browser extension connects the page to. Install the command:

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/webmcp-bridge"
```

Then run `webmcp-bridge --help`. It says how to start the bridge and wait for the user's page to connect. The user installs the extension once, following the package's README.

Once the page is connected, the project exposes one tool, `toy_midi_eval`. It runs the body of an async function with `runtime` in scope and returns a JSON value. The runtime's API is [`/llms/runtime.d.ts`](/llms/runtime.d.ts), the same declarations the tool's own description carries, so you can write code against it while you wait for the page. For example:

```js
runtime.setTempo(98);
const id = await runtime.addMidiTrack({ program: 33 });
runtime.setMidiTrackNotes(id, [
  { id: crypto.randomUUID(), pitch: 33, start: 0, duration: 1, velocity: 100 },
]);
```

## Write a Share Link

A share link is the site's `/draft` page with the project in the URL fragment:

```
<site>/draft#p=<payload>
```

The payload is the project's saved format as JSON, compressed with raw deflate, without a zlib header, and encoded as base64url. The format's type is `SerializedEditorRuntimeState` in [`/llms/project.d.ts`](/llms/project.d.ts). Notes start and last in beats from the start of the project, and the track's `program` and `bank` pick its instrument, with bank 128 holding drum kits.

A link carries MIDI tracks only. Leave `audioTracks` empty and leave out `referenceVideo`, since audio and video need storage a link does not have. Ids need only be unique, tracks within the project and notes within their track, so short ones such as `"n1"` work and keep the link shorter.

A minimal project, one bass track playing two notes:

```json
{
  "title": "Two notes",
  "tempo": 98,
  "timeSignature": { "numerator": 4, "denominator": 4 },
  "audioTracks": [],
  "midiTracks": [
    {
      "id": "bass",
      "name": "Bass",
      "program": 33,
      "height": 300,
      "gain": 1,
      "muted": false,
      "soloed": false,
      "notes": [
        { "id": "n1", "pitch": 33, "start": 0, "duration": 1, "velocity": 100 },
        { "id": "n2", "pitch": 40, "start": 1, "duration": 1, "velocity": 90 }
      ]
    }
  ]
}
```

Encode it with Node, which has raw deflate and base64url built in:

```js
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

const site = "https://toy-midi.hiro18181.workers.dev";
const project = JSON.parse(readFileSync(process.argv[2], "utf8"));
const payload = deflateRawSync(JSON.stringify(project)).toString("base64url");
console.log(`${site}/draft#p=${payload}`);
```

Keep links short where they will be posted. A chat message can cap far below what a browser accepts, such as 2,000 characters on Discord, so a short phrase fits where a whole song may not.
