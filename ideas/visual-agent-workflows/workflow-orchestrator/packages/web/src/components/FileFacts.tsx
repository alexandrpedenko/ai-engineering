import { Alert, Link, Stack, Typography } from "@mui/material";
import type { FileKind } from "../domain/fileKind";

type Props = {
  kind: FileKind;
  usedBy: { id: string; name: string }[];
  warnings: string[]; // the registry's warnings for this file
  onOpenWorkflow: (id: string) => void;
};

const describe = (kind: FileKind) => (kind.kind === "skill" || kind.kind === "agent" ? `${kind.kind} "${kind.name}"` : kind.kind === "artefact" ? "artefact" : "project file");

// What the file is to the orchestrator, which workflows use it, and what's
// wrong with it.
export function FileFacts({ kind, usedBy, warnings, onOpenWorkflow }: Props) {
  return (
    <Stack spacing={1} aria-label="about this file">
      <Typography color="text.secondary">
        {describe(kind)}
        {(kind.kind === "skill" || kind.kind === "agent") && (
          <>
            {" · used by: "}
            {usedBy.length === 0
              ? "no workflow"
              : usedBy.map((w, i) => (
                  <span key={w.id}>
                    {i > 0 && ", "}
                    <Link component="button" onClick={() => onOpenWorkflow(w.id)}>
                      {w.name}
                    </Link>
                  </span>
                ))}
          </>
        )}
      </Typography>
      {warnings.map((warning) => (
        <Alert key={warning} severity="warning" variant="outlined">
          {warning}
        </Alert>
      ))}
    </Stack>
  );
}
