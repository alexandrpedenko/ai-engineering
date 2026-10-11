import { createContext, useContext } from "react";
import type { OrchestratorApi } from "./OrchestratorApi";

export const OrchestratorApiContext = createContext<OrchestratorApi | null>(null);

// The OrchestratorApi provided by app/. Throws if a component is rendered
// outside the provider.
export function useOrchestratorApi(): OrchestratorApi {
  const api = useContext(OrchestratorApiContext);
  if (!api) throw new Error("useOrchestratorApi needs an OrchestratorApiContext provider");
  return api;
}
