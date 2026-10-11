import { Badge, Box, List, ListItemButton, ListItemText, ListSubheader } from "@mui/material";
import type { ReactNode } from "react";
import type { PhaseGroup } from "../domain/grouping";
import { problemCounts } from "../domain/problems";

type Props = {
  groups: PhaseGroup[];
  runsWaiting: number;
  currentPath: string;
  draftIds: string[]; // workflows with unsaved edits
  onNavigate: (path: string) => void;
  onNewWorkflow: (group: PhaseGroup) => void;
};

function Dot({ color }: { color: "error" | "warning" }) {
  return <Box component="span" aria-label={color === "error" ? "has errors" : "has warnings"} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: `${color}.main`, ml: 1 }} />;
}

// The navigation: the project, each phase with its workflows (and a way to add
// one), the runs.
export function AppSidebar({ groups, runsWaiting, currentPath, draftIds, onNavigate, onNewWorkflow }: Props) {
  const item = (path: string, label: string, extra?: ReactNode) => (
    <ListItemButton key={path} selected={currentPath === path} onClick={() => onNavigate(path)} sx={{ pl: 3 }}>
      <ListItemText primary={label} />
      {extra}
    </ListItemButton>
  );

  return (
    <List dense component="nav" aria-label="main" sx={{ width: 260 }}>
      <ListSubheader>Project</ListSubheader>
      {item("/project", "Overview")}
      {groups.map((group) => (
        <Box key={group.phase?.id ?? "unsorted"} role="group" aria-label={group.phase?.name ?? "Unsorted"}>
          <ListSubheader>{group.phase?.name ?? "Unsorted"}</ListSubheader>
          {group.workflows.length === 0 && <ListItemText secondary="No workflows yet" sx={{ pl: 3 }} />}
          {group.workflows.map((workflow) => {
            const { errors, warnings } = problemCounts(workflow.problems);
            const dot = errors > 0 ? <Dot color="error" /> : warnings > 0 ? <Dot color="warning" /> : null;
            const unsaved = draftIds.includes(workflow.id) ? (
              <Box component="span" aria-label="unsaved changes" sx={{ ml: 1, color: "text.secondary" }}>
                ●
              </Box>
            ) : null;
            return item(
              `/workflows/${workflow.id}`,
              workflow.name,
              <>
                {unsaved}
                {dot}
              </>,
            );
          })}
          <ListItemButton onClick={() => onNewWorkflow(group)} sx={{ pl: 3 }}>
            <ListItemText secondary="+ New workflow" />
          </ListItemButton>
        </Box>
      ))}
      <ListSubheader>Runs</ListSubheader>
      {item("/runs", "All runs", runsWaiting > 0 ? <Badge color="info" badgeContent={runsWaiting} aria-label={`${runsWaiting} waiting`} sx={{ mr: 1 }} /> : null)}
    </List>
  );
}
