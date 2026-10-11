import { Alert, Stack } from "@mui/material";
import type { Problem } from "@orch/core";

// A workflow's problems, errors first.
export function ProblemList({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  const sorted = [...problems].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return (
    <Stack spacing={1}>
      {sorted.map((problem, i) => (
        <Alert key={`${problem.message}-${i}`} severity={problem.severity} variant="outlined">
          {problem.stepId ? <strong>{problem.stepId}: </strong> : null}
          {problem.message}
        </Alert>
      ))}
    </Stack>
  );
}
