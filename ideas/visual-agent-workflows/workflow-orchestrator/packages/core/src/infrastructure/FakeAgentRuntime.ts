import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentRunRequest, AgentRunResult, AgentRuntime, RunHandle } from "../application/AgentRuntime";
import { PROMPT_SECTIONS, promptSection } from "../domain/buildPrompt";
import type { StepEvent, Usage } from "../domain/runState";

export type FakeReply = {
  events?: StepEvent[];
  status?: "finished" | "error";
  summary?: string;
  usage?: Usage;
  writes?: Record<string, string>; // files written under cwd when the run starts
  dies?: boolean; // wait() throws the first time, like a process that stopped mid-run
  holds?: boolean; // wait() doesn't answer until the run is cancelled
  placeholders?: boolean; // writes a short placeholder to each file the message says to write
  delayMs?: number; // wait() takes this long (cancel ends it early), so a run can be watched
  startFails?: string; // start() throws an error with this message, like a refused API key
};

// The non-blank lines between the message's "Skills to follow" and "Task"
// headings. (promptSection would stop at a skill body's own "# " heading.)
function skillLines(message: string): string[] {
  const lines = message.split("\n");
  const start = lines.indexOf(PROMPT_SECTIONS.skills);
  const end = lines.indexOf(PROMPT_SECTIONS.task);
  if (start === -1 || end <= start) return [];
  return lines.slice(start + 1, end).filter((line) => line.trim() !== "");
}

// A placeholder for each plain path (not a glob) in the message's "You must
// write" section, mentioning the attempt, the skills it was told to follow
// and any reviewer feedback.
function placeholderWrites(request: AgentRunRequest): Record<string, string> {
  const paths = promptSection(request.message, PROMPT_SECTIONS.write)
    .map((line) => line.replace(/^- /, "").trim())
    .filter((path) => path && !/[*?[\]{}]/.test(path));
  const skills = skillLines(request.message);
  const feedback = promptSection(request.message, PROMPT_SECTIONS.feedback);
  const writes: Record<string, string> = {};
  for (const path of paths) {
    const lines = [`# ${path}`, "", `Placeholder written by the fake agent (${request.key}). A real agent would write this file.`];
    if (skills.length > 0) lines.push("", "## Skills it was told to follow", ...skills.map((line) => `> ${line}`));
    if (feedback.length > 0) lines.push("", "## Reviewer feedback it was given", ...feedback);
    writes[path] = `${lines.join("\n")}\n`;
  }
  return writes;
}

// An AgentRuntime that runs nothing: each start replays the next scripted
// reply (the last one repeats), or asks a function for one. Every request is
// kept in `requests`. attach() finds runs this instance started.
export class FakeAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];
  private readonly started = new Map<string, { result: AgentRunResult; cutOff: boolean }>();

  constructor(private readonly replies: FakeReply[] | ((request: AgentRunRequest, index: number) => FakeReply) = [{}]) {}

  async start(request: AgentRunRequest): Promise<RunHandle> {
    const index = this.requests.length;
    this.requests.push(request);
    const reply =
      typeof this.replies === "function"
        ? this.replies(request, index)
        : (this.replies[Math.min(index, this.replies.length - 1)] ?? {});

    const writes = { ...(reply.placeholders ? placeholderWrites(request) : {}), ...reply.writes };
    if (reply.startFails) throw new Error(reply.startFails);
    for (const [path, content] of Object.entries(writes)) {
      await mkdir(dirname(join(request.cwd, path)), { recursive: true });
      await writeFile(join(request.cwd, path), content);
    }

    const id = `fake-run-${index + 1}`;
    const result: AgentRunResult = {
      status: reply.status ?? "finished",
      summary: reply.summary ?? `done ${request.key}`,
      durationMs: 0,
      ...(reply.usage ? { usage: reply.usage } : {}),
    };
    this.started.set(id, { result, cutOff: false });
    let dies = reply.dies ?? false;
    let release: () => void = () => {};
    let cancelled = false;
    const held = reply.holds || reply.delayMs ? new Promise<void>((resolve) => (release = resolve)) : null;
    const timer = reply.delayMs && !reply.holds ? setTimeout(() => release(), reply.delayMs) : null;
    const cancelledResult: AgentRunResult = { status: "cancelled", summary: "", durationMs: 0 };

    return {
      id,
      events: async function* () {
        for (const event of reply.events ?? []) yield event;
      },
      wait: async () => {
        if (dies) {
          dies = false;
          throw new Error(`fake process stopped during ${id}`);
        }
        if (held) await held;
        return cancelled ? cancelledResult : result;
      },
      cancel: async () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        release();
      },
    };
  }

  async attach(runId: string): Promise<RunHandle | null> {
    const run = this.started.get(runId);
    if (!run) return null;
    const result: AgentRunResult = run.cutOff
      ? { status: "error", summary: "the agent run was interrupted (its process stopped)", durationMs: 0 }
      : run.result;
    return { id: runId, events: async function* () {}, wait: async () => result, cancel: async () => {} };
  }

  // Makes a started run look cut off with its process: attach() then reports an error.
  cutOff(runId: string): void {
    const run = this.started.get(runId);
    if (run) run.cutOff = true;
  }
}
