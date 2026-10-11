import { Button, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router";

// For any address the app doesn't know.
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
      <Typography variant="h5">Page not found</Typography>
      <Button onClick={() => navigate("/project")}>Go to the project</Button>
    </Stack>
  );
}
