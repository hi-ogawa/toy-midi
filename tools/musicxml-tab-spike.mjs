import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = path.join(
  import.meta.dirname,
  "../.tmp/musicxml-tab-spike.musicxml",
);

const musicXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>MusicXML Tab Annotation Spike</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>5-string Bass</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
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
        <staff-details>
          <staff-lines>5</staff-lines>
          <staff-tuning line="1">
            <tuning-step>B</tuning-step>
            <tuning-octave>0</tuning-octave>
          </staff-tuning>
          <staff-tuning line="2">
            <tuning-step>E</tuning-step>
            <tuning-octave>1</tuning-octave>
          </staff-tuning>
          <staff-tuning line="3">
            <tuning-step>A</tuning-step>
            <tuning-octave>1</tuning-octave>
          </staff-tuning>
          <staff-tuning line="4">
            <tuning-step>D</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
          <staff-tuning line="5">
            <tuning-step>G</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
        </staff-details>
      </attributes>
      <note>
        <pitch>
          <step>B</step>
          <octave>0</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>5</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>1</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>4</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>1</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>4</string>
            <fret>5</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>2</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
  </part>
</score-partwise>
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, musicXml);
console.log(`wrote ${outputPath}`);
