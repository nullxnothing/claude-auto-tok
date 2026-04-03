import React from "react";
import { useCurrentFrame } from "remotion";

interface CodeTypingProps {
  lines: string[];
  charsPerFrame: number;
  accentColor: string;
  startFrame?: number;
}

const SYNTAX_COLORS: Record<string, string> = {
  keyword: "#c678dd",
  string: "#98c379",
  comment: "#5c6370",
  function: "#61afef",
  number: "#d19a66",
  operator: "#56b6c2",
  default: "#abb2bf",
};

function colorizeToken(token: string): { text: string; color: string } {
  const keywords = ["const", "let", "var", "function", "return", "import", "export", "from", "async", "await", "if", "else", "class", "new", "this", "pub", "fn", "use", "mod", "struct", "impl"];
  const trimmed = token.replace(/[^a-zA-Z]/g, "");

  if (keywords.includes(trimmed)) return { text: token, color: SYNTAX_COLORS.keyword };
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) return { text: token, color: SYNTAX_COLORS.string };
  if (token.startsWith("//") || token.startsWith("#")) return { text: token, color: SYNTAX_COLORS.comment };
  if (/^\d+/.test(token)) return { text: token, color: SYNTAX_COLORS.number };
  if (/^[=+\-*/<>!&|]+$/.test(token)) return { text: token, color: SYNTAX_COLORS.operator };
  if (/\(/.test(token)) return { text: token, color: SYNTAX_COLORS.function };
  return { text: token, color: SYNTAX_COLORS.default };
}

export const CodeTyping: React.FC<CodeTypingProps> = ({
  lines,
  charsPerFrame = 0.8,
  accentColor,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - startFrame;
  if (elapsed < 0) return null;

  const totalChars = Math.floor(elapsed * charsPerFrame);
  const cursorBlink = Math.floor(frame / 15) % 2 === 0;

  let charsRemaining = totalChars;
  const renderedLines: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (charsRemaining <= 0) break;

    const visibleChars = Math.min(charsRemaining, line.length);
    const visibleText = line.slice(0, visibleChars);
    charsRemaining -= visibleChars;

    const isCurrentLine = charsRemaining <= 0 && visibleChars < line.length;
    const tokens = visibleText.split(/(\s+)/);

    renderedLines.push(
      <div key={i} style={{ display: "flex", minHeight: 28 }}>
        <span
          style={{
            color: "#5c6370",
            fontSize: 24,
            width: 40,
            textAlign: "right",
            marginRight: 16,
            userSelect: "none",
          }}
        >
          {i + 1}
        </span>
        <span style={{ fontSize: 26, fontFamily: "'IBM Plex Mono', monospace" }}>
          {tokens.map((token, j) => {
            const { text, color } = colorizeToken(token);
            return (
              <span key={j} style={{ color }}>
                {text}
              </span>
            );
          })}
          {isCurrentLine && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 22,
                backgroundColor: cursorBlink ? accentColor : "transparent",
                marginLeft: 1,
                verticalAlign: "middle",
              }}
            />
          )}
        </span>
      </div>
    );

    if (visibleChars >= line.length) {
      charsRemaining -= 1; // newline char
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "16px 0",
      }}
    >
      {renderedLines}
    </div>
  );
};
