import { InvalidInputError, NotFoundError } from "./errors";
import type { ProjectFiles } from "./ProjectFiles";

export const MAX_FILE_BYTES = 1024 * 1024;

async function assertCanOpen(files: ProjectFiles, path: string): Promise<void> {
  if (!(await files.canOpen(path))) {
    throw new InvalidInputError(`"${path}" is not a file of this project the orchestrator can open`);
  }
}

// A project file's text. Refuses other paths and files over 1 MB.
export async function readProjectFile(files: ProjectFiles, path: string): Promise<{ path: string; content: string }> {
  await assertCanOpen(files, path);
  const file = await files.readText(path);
  if (!file) throw new NotFoundError(`no file "${path}"`);
  if (file.size > MAX_FILE_BYTES) throw new InvalidInputError(`"${path}" is larger than 1 MB`);
  return { path, content: file.content };
}

// Writes a project file. Refuses other paths and content over 1 MB.
export async function writeProjectFile(files: ProjectFiles, path: string, content: string): Promise<void> {
  await assertCanOpen(files, path);
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) throw new InvalidInputError(`content for "${path}" is larger than 1 MB`);
  await files.writeText(path, content);
}
