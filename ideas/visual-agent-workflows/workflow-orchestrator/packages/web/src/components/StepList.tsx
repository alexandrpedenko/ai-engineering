import { Chip, List, ListItem, ListItemText, Stack } from "@mui/material";
import type { Workflow } from "@orch/core";
import { stepsInRunOrder } from "../domain/workflowGraph";

// A workflow's steps in the order a run takes them, read-only.
export function StepList({ workflow }: { workflow: Workflow }) {
  return (
    <List aria-label="steps">
      {stepsInRunOrder(workflow).map((step, i) => (
        <ListItem key={step.id} divider>
          <ListItemText
            primary={`${i + 1}. ${step.label}`}
            secondary={
              step.type === "agent"
                ? `${step.agent} · writes ${step.writes.join(", ") || "where its skills say"}`
                : `review of ${step.shows.join(", ") || "the files changed before it"} · rejections go to ${step.onReject}`
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
