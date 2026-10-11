import { runScanCommand } from "../cli/scanCommand";
import { createProjectServices } from "../composition";

process.exitCode = await runScanCommand(process.argv.slice(2), {
  scan: async (options) => await (await createProjectServices(options)).scan(),
  write: (text) => process.stdout.write(text),
  env: process.env,
});
