import { AppBar, Box, Divider, Toolbar, Typography } from "@mui/material";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useCreateWorkflow } from "../application/mutations";
import { usePhases, useProject, useRuns, useWorkflows } from "../application/queries";
import { useServerStatus } from "../application/useServerStatus";
import { useDraftIds } from "../application/useWorkflowDraftStore";
import { AppSidebar } from "../components/AppSidebar";
import { NewWorkflowDialog } from "../components/NewWorkflowDialog";
import { ServerStatusChip } from "../components/ServerStatusChip";
import { type PhaseGroup, groupWorkflowsByPhase } from "../domain/grouping";
import { newWorkflow } from "../domain/workflowEdits";

// The frame around every page: app bar, sidebar of phases and workflows, the
// page; and the dialog that creates a workflow in a phase.
export function AppLayout() {
  const server = useServerStatus();
  const project = useProject();
  const phases = usePhases();
  const workflows = useWorkflows();
  const runs = useRuns();
  const navigate = useNavigate();
  const location = useLocation();
  const draftIds = useDraftIds();
  const create = useCreateWorkflow();
  const [newIn, setNewIn] = useState<PhaseGroup | null>(null);

  const groups = groupWorkflowsByPhase(phases.data ?? [], workflows.data ?? []);
  const waiting = (runs.data ?? []).filter((run) => run.status === "waiting" && !run.busy).length;
  const projectName = project.data?.root.split(/[\\/]/).filter(Boolean).at(-1);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6">Workflow orchestrator</Typography>
          {projectName && (
            <Typography variant="body2" sx={{ opacity: 0.8, flexGrow: 1 }}>
              {projectName}
            </Typography>
          )}
          <Box sx={{ flexGrow: projectName ? 0 : 1 }} />
          <ServerStatusChip status={server.status} {...(server.runtime ? { runtime: server.runtime } : {})} />
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        <Box sx={{ overflow: "auto" }}>
          <AppSidebar
            groups={groups}
            runsWaiting={waiting}
            currentPath={location.pathname}
            draftIds={draftIds}
            onNavigate={(path) => navigate(path)}
            onNewWorkflow={(group) => {
              create.reset();
              setNewIn(group);
            }}
          />
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box component="main" sx={{ flexGrow: 1, overflow: "auto", p: 3 }}>
          <Outlet />
        </Box>
      </Box>
      {newIn && (
        <NewWorkflowDialog
          phaseName={newIn.phase?.name ?? "Unsorted"}
          takenIds={(workflows.data ?? []).map((w) => w.id)}
          creating={create.isPending}
          error={create.error?.message ?? null}
          onClose={() => setNewIn(null)}
          onCreate={({ id, name }) =>
            create.mutate(newWorkflow({ id, name, phase: newIn.phase?.id ?? null }), {
              onSuccess: () => {
                setNewIn(null);
                navigate(`/workflows/${id}/edit`);
              },
            })
          }
        />
      )}
    </Box>
  );
}
