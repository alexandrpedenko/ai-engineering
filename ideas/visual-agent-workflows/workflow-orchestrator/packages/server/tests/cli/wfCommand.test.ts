import { InvalidInputError, MissingCredentialsError, NotFoundError, type GateDecision, type RunEvent, type RunOutcome } from "@orch/core";
import { describe, expect, it } from "vitest";
import { runWfCommand, type WfServices } from "../../src/cli/wfCommand";

const waiting = { status: "waiting", gateId: "review", shows: ["discovery/requirements.md"], state: { steps: {} } } as unknown as RunOutcome;
const finished = { status: "finished", state: { steps: {} } } as unknown as RunOutcome;

// Services whose outcomes a test scripts, recording every call.
function setup(options: { answers?: string[]; afterResume?: RunOutcome[]; current?: RunOutcome; fail?: Error } = {}) {
  const calls: string[] = [];
  const answers = [...(options.answers ?? [])];
  const afterResume = [...(options.afterResume ?? [finished])];
  let output = "";
  let servicesOptions: unknown;
  let emit: (runId: string, event: RunEvent) => void = () => {};

  const services: WfServices = {
    start: async (workflowId, inputs) => {
      calls.push(`start ${workflowId} ${JSON.stringify(inputs)}`);
      emit("run-1", { type: "step-started", stepId: "elicit", attempt: 1 });
      return { runId: "run-1", outcome: waiting };
    },
    resume: async (runId, decision: GateDecision) => {
      calls.push(`resume ${runId} ${decision.decision === "approve" ? "approve" : `reject:${decision.feedback}`}`);
      return afterResume.shift() ?? finished;
    },
    continue: async (runId) => {
      calls.push(`continue ${runId}`);
      return waiting;
    },
    retry: async (runId) => {
      calls.push(`retry ${runId}`);
      return waiting;
    },
    outcome: async (runId) => {
      calls.push(`outcome ${runId}`);
      return options.current ?? waiting;
    },
  };

  const deps = {
    services: async (opts: unknown, onEvent: (runId: string, event: RunEvent) => void) => {
      servicesOptions = opts;
      emit = onEvent;
      if (options.fail) throw options.fail;
      return services;
    },
    ask: async () => answers.shift() ?? "",
    write: (text: string) => {
      output += text;
    },
    env: {},
  };
  return { deps, calls, output: () => output, servicesOptions: () => servicesOptions };
}

