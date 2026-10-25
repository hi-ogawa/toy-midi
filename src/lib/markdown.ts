import MarkdownIt from "markdown-it";

// This renderer is the only sanitization for comments, which arrive from
// share links and archives. markdown-it's defaults escape raw HTML and refuse
// script-capable link schemes. Images are off so that opening a shared comment
// never fetches a remote URL.
const md = new MarkdownIt();
md.disable("image");
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
