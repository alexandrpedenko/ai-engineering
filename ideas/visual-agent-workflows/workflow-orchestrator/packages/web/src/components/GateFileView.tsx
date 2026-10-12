import { Box, Button, Chip, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import type { GateFile } from "../domain/gateFileViews";
import { parseUnifiedDiff } from "../domain/parseUnifiedDiff";
import { DiffView } from "./DiffView";


const NO_DIFF: Record<NonNullable<GateFile["reason"]>, string> = {
  binary: "No diff: this is a binary file.",
  "too large": "No diff: the diff is too large to show.",
  "no git": "No diff: the project is not a git repository, so there is nothing to compare with.",
  "no base": "No diff: the project state recorded before the step is gone.",
  secret: "No diff: this file may hold credentials.",
};

function counts(file: GateFile): string {
  if (file.diff === null) return "";
  return [file.added > 0 ? `+${file.added}` : "", file.removed > 0 ? `−${file.removed}` : ""].filter(Boolean).join(" ");
}

// A gate's file: path, how it changed, lines added and removed, and either the
// diff (the default) or the whole file. A deleted file has no body; a file
// with no diff says why and shows the whole file. Edit when `onEdit` is given.
export function GateFileView({ file, onEdit }: { file: GateFile; onEdit?: () => void }) {
  const [view, setView] = useState<"diff" | "whole">("diff");
  const canDiff = file.diff !== null && file.change !== "deleted";
  const showWhole = file.change !== "deleted" && (!canDiff || view === "whole");

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} aria-label={file.path}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {file.path}
        </Typography>
        <Chip size="small" variant="outlined" label={file.change} />
        {counts(file) && <Typography variant="caption">{counts(file)}</Typography>}
        {canDiff && (
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, next: "diff" | "whole" | null) => next && setView(next)}>
            <ToggleButton value="diff">Diff</ToggleButton>
            <ToggleButton value="whole">Whole file</ToggleButton>
          </ToggleButtonGroup>
        )}
        {onEdit && file.change !== "deleted" && (
          <Button size="small" onClick={onEdit} aria-label={`edit ${file.path}`}>
            Edit
          </Button>
        )}
      </Stack>
      {file.diff === null && file.reason && file.change !== "deleted" && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {NO_DIFF[file.reason]}
        </Typography>
      )}
      {canDiff && view === "diff" && file.diff === "" && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No changes in this file.
        </Typography>
      )}
      {canDiff && view === "diff" && file.diff && <DiffView hunks={parseUnifiedDiff(file.diff)} label={`diff of ${file.path}`} />}
      {showWhole && file.loading && <Typography color="text.secondary">Loading…</Typography>}
      {showWhole && file.error && <Typography color="warning.main">{file.error}</Typography>}
      {showWhole && file.content !== undefined && (
        <Box component="pre" sx={{ m: 0, mt: 1, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 400, overflow: "auto" }}>
          {file.content}
        </Box>
      )}
    </Paper>
  );
}
