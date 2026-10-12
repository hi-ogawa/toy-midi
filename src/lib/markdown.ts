import MarkdownIt from "markdown-it";

// This renderer is the only sanitization for comments, which arrive from
// share links and archives. Images are off so that opening a shared comment
// never fetches a remote URL.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
md.disable("image");
md.validateLink = (url) => /^(https?|mailto):/i.test(url.trim());
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
