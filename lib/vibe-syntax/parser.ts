// Parses "Vibe Syntax" -- the small function-call language users paste into
// the CODE box (usually written for them by an AI assistant). Example input:
//
//   trim(clip: "clip_01", start: 0, end: 5)
//   overlay(clip: "clip_02", time: [3, 6], x: 10cm, y: 4cm, size: 20cm)
//
// This does NOT execute anything -- it just turns text into structured
// data. The render engine (ffmpeg-engine.ts) is what actually acts on it.
// Keeping these separate means adding a new function later (cut, merge,
// addAudio, etc.) never requires touching the parser itself.

export type VibeValue = string | number | number[];

export type VibeCall = {
  name: string;
  args: Record<string, VibeValue>;
};

export type ParseError = {
  line: number;
  message: string;
};

export type ParseResult = {
  calls: VibeCall[];
  errors: ParseError[];
};

/** Splits a string on commas, but ignores commas that are inside [ ] or " ". */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (const char of input) {
    if (char === '"') inString = !inString;
    if (!inString) {
      if (char === "[") depth++;
      if (char === "]") depth--;
    }
    if (char === "," && depth === 0 && !inString) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseValue(raw: string): VibeValue {
  const trimmed = raw.trim();

  // Quoted string: "clip_01"
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  // Array: [3, 6]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((n) => parseFloat(n.trim()))
      .filter((n) => !Number.isNaN(n));
  }

  // Number with an optional unit suffix, e.g. "10cm" -> 10
  const numMatch = trimmed.match(/^(-?\d+(\.\d+)?)([a-zA-Z%]*)$/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  // Fallback: treat as a bare (unquoted) string
  return trimmed;
}

export function parseVibeSyntax(source: string): ParseResult {
  const calls: VibeCall[] = [];
  const errors: ParseError[] = [];

  // Strip // comments (but not inside quoted strings)
  const lines = source.split("\n").map((line) => {
    let inString = false;
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] === '"') inString = !inString;
      if (!inString && line[i] === "/" && line[i + 1] === "/") {
        return line.slice(0, i);
      }
    }
    return line;
  });
  const cleaned = lines.join("\n");

  const callPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(cleaned)) !== null) {
    const name = match[1];
    const argsRaw = match[2];
    const lineNumber = cleaned.slice(0, match.index).split("\n").length;

    const args: Record<string, VibeValue> = {};
    const argPairs = argsRaw.trim() ? splitTopLevel(argsRaw) : [];

    for (const pair of argPairs) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx === -1) {
        errors.push({
          line: lineNumber,
          message: `In ${name}(): expected "key: value" but got "${pair}"`,
        });
        continue;
      }
      const key = pair.slice(0, colonIdx).trim();
      const valueRaw = pair.slice(colonIdx + 1).trim();
      if (!key || !valueRaw) {
        errors.push({
          line: lineNumber,
          message: `In ${name}(): "${pair}" is missing a key or value`,
        });
        continue;
      }
      args[key] = parseValue(valueRaw);
    }

    calls.push({ name, args });
  }

  return { calls, errors };
}
