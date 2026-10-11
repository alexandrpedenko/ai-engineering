import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { HttpOrchestratorApi } from "../api/HttpOrchestratorApi";
import { OrchestratorApiContext } from "../application/orchestratorApiContext";
import { createQueryClient } from "./queryClient";
import { AppRoutes } from "./routes";
import { theme } from "./theme";

const api = new HttpOrchestratorApi();
const queryClient = createQueryClient();

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <OrchestratorApiContext value={api}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </OrchestratorApiContext>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
