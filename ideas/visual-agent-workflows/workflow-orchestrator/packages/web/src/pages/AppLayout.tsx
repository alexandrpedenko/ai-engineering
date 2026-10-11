import { AppBar, Box, Divider, Toolbar, Typography } from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router";
import { usePhases, useProject, useRuns, useWorkflows } from "../application/queries";
import { useServerStatus } from "../application/useServerStatus";
import { AppSidebar } from "../components/AppSidebar";
import { ServerStatusChip } from "../components/ServerStatusChip";
import { groupWorkflowsByPhase } from "../domain/grouping";

// The frame around every page: app bar, sidebar of phases and workflows, the page.
export function AppLayout() {
  const status = useServerStatus();
  const project = useProject();
  const phases = usePhases();
  const workflows = useWorkflows();
  const runs = useRuns();
  const navigate = useNavigate();
  const location = useLocation();

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
          <ServerStatusChip status={status} />
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        <Box sx={{ overflow: "auto" }}>
          <AppSidebar groups={groups} runsWaiting={waiting} currentPath={location.pathname} onNavigate={(path) => navigate(path)} />
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box component="main" sx={{ flexGrow: 1, overflow: "auto", p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
