import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type EventLog, LoggedEvent } from "../application/EventLog";
import { assertRunId } from "../domain/runId";
import { isErrno } from "./isErrno";

// A line parsed as an event, or null when it isn't one.
function parseLine(line: string): LoggedEvent | null {
  try {
    const parsed = LoggedEvent.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // not JSON
  }
}

// EventLog as one JSON line per event in <dataDir>/runs/<runId>/events.jsonl.
// A last line that doesn't parse (a write cut off by a crash) is skipped;
// a bad line before the last is an error naming the file and line.
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
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    const events: LoggedEvent[] = [];
    for (const [i, line] of lines.entries()) {
      const event = parseLine(line);
      if (event) events.push(event);
      else if (i < lines.length - 1) throw new Error(`${this.file(runId)}: line ${i + 1} is not an event`);
    }
    return events.filter((event) => event.seq > after);
  }

  async lastSeq(runId: string): Promise<number> {
    return (await this.read(runId)).at(-1)?.seq ?? 0;
  }

  private runDir(runId: string): string {
    assertRunId(runId);
    return join(this.dataDir, "runs", runId);
  }

  private file(runId: string): string {
    return join(this.runDir(runId), "events.jsonl");
  }
}
