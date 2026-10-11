import { z } from "zod";
import type { OrchestratorApi } from "../application/OrchestratorApi";

const Health = z.object({ ok: z.boolean() });

// OrchestratorApi over HTTP. `baseUrl` is "" in the browser (Vite proxies /api).
export class HttpOrchestratorApi implements OrchestratorApi {
  constructor(private readonly baseUrl = "") {}

  async isServerUp(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/health`);
    if (!response.ok) return false;
    return Health.parse(await response.json()).ok;
  }
}
