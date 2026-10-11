import type { OrchestratorApi } from "../../src/application/OrchestratorApi";

// An OrchestratorApi whose answers a test sets directly. A method set to an
// Error rejects with it.
export class FakeOrchestratorApi implements OrchestratorApi {
  serverUp: boolean | Error = true;

  async isServerUp(): Promise<boolean> {
    if (this.serverUp instanceof Error) throw this.serverUp;
    return this.serverUp;
  }
}
