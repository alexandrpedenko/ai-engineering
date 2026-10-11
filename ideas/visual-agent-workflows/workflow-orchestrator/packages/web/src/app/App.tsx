import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { HttpOrchestratorApi } from "../api/HttpOrchestratorApi";
import { OrchestratorApiContext } from "../application/orchestratorApiContext";
import { HomePage } from "../pages/HomePage";
import { createQueryClient } from "./queryClient";
import { theme } from "./theme";

const api = new HttpOrchestratorApi();
const queryClient = createQueryClient();

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <OrchestratorApiContext value={api}>
          <HomePage />
        </OrchestratorApiContext>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
