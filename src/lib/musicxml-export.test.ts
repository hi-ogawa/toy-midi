import { describe, expect, it } from "vitest";
import { Note } from "../types";
import { buildMusicXMLScore, exportMusicXML } from "./musicxml-export";

describe("MusicXML score model", () => {
  it("builds measures, rests, chords, and ties", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 64,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-3",
        pitch: 55,
        start: 3,
        duration: 2,
        velocity: 100,
      },
    ];

    const score = buildMusicXMLScore({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(score).toMatchInlineSnapshot(`
      {
        "part": {
          "id": "P1",
          "measures": [
            {
              "attributes": {
                "clef": {
                  "line": 4,
                  "sign": "F",
                },
                "divisions": 24,
                "keyFifths": 0,
                "timeSignature": {
                  "denominator": 4,
                  "numerator": 4,
                },
              },
              "direction": {
                "tempo": 120,
              },
              "notes": [
                {
                  "chord": false,
                  "durationDivisions": 24,
                  "notationDuration": {
                    "dots": 0,
                    "type": "quarter",
                  },
                  "pitch": {
                    "alter": undefined,
                    "octave": 4,
                    "step": "C",
                  },
                  "tieStart": false,
                  "tieStop": false,
                  "voice": 1,
                },
                {
                  "chord": true,
                  "durationDivisions": 24,
                  "notationDuration": {
                    "dots": 0,
                    "type": "quarter",
                  },
                  "pitch": {
                    "alter": undefined,
                    "octave": 4,
                    "step": "E",
                  },
                  "tieStart": false,
                  "tieStop": false,
                  "voice": 1,
                },
                {
                  "chord": false,
                  "durationDivisions": 48,
                  "notationDuration": {
                    "dots": 0,
                    "type": "half",
                  },
                  "rest": true,
                  "voice": 1,
                },
                {
                  "chord": false,
                  "durationDivisions": 24,
                  "notationDuration": {
                    "dots": 0,
                    "type": "quarter",
                  },
                  "pitch": {
                    "alter": undefined,
                    "octave": 3,
                    "step": "G",
                  },
                  "tieStart": true,
                  "tieStop": false,
                  "voice": 1,
                },
              ],
              "number": 1,
            },
            {
              "attributes": undefined,
              "direction": undefined,
              "notes": [
                {
                  "chord": false,
                  "durationDivisions": 24,
                  "notationDuration": {
                    "dots": 0,
                    "type": "quarter",
                  },
                  "pitch": {
                    "alter": undefined,
                    "octave": 3,
                    "step": "G",
                  },
                  "tieStart": false,
                  "tieStop": true,
                  "voice": 1,
                },
                {
                  "chord": false,
                  "durationDivisions": 72,
                  "notationDuration": {
                    "dots": 1,
                    "type": "half",
                  },
                  "rest": true,
                  "voice": 1,
                },
              ],
              "number": 2,
            },
          ],
          "name": "Bass",
        },
        "title": "Untitled",
      }
    `);
  });

  it("builds a non-4/4 measure", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const score = buildMusicXMLScore({
      notes,
      tempo: 120,
      timeSignature: { numerator: 6, denominator: 8 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(score).toMatchInlineSnapshot(`
      {
        "part": {
          "id": "P1",
          "measures": [
            {
              "attributes": {
                "clef": {
                  "line": 4,
                  "sign": "F",
                },
                "divisions": 24,
                "keyFifths": 0,
                "timeSignature": {
                  "denominator": 8,
                  "numerator": 6,
                },
              },
              "direction": {
                "tempo": 120,
              },
              "notes": [
                {
                  "chord": false,
                  "durationDivisions": 24,
                  "notationDuration": {
                    "dots": 0,
                    "type": "quarter",
                  },
                  "pitch": {
                    "alter": undefined,
                    "octave": 4,
                    "step": "C",
                  },
                  "tieStart": false,
                  "tieStop": false,
                  "voice": 1,
                },
                {
                  "chord": false,
                  "durationDivisions": 48,
                  "notationDuration": {
                    "dots": 0,
                    "type": "half",
                  },
                  "rest": true,
                  "voice": 1,
                },
              ],
              "number": 1,
            },
          ],
          "name": "Bass",
        },
        "title": "Untitled",
      }
    `);
  });
});

describe("MusicXML export", () => {
  it("exports a minimal one-part bass-clef score", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>4</beats>
                <beat-type>4</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>72</duration>
              <voice>1</voice>
              <type>half</type>
              <dot/>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });

  it("exports a full-measure rest for an empty score", () => {
    const xml = exportMusicXML({
      notes: [],
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>4</beats>
                <beat-type>4</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <rest/>
              <duration>96</duration>
              <voice>1</voice>
              <type>whole</type>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });

  it("emits rests for gaps between notes", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 62,
        start: 2,
        duration: 1,
        velocity: 100,
      },
    ];

    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>4</beats>
                <beat-type>4</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <pitch>
                <step>D</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });

  it("represents same-onset notes as a MusicXML chord", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 64,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>4</beats>
                <beat-type>4</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <chord/>
              <pitch>
                <step>E</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>72</duration>
              <voice>1</voice>
              <type>half</type>
              <dot/>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });

  it("splits notes at measure boundaries and ties the fragments", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 3,
        duration: 2,
        velocity: 100,
      },
    ];

    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>4</beats>
                <beat-type>4</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <rest/>
              <duration>72</duration>
              <voice>1</voice>
              <type>half</type>
              <dot/>
            </note>
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <tie type="start"/>
              <voice>1</voice>
              <type>quarter</type>
              <notations>
                <tied type="start"/>
              </notations>
            </note>
          </measure>
          <measure number="2">
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <tie type="stop"/>
              <voice>1</voice>
              <type>quarter</type>
              <notations>
                <tied type="stop"/>
              </notations>
            </note>
            <note>
              <rest/>
              <duration>72</duration>
              <voice>1</voice>
              <type>half</type>
              <dot/>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });

  it("exports non-4/4 time signatures", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 6, denominator: 8 },
      title: "Untitled",
      partName: "Bass",
    });

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0">
        <work>
          <work-title>Untitled</work-title>
        </work>
        <movement-title>Untitled</movement-title>
        <part-list>
          <score-part id="P1">
            <part-name>Bass</part-name>
          </score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>24</divisions>
              <key>
                <fifths>0</fifths>
              </key>
              <time>
                <beats>6</beats>
                <beat-type>8</beat-type>
              </time>
              <clef>
                <sign>F</sign>
                <line>4</line>
              </clef>
            </attributes>
            <direction placement="above">
              <direction-type>
                <metronome>
                  <beat-unit>quarter</beat-unit>
                  <per-minute>120</per-minute>
                </metronome>
              </direction-type>
              <sound tempo="120"/>
            </direction>
            <note>
              <pitch>
                <step>C</step>
                <octave>4</octave>
              </pitch>
              <duration>24</duration>
              <voice>1</voice>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>48</duration>
              <voice>1</voice>
              <type>half</type>
            </note>
          </measure>
        </part>
      </score-partwise>
      "
    `);
  });
});
