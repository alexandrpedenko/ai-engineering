import { Alert, Stack, Typography } from "@mui/material";
import { useProject } from "../application/queries";
import { RegistryTabs } from "../components/RegistryTabs";

// What the orchestrator found in the project.
export function ProjectPage() {
  const project = useProject();
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Project</Typography>
      {project.data && <Typography color="text.secondary">{project.data.root}</Typography>}
      {project.isPending && <Typography>Loading…</Typography>}
      {project.error && <Alert severity="error">{project.error.message}</Alert>}
      {project.data && <RegistryTabs registry={project.data} />}
    </Stack>
  );
}
