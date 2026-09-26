import { Fragment, memo, useMemo, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { Text } from "@/shared/ui/app-text";
import {
  isNumericCell,
  parseMarkdown,
  plainText,
  type InlineNode,
  type MarkdownBlock,
  type TableAlign,
} from "../markdown";
import { detectDirection, type TextDirection } from "../text-direction";

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * Invisible marks fix the bidi base direction, so a Hebrew line that opens
 * with "EUR" or a number is still laid out right-to-left (and vice versa).
 */
const DIRECTION_MARK = { ltr: "‎", rtl: "‏" } as const;

/**
 * Text whose alignment follows its own language, not the app language.
 * `textAlign: "left"` resolves to the start of the enclosing layout direction,
 * which `DirectionBlock` sets from the same detection.
 */
function DirText({
  dir,
  className,
  style,
  children,
  accessibilityRole,
}: {
  dir: TextDirection;
  className?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  accessibilityRole?: "header";
}) {
  return (
    <Text
      accessibilityRole={accessibilityRole}
      className={className}
      style={[{ writingDirection: dir, textAlign: "left" }, style]}
    >
      {DIRECTION_MARK[dir]}
      {children}
    </Text>
  );
}

function DirectionBlock({
  dir,
  children,
}: {
  dir: TextDirection;
  children: ReactNode;
}) {
  return <View style={{ direction: dir }}>{children}</View>;
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "text":
            return <Fragment key={index}>{node.text}</Fragment>;
          case "bold":
            return (
              <Text key={index} className="font-manrope-bold text-foreground">
                <Inline nodes={node.children} />
              </Text>
            );
          case "italic":
            return (
              <Text key={index} style={{ fontStyle: "italic" }}>
                <Inline nodes={node.children} />
              </Text>
            );
          case "strike":
            return (
              <Text key={index} style={{ textDecorationLine: "line-through" }}>
                <Inline nodes={node.children} />
              </Text>
            );
          case "link":
            return (
              <Text key={index} className="text-accent">
                <Inline nodes={node.children} />
              </Text>
            );
          case "code":
            return (
              <Text
                key={index}
                className="bg-surface-secondary text-foreground"
                style={{ fontFamily: MONOSPACE, fontSize: 13 }}
              >
                {` ${node.text} `}
              </Text>
            );
        }
      })}
    </>
  );
}

const HEADING_CLASS = {
  1: "text-xl",
  2: "text-lg",
  3: "text-base",
} as const;

/** "left"/"right" mean start/end inside a direction-aware block. */
function cellAlign(align: TableAlign, numeric: boolean) {
  const value = align ?? (numeric ? "right" : "left");
  return value === "center" ? "center" : value === "right" ? "right" : "left";
}

function blockText(block: MarkdownBlock) {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "quote":
      return plainText(block.content);
    case "list":
      return block.items.map((item) => plainText(item.content)).join(" ");
    case "table":
      return [block.header, ...block.rows]
        .flat()
        .map((cell) => plainText(cell))
        .join(" ");
    default:
      return "";
  }
}

