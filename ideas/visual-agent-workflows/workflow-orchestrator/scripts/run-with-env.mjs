// Runs a command with extra environment variables, on any OS:
//   node scripts/run-with-env.mjs NAME=value ... -- command args...
// (POSIX `NAME=value command` doesn't work in cmd or PowerShell.)
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const split = args.indexOf("--");
if (split === -1 || split === args.length - 1) {
  console.error("usage: node scripts/run-with-env.mjs NAME=value ... -- command args...");
  process.exit(2);
}
const env = { ...process.env };
for (const pair of args.slice(0, split)) {
  const at = pair.indexOf("=");
  if (at <= 0) {
    console.error(`not NAME=value: ${pair}`);
    process.exit(2);
  }
  env[pair.slice(0, at)] = pair.slice(at + 1);
}
const [command, ...rest] = args.slice(split + 1);
const child = spawn(command, rest, { env, stdio: "inherit", shell: process.platform === "win32" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
