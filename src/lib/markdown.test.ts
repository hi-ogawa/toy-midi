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

  it("escapes raw HTML", () => {
    expect(
      renderMarkdown(
        '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
      ),
    ).toMatchInlineSnapshot(`
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
      <p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>
      "
    `);
  });

  it("opens http, https, and mailto links in a new tab", () => {
    expect(
      renderMarkdown(
        "[a](https://example.com) [b](http://example.com) [c](mailto:a@example.com)",
      ),
    ).toMatchInlineSnapshot(`
      "<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">a</a> <a href="http://example.com" target="_blank" rel="noopener noreferrer">b</a> <a href="mailto:a@example.com" target="_blank" rel="noopener noreferrer">c</a></p>
      "
    `);
  });

  it("does not link other schemes", () => {
    expect(
      renderMarkdown(
        "[a](javascript:alert(1)) [b](data:text/html,x) [c](/relative) [d](#top)",
      ),
    ).toMatchInlineSnapshot(`
      "<p>[a](javascript:alert(1)) [b](data:text/html,x) [c](/relative) [d](#top)</p>
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
