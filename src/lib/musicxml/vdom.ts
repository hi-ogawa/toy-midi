export type XmlNode = string | number | false | undefined | XmlElement;

export type XmlElement = {
  tag: string;
  attributes?: Record<string, string | number | undefined>;
  children: XmlNode[];
};

export function h(
  tag: string,
  attributes?: XmlElement["attributes"],
  ...children: XmlNode[]
): XmlElement {
  return { tag, attributes, children };
}

export function hx(tag: string, ...children: XmlNode[]): XmlElement {
  return h(tag, undefined, ...children);
}

export function renderXml(node: XmlNode, depth = 0): string {
  if (node === false || node === undefined) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return escapeXml(String(node));
  }
  const indent = "  ".repeat(depth);
  const attributes = Object.entries(node.attributes ?? {})
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join("");
  const children = node.children.filter(
    (child) => child !== false && child !== undefined,
  );
  if (children.length === 0) {
    return `${indent}<${node.tag}${attributes}/>`;
  }
  if (
    children.every(
      (child) => typeof child === "string" || typeof child === "number",
    )
  ) {
    return `${indent}<${node.tag}${attributes}>${children.map((child) => renderXml(child)).join("")}</${node.tag}>`;
  }
  return `${indent}<${node.tag}${attributes}>
${children.map((child) => renderXml(child, depth + 1)).join("\n")}
${indent}</${node.tag}>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
