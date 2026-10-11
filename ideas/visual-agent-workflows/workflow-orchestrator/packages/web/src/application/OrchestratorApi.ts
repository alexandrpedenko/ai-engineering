// What the web app needs from the orchestrator server. Hooks depend on this,
// never on fetch; web/src/api implements it.
export interface OrchestratorApi {
  isServerUp(): Promise<boolean>;
}
