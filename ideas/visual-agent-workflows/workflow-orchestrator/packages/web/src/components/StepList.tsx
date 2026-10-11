import { Chip, List, ListItem, ListItemText, Stack } from "@mui/material";
import type { Workflow } from "@orch/core";

// A workflow's steps in order, read-only.
export function StepList({ workflow }: { workflow: Workflow }) {
  return (
    <List aria-label="steps">
      {workflow.steps.map((step, i) => (
        <ListItem key={step.id} divider>
          <ListItemText
            primary={`${i + 1}. ${step.label}`}
            secondary={
              step.type === "agent"
                ? `${step.agent} · writes ${step.writes.join(", ") || "nothing"}`
                : `review of ${step.shows.join(", ") || "nothing"} · rejections go to ${step.onReject}`
            }
          />
          <Stack direction="row" spacing={1}>
            {step.type === "agent" && step.skills.map((skill) => <Chip key={skill} size="small" label={skill} />)}
            <Chip size="small" variant="outlined" label={step.type === "agent" ? "agent" : "gate"} />
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}
