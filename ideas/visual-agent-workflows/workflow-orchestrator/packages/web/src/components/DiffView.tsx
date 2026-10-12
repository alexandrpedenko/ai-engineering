import { Box, Button } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { Fragment, useState } from "react";
import { type DiffHunk, type DiffLine, firstLines } from "../domain/parseUnifiedDiff";

// Lines drawn before "Show all".
const SHOWN_LINES = 2000;

const SIGNS: Record<DiffLine["kind"], string> = { added: "+", removed: "−", context: "", note: "" };

// The background of an added or removed line; none for the others.
function tint(kind: DiffLine["kind"]) {
  if (kind === "added") return (theme: Theme) => alpha(theme.palette.success.main, 0.15);
  if (kind === "removed") return (theme: Theme) => alpha(theme.palette.error.main, 0.15);
  return undefined;
}

const cell = { px: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" } as const;
const number = { ...cell, color: "text.secondary", textAlign: "right", userSelect: "none" } as const;

// A unified diff as monospace rows: each hunk's "@@" line, then its lines with
// the old and new line numbers. Added lines (in <ins>) on green, removed
// (in <del>) on red, kept lines plain. No syntax highlighting. Draws the
// first SHOWN_LINES lines until "Show all" is pressed.
export function DiffView({ hunks: all, label }: { hunks: DiffHunk[]; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const { hunks, hidden } = showAll ? { hunks: all, hidden: 0 } : firstLines(all, SHOWN_LINES);
  return (
    <>
      <Box
        aria-label={label}
        sx={{
          display: "grid",
          gridTemplateColumns: "auto auto auto 1fr",
          fontFamily: "monospace",
          fontSize: 13,
          maxHeight: 480,
          overflow: "auto",
          mt: 1,
        }}
      >
        {hunks.map((hunk, h) => (
          <Fragment key={h}>
            <Box sx={{ ...cell, gridColumn: "1 / -1", color: "text.secondary", bgcolor: "action.hover" }}>{hunk.header}</Box>
            {hunk.lines.map((line, i) => {
              const bgcolor = tint(line.kind);
              const text = line.kind === "added" ? "ins" : line.kind === "removed" ? "del" : "span";
              return (
                <Box key={i} sx={{ display: "contents" }}>
                  <Box sx={{ ...number, bgcolor }}>{line.oldLine ?? ""}</Box>
                  <Box sx={{ ...number, bgcolor }}>{line.newLine ?? ""}</Box>
                  <Box sx={{ ...cell, px: 0.5, bgcolor, userSelect: "none" }}>{SIGNS[line.kind]}</Box>
                  <Box
                    component={text}
                    sx={{
                      ...cell,
                      bgcolor,
                      textDecoration: "none",
                      color: line.kind === "note" ? "text.secondary" : "inherit",
                      fontStyle: line.kind === "note" ? "italic" : "normal",
                    }}
                  >
                    {line.text}
                  </Box>
                </Box>
              );
            })}
          </Fragment>
        ))}
      </Box>
      {hidden > 0 && (
        <Button size="small" onClick={() => setShowAll(true)}>
          Show all {hidden + SHOWN_LINES} lines
        </Button>
      )}
    </>
  );
}
