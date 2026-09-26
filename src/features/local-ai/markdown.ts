/**
 * A small Markdown subset for model answers. Parsing is pure so it can be
 * tested without React Native, and tolerant so half-streamed text still
 * renders sensibly.
 */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "strike"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "link"; children: InlineNode[] }
  /** A record reference such as @A1, resolved by the chat to a live record. */
  | { kind: "mention"; ref: string };

export type TableAlign = "left" | "center" | "right" | null;

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; content: InlineNode[] }
  | { kind: "paragraph"; content: InlineNode[] }
  | {
      kind: "list";
      ordered: boolean;
      items: { depth: number; marker: string; content: InlineNode[] }[];
    }
  | { kind: "quote"; content: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  /** A line containing only record references: rendered as inline cards. */
  | { kind: "mentions"; refs: string[] }
  | {
      kind: "table";
      header: InlineNode[][];
      align: TableAlign[];
      rows: InlineNode[][][];
    };

const MENTION = /@([ATBRGLSCP]\d{1,3})\b/;
const MENTION_LINE = /^(?:[-*•]\s*)?(?:@[ATBRGLSCP]\d{1,3}\b[\s,;.]*)+$/;

const INLINE_RULES: {
  pattern: RegExp;
  build: (match: RegExpExecArray) => InlineNode;
}[] = [
  { pattern: MENTION, build: (m) => ({ kind: "mention", ref: m[1] }) },
  { pattern: /`([^`\n]+)`/, build: (m) => ({ kind: "code", text: m[1] }) },
  {
    pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|__(?=\S)([\s\S]+?)(?<=\S)__/,
    build: (m) => ({ kind: "bold", children: parseInline(m[1] ?? m[2]) }),
  },
  {
    pattern: /~~(?=\S)([\s\S]+?)(?<=\S)~~/,
    build: (m) => ({ kind: "strike", children: parseInline(m[1]) }),
  },
  {
    pattern: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
    build: (m) => ({ kind: "link", children: parseInline(m[1]) }),
  },
  {
    // Underscores inside words (snake_case) are not emphasis.
    pattern: /\*(?=[^\s*])([^*\n]+?)(?<=\S)\*|(?<![\wÀ-ɏЀ-ӿ֐-׿])_(?=\S)([^_\n]+?)(?<=\S)_(?![\wÀ-ɏЀ-ӿ֐-׿])/,
    build: (m) => ({ kind: "italic", children: parseInline(m[1] ?? m[2]) }),
  },
];

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = source;
  while (rest) {
    let best: { index: number; length: number; node: InlineNode } | null =
      null;
    for (const rule of INLINE_RULES) {
      const match = rule.pattern.exec(rest);
      if (match && (!best || match.index < best.index))
        best = { index: match.index, length: match[0].length, node: rule.build(match) };
    }
    if (!best) {
      nodes.push({ kind: "text", text: rest });
      break;
    }
    if (best.index > 0) nodes.push({ kind: "text", text: rest.slice(0, best.index) });
    nodes.push(best.node);
    rest = rest.slice(best.index + best.length);
  }
  return nodes;
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", content: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```"))
        code.push(lines[index++]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        content: parseInline(heading[2].replace(/\s#+$/, "")),
      });
      continue;
    }
    if (MENTION_LINE.test(trimmed)) {
      flush();
      const refs = [...trimmed.matchAll(/@([ATBRGLSCP]\d{1,3})\b/g)].map((match) => match[1]);
      const previous = blocks[blocks.length - 1];
      // Consecutive reference lines form one group of cards.
      if (previous?.kind === "mentions") previous.refs.push(...refs);
      else blocks.push({ kind: "mentions", refs });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[index + 1])
    ) {
      flush();
      const header = splitRow(line);
      const align = splitRow(lines[index + 1]).map((cell): TableAlign =>
        cell.startsWith(":") && cell.endsWith(":")
          ? "center"
          : cell.endsWith(":")
            ? "right"
            : cell.startsWith(":")
              ? "left"
              : null,
      );
      index += 2;
      const rows: InlineNode[][][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitRow(lines[index++]);
        rows.push(header.map((_, column) => parseInline(cells[column] ?? "")));
      }
      index--;
      blocks.push({ kind: "table", header: header.map((cell) => parseInline(cell)), align, rows });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">"))
        quote.push(lines[index++].trim().replace(/^>\s?/, ""));
      index--;
      blocks.push({ kind: "quote", content: parseInline(quote.join("\n")) });
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      const items: { depth: number; marker: string; content: InlineNode[] }[] = [];
      while (index < lines.length) {
        const current = lines[index].match(LIST_ITEM);
        if (current) {
          items.push({
            depth: Math.min(Math.floor(current[1].replace(/\t/g, "  ").length / 2), 3),
            marker: /\d/.test(current[2]) ? current[2].replace(")", ".") : "•",
            content: parseInline(current[3]),
          });
          index++;
          continue;
        }
        // Indented continuation lines belong to the previous item.
        if (items.length && /^\s{2,}\S/.test(lines[index])) {
          const last = items[items.length - 1];
          last.content = [...last.content, { kind: "text", text: ` ${lines[index].trim()}` }];
          index++;
          continue;
        }
        break;
      }
      index--;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

export function plainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === "mention" ? "" : "text" in node ? node.text : plainText(node.children),
    )
    .join("");
}

/** True for cells that read as amounts, so tables can align them to the end. */
export function isNumericCell(nodes: InlineNode[]) {
  const text = plainText(nodes).trim();
  return /^[-+−]?[^\d\s]{0,3}\s?[\d.,]+\s?(%|[A-Z]{3}|[^\d\s]{1,3})?$/.test(text);
}
