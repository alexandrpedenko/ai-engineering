import { Alert, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import { useProject } from "../application/queries";
import { RegistryTabs } from "../components/RegistryTabs";

// What the orchestrator found in the project; each file opens in the editor.
export function ProjectPage() {
  const project = useProject();
  const navigate = useNavigate();
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Project</Typography>
      {project.data && <Typography color="text.secondary">{project.data.root}</Typography>}
      {project.isPending && <Typography>Loading…</Typography>}
      {project.error && <Alert severity="error">{project.error.message}</Alert>}
      {project.data && <RegistryTabs registry={project.data} onOpen={(path) => navigate(`/files?path=${encodeURIComponent(path)}`)} />}
    </Stack>
  );
}
