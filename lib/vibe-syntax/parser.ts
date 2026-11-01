// Parses "Vibe Syntax" -- the small function-call language users paste into
// the CODE box (usually written for them by an AI assistant). Example input:
//
//   trim(clip: "clip_01", start: 0, end: 5)
//   merge(clips: ["clip_01", "clip_02"])
//
// This does NOT execute anything -- it just turns text into structured
// data. The render engine (ffmpeg-engine.ts) is what actually acts on it.
// Keeping these separate means adding a new function later (addAudio,
// overlay, etc.) never requires touching the parser itself.
//
// Supported syntax:
//   - Calls:     name(key: value, key: value)  -- may span several lines
//   - Strings:   "text"  (use \" for a quote and \\ for a backslash;
//                a ")" or "," inside a string is fine)
//   - Numbers:   5, -2.5, or with a unit suffix such as 10cm (unit is dropped)
//   - Arrays:    [3, 6] or ["clip_01", "clip_02"]
//   - Comments:  // to end of line, and /* ... */ blocks

export type VibeValue = string | number | (string | number)[];

export type VibeCall = {
  name: string;
  args: Record<string, VibeValue>;
  /** 1-based line where the call starts. */
  line: number;
};

export type ParseError = {
  line: number;
  message: string;
};

export type ParseResult = {
  calls: VibeCall[];
  errors: ParseError[];
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Removes // and block comments while leaving anything inside a "string"
 * untouched. Newlines inside block comments are kept so that line numbers
 * in error messages still match what the user sees in the code box. A
 * string never runs past the end of its line.
 */
function stripComments(source: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inString) {
      out += ch;
      if (ch === "\\" && next !== undefined && next !== "\n") {
        out += next;
        i++;
      } else if (ch === '"' || ch === "\n") {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      if (i < source.length) out += "\n";
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i++;
      }
      i++; // step onto the closing "/" (the loop's own i++ then moves past it)
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Splits a string on commas, but ignores commas that are inside [ ], ( ) or
 * "quotes". Backslash escapes inside quotes are respected.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < input.length) {
        current += input[i + 1];
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      current += ch;
      continue;
    }

    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Index of the first ":" that is not inside a "string", or -1. */
function indexOfTopLevelColon(input: string): number {
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === ":") return i;
  }
  return -1;
}

function isQuoted(s: string): boolean {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"');
}

function unquote(s: string): string {
  return s.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/** A single string, number, or bare word. */
function parseScalar(raw: string): string | number {
  const trimmed = raw.trim();

  // Quoted string: "clip_01"
  if (isQuoted(trimmed)) return unquote(trimmed);

  // Number with an optional unit suffix, e.g. "10cm" -> 10
  const numMatch = trimmed.match(/^(-?\d+(\.\d+)?)([a-zA-Z%]*)$/);
  if (numMatch) return parseFloat(numMatch[1]);

  // Fallback: treat as a bare (unquoted) string
  return trimmed;
}

function parseValue(raw: string): VibeValue {
  const trimmed = raw.trim();

  // Array: [3, 6] or ["clip_01", "clip_02"] -- items can be numbers or
  // quoted strings, since merge()'s clips list and time windows both use
  // this same array syntax.
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return splitTopLevel(trimmed.slice(1, -1)).map(parseScalar);
  }

  return parseScalar(trimmed);
}

export function parseVibeSyntax(source: string): ParseResult {
  const calls: VibeCall[] = [];
  const errors: ParseError[] = [];

  const text = stripComments(source);
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;

  let i = 0;
  while (i < text.length) {
    if (!IDENT_START.test(text[i])) {
      i++;
      continue;
    }

    // Read a whole word. Only a word directly followed by "(" is a call.
    const nameStart = i;
    while (i < text.length && IDENT_CHAR.test(text[i])) i++;
    const name = text.slice(nameStart, i);

    let open = i;
    while (open < text.length && /\s/.test(text[open])) open++;
    if (text[open] !== "(") continue;

    // Find the matching ")" -- skipping over any ")" that sits inside a
    // "string" and allowing nested parentheses.
    const argsStart = open + 1;
    let depth = 1;
    let inString = false;
    let close = -1;
    let unterminatedAt = -1;

    for (let k = argsStart; k < text.length; k++) {
      const c = text[k];
      if (inString) {
        if (c === "\\") k++;
        else if (c === '"') inString = false;
        else if (c === "\n") {
          unterminatedAt = k;
          break;
        }
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          close = k;
          break;
        }
      }
    }

    const callLine = lineOf(nameStart);

    if (unterminatedAt !== -1) {
      errors.push({
        line: lineOf(unterminatedAt),
        message: `In ${name}(): a quoted string is missing its closing quote`,
      });
      i = unterminatedAt + 1;
      continue;
    }

    if (close === -1) {
      errors.push({
        line: callLine,
        message: `${name}( is missing its closing ")"`,
      });
      break;
    }

    const argsRaw = text.slice(argsStart, close);
    i = close + 1;

    const args: Record<string, VibeValue> = {};
    const argPairs = argsRaw.trim() ? splitTopLevel(argsRaw) : [];

    for (const pair of argPairs) {
      const colonIdx = indexOfTopLevelColon(pair);
      if (colonIdx === -1) {
        errors.push({
          line: callLine,
          message: `In ${name}(): expected "key: value" but got "${pair}"`,
        });
        continue;
      }
      const key = pair.slice(0, colonIdx).trim();
      const valueRaw = pair.slice(colonIdx + 1).trim();
      if (!key || !valueRaw) {
        errors.push({
          line: callLine,
          message: `In ${name}(): "${pair}" is missing a key or value`,
        });
        continue;
      }
      if (!KEY_PATTERN.test(key)) {
        errors.push({
          line: callLine,
          message: `In ${name}(): "${key}" isn't a valid argument name`,
        });
        continue;
      }
      args[key] = parseValue(valueRaw);
    }

    calls.push({ name, args, line: callLine });
  }

  return { calls, errors };
}
