import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, lists, and tables", () => {
    expect(
      renderMarkdown(
        "## Chords\n\n- verse\n\n| Dm7 | G7 |\n| --- | --- |\n| 1 | 2 |",
      ),
    ).toMatchInlineSnapshot(`
      "<h2>Chords</h2>
      <ul>
      <li>verse</li>
      </ul>
      <table>
      <thead>
      <tr>
      <th>Dm7</th>
      <th>G7</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>1</td>
      <td>2</td>
      </tr>
      </tbody>
      </table>
      "
    `);
  });

  it("escapes raw HTML and does not link script-capable schemes", () => {
    expect(
      renderMarkdown(
        "<script>alert(1)</script>\n\n[a](javascript:alert(1)) [b](data:text/html,x)",
      ),
    ).toMatchInlineSnapshot(`
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
      <p>[a](javascript:alert(1)) [b](data:text/html,x)</p>
      "
    `);
  });

  it("renders an image as a link instead of loading it", () => {
    expect(renderMarkdown("![pixel](https://example.com/pixel.png)"))
      .toMatchInlineSnapshot(`
      "<p>!<a href="https://example.com/pixel.png" target="_blank" rel="noopener noreferrer">pixel</a></p>
      "
    `);
  });
});
