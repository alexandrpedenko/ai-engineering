import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "../pages/AppLayout";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProjectPage } from "../pages/ProjectPage";
import { RunPage } from "../pages/RunPage";
import { RunsPage } from "../pages/RunsPage";
import { WorkflowPage } from "../pages/WorkflowPage";

// Every page and its address.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/project" replace />} />
        <Route path="project" element={<ProjectPage />} />
        <Route path="workflows/:id" element={<WorkflowPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
