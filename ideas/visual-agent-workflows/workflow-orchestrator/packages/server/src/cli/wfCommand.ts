import {
  ConflictError,
  InvalidConfigError,
  InvalidInputError,
  MissingCredentialsError,
  NotFoundError,
  type FileChanges,
  type GateDecision,
  type RunEvent,
  type RunOutcome,
} from "@orch/core";
import { formatGate, formatOutcome, formatRunEvent } from "./formatRunEvent";

// What the command needs from a set of run services (see composition.ts).
export type WfServices = {
  setup: string; // which project and runtime this process uses
  start(workflowId: string, inputs: Record<string, string>): Promise<{ runId: string; outcome: RunOutcome }>;
  resume(runId: string, decision: GateDecision): Promise<RunOutcome>;
  continue(runId: string): Promise<RunOutcome>;
  retry(runId: string): Promise<RunOutcome>;
  outcome(runId: string): Promise<RunOutcome>;
  gateChanges(runId: string, gateId: string): Promise<FileChanges>;
};

export type WfDeps = {
  services(options: { projectRoot?: string; fake: boolean }, onEvent: (runId: string, event: RunEvent) => void): Promise<WfServices>;
  ask(question: string): Promise<string>;
  write(text: string): void;
  env: { ORCH_PROJECT_ROOT?: string };
};

export const wfUsage = `usage:
  npm run wf -- run <workflowId> [--input key=value]... [--project <path>] [--fake]
  npm run wf -- continue <runId> [--project <path>] [--fake]
  npm run wf -- retry <runId> [--project <path>] [--fake]       runs a failed step again
  npm run wf -- status <runId> [--project <path>]

  --project <path>  host project (relative to the orchestrator folder); overrides ORCH_PROJECT_ROOT
  --fake            run on a fake agent: no API key, no cost, no file changes
`;

const GATE_QUESTION = "  approve (y), or type feedback to reject; empty line stops for now › ";

type Parsed = { command: string; target: string; inputs: Record<string, string>; project?: string; fake: boolean };

function parse(argv: string[]): Parsed | string {
  const [command, target, ...rest] = argv;
  if (!command || !["run", "continue", "retry", "status"].includes(command)) return `unknown command: ${command ?? "(none)"}`;
  if (!target || target.startsWith("--")) return `${command} needs a ${command === "run" ? "workflow id" : "run id"}`;

  const parsed: Parsed = { command, target, inputs: {}, fake: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const value = rest[i + 1];
    if (arg === "--fake") parsed.fake = true;
    else if (arg === "--project" && value && !value.startsWith("--")) {
      parsed.project = value;
      i++;
    } else if (arg === "--input" && value?.includes("=")) {
      const [key = "", ...text] = value.split("=");
      parsed.inputs[key] = text.join("=");
      i++;
    } else return `bad option: ${arg}${arg === "--input" ? " (use --input key=value)" : ""}`;
  }
  return parsed;
}

const exitCodeOf = (outcome: RunOutcome) => (outcome.status === "failed" || outcome.status === "rejected" ? 1 : 0);

// Shows each gate's changes and asks, until the run finishes, fails, or the person stops.
async function throughGates(services: WfServices, runId: string, first: RunOutcome, deps: WfDeps): Promise<RunOutcome> {
  let outcome = first;
  while (outcome.status === "waiting") {
    deps.write(formatGate(outcome.gateId, await services.gateChanges(runId, outcome.gateId)));
    const answer = (await deps.ask(GATE_QUESTION)).trim();
    if (answer === "") return outcome;
    const decision: GateDecision = answer.toLowerCase() === "y" ? { decision: "approve" } : { decision: "reject", feedback: answer };
    outcome = await services.resume(runId, decision);
  }
  return outcome;
}

// `npm run wf`: runs a workflow in the terminal, asking at each gate.
// Exit codes: 0 finished or stopped at a gate, 1 failed / rejected / not found /
// invalid, 2 bad arguments, 3 missing CURSOR_API_KEY.
export async function runWfCommand(argv: string[], deps: WfDeps): Promise<number> {
  const parsed = parse(argv);
  if (typeof parsed === "string") {
    deps.write(`${parsed}\n\n${wfUsage}`);
    return 2;
  }

  const projectRoot = parsed.project ?? deps.env.ORCH_PROJECT_ROOT;
  let announced = parsed.command !== "run";
  const onEvent = (runId: string, event: RunEvent) => {
    if (!announced) {
      deps.write(`run ${runId}\n`);
      announced = true;
    }
    deps.write(formatRunEvent(event));
  };
  try {
    // status runs no agent, so it never needs an API key.
    const fake = parsed.fake || parsed.command === "status";
    const services = await deps.services({ ...(projectRoot ? { projectRoot } : {}), fake }, onEvent);
    if (parsed.command !== "status") deps.write(`${services.setup}\n`);

    if (parsed.command === "status") {
      const outcome = await services.outcome(parsed.target);
      deps.write(formatOutcome(parsed.target, outcome));
      for (const [stepId, record] of Object.entries(outcome.state.steps)) {
        deps.write(`  ${stepId.padEnd(12)}${record.status}  attempts: ${record.cursorRunIds.length}\n`);
      }
      return 0;
    }

    let runId = parsed.target;
    let outcome: RunOutcome;
    if (parsed.command === "run") {
      ({ runId, outcome } = await services.start(parsed.target, parsed.inputs));
    } else if (parsed.command === "retry") {
      outcome = await services.retry(runId);
    } else {
      outcome = await services.outcome(runId);
      if (outcome.status === "interrupted") outcome = await services.continue(runId);
    }

    outcome = await throughGates(services, runId, outcome, deps);
    deps.write(formatOutcome(runId, outcome));
    return exitCodeOf(outcome);
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      deps.write(`${error.variable} is not set. Put it in workflow-orchestrator/.env, or use --fake.\n`);
      return 3;
    }
    if (error instanceof InvalidInputError) {
      deps.write(`${error.message}\n`);
      return 1;
    }
    if (error instanceof InvalidConfigError) {
      deps.write(`Invalid config in ${error.configPath}\n${error.problems.map((p) => `  ${p.key}: ${p.message}`).join("\n")}\n`);
      return 1;
    }
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      deps.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
