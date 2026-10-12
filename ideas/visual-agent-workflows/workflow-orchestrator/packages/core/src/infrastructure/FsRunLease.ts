import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ConflictError } from "../application/errors";
import type { LeaseHolder, RunLease } from "../application/RunLease";
import { isErrno } from "./isErrno";

const LeaseFile = z.object({ pid: z.number().int(), runId: z.string(), since: z.string() });

// Whether a process with this id is running (EPERM: running, as another user).
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, "EPERM");
  }
}

// RunLease as the file <dataDir>/project.lock ({ pid, runId, since }),
// created exclusively. A file that can't be parsed counts as no holder.
export class FsRunLease implements RunLease {
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly pid = process.pid,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = join(dataDir, "project.lock");
  }

  async acquire(runId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, JSON.stringify({ pid: this.pid, runId, since: this.now().toISOString() }), { flag: "wx" });
        return;
      } catch (error) {
        if (!isErrno(error, "EEXIST")) throw error;
      }
      const holder = await this.holder();
      if (holder?.mine && holder.runId === runId) return;
      if (holder?.alive) {
        throw new ConflictError(
          holder.mine ? `run "${holder.runId}" is moving; one run moves at a time in a project` : `run "${holder.runId}" is moving in another process (pid ${holder.pid})`,
        );
      }
      await rm(this.file, { force: true });
    }
    throw new ConflictError("couldn't take the project lease; try again");
  }

  async release(runId: string): Promise<void> {
    const holder = await this.holder();
    if (holder?.mine && holder.runId === runId) await rm(this.file, { force: true });
  }

  async holder(): Promise<LeaseHolder | null> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    }
    let parsed: z.infer<typeof LeaseFile>;
    try {
      parsed = LeaseFile.parse(JSON.parse(text));
    } catch {
      return null; // a torn or foreign file: nobody holds the lease
    }
    const mine = parsed.pid === this.pid;
    return { ...parsed, mine, alive: mine || isAlive(parsed.pid) };
  }
}