function Table({
  block,
}: {
  block: Extract<MarkdownBlock, { kind: "table" }>;
}) {
  const numeric = block.header.map(
    (_, column) =>
      block.rows.length > 0 &&
      block.rows.every(
        (row) => isNumericCell(row[column]) || !plainText(row[column]).trim(),
      ),
  );
  // Fixed widths keep columns aligned across independently laid-out rows.
  const widths = block.header.map((_, column) =>
    Math.round(
      Math.min(
        200,
        Math.max(
          64,
          Math.max(
            ...[block.header, ...block.rows].map(
              (row) => plainText(row[column]).length,
            ),
          ) *
            8 +
            24,
        ),
      ),
    ),
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-1"
    >
      <View className="mx-1 overflow-hidden rounded-xl border border-border">
        {[block.header, ...block.rows].map((row, rowIndex) => (
          <View
            key={rowIndex}
            className={`flex-row ${rowIndex === 0 ? "bg-surface-secondary" : rowIndex % 2 === 0 ? "bg-surface-secondary/40" : ""} ${rowIndex > 0 ? "border-t border-border" : ""}`}
          >
            {row.map((cell, column) => {
              const dir = detectDirection(plainText(cell), "ltr");
              return (
                <View
                  key={column}
                  className="px-3 py-2"
                  style={{ width: widths[column] }}
                >
                  <DirText
                    dir={dir}
                    className={`text-sm leading-5 ${rowIndex === 0 ? "font-manrope-bold text-muted" : "text-foreground"}`}
                    style={{
                      textAlign: cellAlign(
                        block.align[column] ?? null,
                        numeric[column],
                      ),
                    }}
                  >
                    <Inline nodes={cell} />
                  </DirText>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Block({ block, dir }: { block: MarkdownBlock; dir: TextDirection }) {
  switch (block.kind) {
    case "heading":
      return (
        <DirText
          dir={dir}
          accessibilityRole="header"
          className={`mt-1 font-manrope-bold text-foreground ${HEADING_CLASS[block.level]}`}
        >
          <Inline nodes={block.content} />
        </DirText>
      );
    case "paragraph":
      return (
        <DirText dir={dir} className="text-[15px] leading-6 text-foreground">
          <Inline nodes={block.content} />
        </DirText>
      );
    case "list":
      return (
        <View className="gap-1.5">
          {block.items.map((item, itemIndex) => (
            <View
              key={itemIndex}
              className="flex-row gap-2"
              style={{ paddingStart: item.depth * 16 }}
            >
              <DirText
                dir={dir}
                className={`text-[15px] leading-6 ${block.ordered ? "min-w-5 text-muted" : "text-accent"}`}
              >
                {item.marker}
              </DirText>
              <View className="flex-1">
                <DirText
                  dir={dir}
                  className="text-[15px] leading-6 text-foreground"
                >
                  <Inline nodes={item.content} />
                </DirText>
              </View>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View className="rounded-e-xl border-s-4 border-accent bg-surface-secondary px-3 py-2">
          <DirText dir={dir} className="text-[15px] leading-6 text-muted">
            <Inline nodes={block.content} />
          </DirText>
        </View>
      );
    case "code":
      return (
        <ScrollView
          horizontal
          className="rounded-xl bg-surface-secondary"
          contentContainerClassName="p-3"
        >
          <DirText
            dir="ltr"
            className="text-foreground"
            style={{ fontFamily: MONOSPACE, fontSize: 13 }}
          >
            {block.text}
          </DirText>
        </ScrollView>
      );
    case "rule":
      return <View className="my-1 h-px bg-border" />;
    case "table":
      return <Table block={block} />;
  }
}

/**
 * Renders a model answer as readable Markdown. Each block is aligned by the
 * language it is written in; blocks without letters follow the whole answer.
 */
export const MarkdownMessage = memo(function MarkdownMessage({
  text,
}: {
  text: string;
}) {
  const blocks = useMemo(() => {
    const base = detectDirection(text, "ltr");
    return parseMarkdown(text).map((block) => ({
      block,
      dir:
        block.kind === "code" ? ("ltr" as const) : detectDirection(blockText(block), base),
    }));
  }, [text]);
  return (
    <View className="gap-2.5">
      {blocks.map(({ block, dir }, index) => (
        <DirectionBlock key={index} dir={dir}>
          <Block block={block} dir={dir} />
        </DirectionBlock>
      ))}
    </View>
  );
});

/** Plain user text with the same language-based alignment. */
export function DirectionalText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const dir = detectDirection(text, "ltr");
  return (
    <DirectionBlock dir={dir}>
      <DirText dir={dir} className={className}>
        {text}
      </DirText>
    </DirectionBlock>
  );
}
