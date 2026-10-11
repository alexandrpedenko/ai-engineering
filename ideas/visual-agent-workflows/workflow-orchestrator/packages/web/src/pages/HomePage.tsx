import { AppBar, Box, Toolbar, Typography } from "@mui/material";
import { useServerStatus } from "../application/useServerStatus";
import { ServerStatusChip } from "../components/ServerStatusChip";
import { WorkflowCanvas } from "../components/WorkflowCanvas";

export function HomePage() {
  const status = useServerStatus();

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Workflow orchestrator
          </Typography>
          <ServerStatusChip status={status} />
        </Toolbar>
      </AppBar>
      <Box sx={{ flexGrow: 1 }}>
        <WorkflowCanvas />
      </Box>
    </Box>
  );
}
