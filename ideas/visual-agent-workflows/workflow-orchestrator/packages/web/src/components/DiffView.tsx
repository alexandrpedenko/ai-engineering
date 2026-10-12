import { Box } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { Fragment } from "react";
import type { DiffHunk, DiffLine } from "../domain/parseUnifiedDiff";

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
// (in <del>) on red, kept lines plain. No syntax highlighting.
export function DiffView({ hunks, label }: { hunks: DiffHunk[]; label: string }) {
  return (
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
                  sx={{ ...cell, bgcolor, textDecoration: "none", color: line.kind === "note" ? "text.secondary" : "inherit", fontStyle: line.kind === "note" ? "italic" : "normal" }}
                >
                  {line.text}
                </Box>
              </Box>
            );
          })}
        </Fragment>
      ))}
    </Box>
  );
}
