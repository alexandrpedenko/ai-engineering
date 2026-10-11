import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { runWfCommand } from "../cli/wfCommand";
import { createRunServices } from "../composition";

// Answers from standard input, one line per question. Lines that arrive
// before a question is asked (piped input) are kept; end of input answers "".
const readline = createInterface({ input: stdin });
const lines: string[] = [];
const waiting: ((line: string) => void)[] = [];
let closed = false;
readline.on("line", (line) => {
  const answer = waiting.shift();
  if (answer) answer(line);
  else lines.push(line);
});
readline.on("close", () => {
  closed = true;
  for (const answer of waiting.splice(0)) answer("");
});

async function ask(question: string): Promise<string> {
  stdout.write(question);
  const line = lines.shift();
  if (line !== undefined) {
    if (!stdin.isTTY) stdout.write(`${line}\n`);
    return line;
  }
  if (closed) return "";
  return await new Promise<string>((resolve) => waiting.push(resolve));
}

try {
  process.exitCode = await runWfCommand(process.argv.slice(2), {
    services: async (options, onEvent) => await createRunServices({ ...options, onEvent }),
    ask,
    write: (text) => stdout.write(text),
    env: process.env,
  });
} finally {
  readline.close();
}
