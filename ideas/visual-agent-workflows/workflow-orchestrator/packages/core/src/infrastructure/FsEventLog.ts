import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { EventLog, LoggedEvent } from "../application/EventLog";

const Line = z.object({ seq: z.number().int(), at: z.string(), event: z.object({ type: z.string() }).loose() });

// EventLog as one JSON line per event in <dataDir>/runs/<runId>/events.jsonl.
export class FsEventLog implements EventLog {
  constructor(private readonly dataDir: string) {}

  async append(runId: string, event: LoggedEvent): Promise<void> {
    await mkdir(this.runDir(runId), { recursive: true });
    await appendFile(this.file(runId), `${JSON.stringify(event)}\n`);
  }

  async read(runId: string, after = 0): Promise<LoggedEvent[]> {
    let text: string;
    try {
      text = await readFile(this.file(runId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => Line.parse(JSON.parse(line)) as LoggedEvent)
      .filter((event) => event.seq > after);
  }

  async lastSeq(runId: string): Promise<number> {
    return (await this.read(runId)).at(-1)?.seq ?? 0;
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error(`invalid run id "${runId}"`);
    return join(this.dataDir, "runs", runId);
  }

  private file(runId: string): string {
    return join(this.runDir(runId), "events.jsonl");
  }
}