describe("runWfCommand run", () => {
  it("starts with the inputs, approves at the gate on y, and finishes", async () => {
    const { deps, calls, output } = setup({ answers: ["y"] });

    expect(await runWfCommand(["run", "ba-discovery", "--input", "focus=a=b", "--fake"], deps)).toBe(0);

    expect(calls).toEqual(['start ba-discovery {"focus":"a=b"}', "resume run-1 approve"]);
    expect(output()).toMatch(/^run run-1\n▸ elicit \(attempt 1\)\n/);
    expect(output()).toMatch(/finished {2}run-1\n$/);
  });

  it("rejects with the typed text as feedback", async () => {
    const { deps, calls } = setup({ answers: ["add checks", "y"], afterResume: [waiting, finished] });

    await runWfCommand(["run", "ba-discovery"], deps);

    expect(calls.slice(1)).toEqual(["resume run-1 reject:add checks", "resume run-1 approve"]);
  });

  it("stops at the gate on an empty line and says how to continue", async () => {
    const { deps, calls, output } = setup({ answers: [""] });

    expect(await runWfCommand(["run", "ba-discovery"], deps)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(output()).toContain("stopped at review. Continue with: npm run wf -- continue run-1");
  });

  it("exits 1 when the run ends rejected or failed", async () => {
    const rejected = { status: "rejected", gateId: "review", state: { steps: {} } } as unknown as RunOutcome;
    const { deps } = setup({ answers: ["no"], afterResume: [rejected] });
    expect(await runWfCommand(["run", "ba-discovery"], deps)).toBe(1);
  });

  it("passes --project and --fake to the services", async () => {
    const { deps, servicesOptions } = setup({ answers: [""] });
    await runWfCommand(["run", "ba-discovery", "--project", "../host", "--fake"], deps);
    expect(servicesOptions()).toEqual({ projectRoot: "../host", fake: true });
  });
});

describe("runWfCommand continue and status", () => {
  it("re-enters an interrupted run, then asks at its gate", async () => {
    const interrupted = { status: "interrupted", stepId: "design", state: { steps: {} } } as unknown as RunOutcome;
    const { deps, calls } = setup({ current: interrupted, answers: ["y"] });

    expect(await runWfCommand(["continue", "run-1"], deps)).toBe(0);
    expect(calls).toEqual(["outcome run-1", "continue run-1", "resume run-1 approve"]);
  });

  it("asks again at the gate of a waiting run", async () => {
    const { deps, calls, output } = setup({ answers: ["y"] });

    await runWfCommand(["continue", "run-1"], deps);

    expect(calls).toEqual(["outcome run-1", "resume run-1 approve"]);
    expect(output()).toContain("◆ review: check these files:");
  });

  it("prints a run's status without needing an API key", async () => {
    const done = { status: "finished", state: { steps: { elicit: { status: "done", cursorRunIds: ["a", "b"] } } } } as unknown as RunOutcome;
    const { deps, output, servicesOptions } = setup({ current: done });

    expect(await runWfCommand(["status", "run-1"], deps)).toBe(0);
    expect(output()).toBe("finished  run-1\n  elicit      done  attempts: 2\n");
    expect(servicesOptions()).toEqual({ fake: true });
  });
});

describe("runWfCommand retry", () => {
  it("retries the failed step, then asks at the gate", async () => {
    const { deps, calls } = setup({ answers: ["y"] });

    expect(await runWfCommand(["retry", "run-1", "--fake"], deps)).toBe(0);
    expect(calls).toEqual(["retry run-1", "resume run-1 approve"]);
  });

  it("needs a run id", async () => {
    const { deps } = setup();
    expect(await runWfCommand(["retry"], deps)).toBe(2);
  });
});

describe("runWfCommand errors", () => {
  it("exits 2 with usage on bad arguments", async () => {
    for (const argv of [[], ["fly"], ["run"], ["run", "x", "--input", "novalue"], ["run", "x", "--bogus"]]) {
      const { deps, output } = setup();
      expect(await runWfCommand(argv, deps)).toBe(2);
      expect(output()).toContain("usage:");
    }
  });

  it("exits 3 when the API key is missing", async () => {
    const { deps, output } = setup({ fail: new MissingCredentialsError("CURSOR_API_KEY") });
    expect(await runWfCommand(["run", "ba-discovery"], deps)).toBe(3);
    expect(output()).toBe("CURSOR_API_KEY is not set. Put it in workflow-orchestrator/.env, or use --fake.\n");
  });

  it("exits 1 with the message for an unknown workflow or an invalid one", async () => {
    const notFound = setup({ fail: new NotFoundError('no workflow "x"') });
    expect(await runWfCommand(["run", "x"], notFound.deps)).toBe(1);
    expect(notFound.output()).toBe('no workflow "x"\n');

    const invalid = setup({ fail: new InvalidInputError("workflow can't run", [{ severity: "error", message: 'unknown agent "ghost"' }]) });
    expect(await runWfCommand(["run", "x"], invalid.deps)).toBe(1);
    expect(invalid.output()).toBe(`workflow can't run: unknown agent "ghost"\n`);
  });

  it("rethrows anything else", async () => {
    const { deps } = setup({ fail: new Error("disk on fire") });
    await expect(runWfCommand(["run", "x"], deps)).rejects.toThrow("disk on fire");
  });
});
