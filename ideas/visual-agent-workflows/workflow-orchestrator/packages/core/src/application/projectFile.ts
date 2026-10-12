import { FileChangedError, InvalidInputError, NotFoundError } from "./errors";
import type { ProjectFiles } from "./ProjectFiles";

export const MAX_FILE_BYTES = 1024 * 1024;
const LIMIT = `${MAX_FILE_BYTES / (1024 * 1024)} MB`;

async function assertCanOpen(files: ProjectFiles, path: string): Promise<void> {
  if (!(await files.canOpen(path))) {
    throw new InvalidInputError(`"${path}" is not a file of this project the orchestrator can open`);
  }
}

// A project file's text and version. Refuses other paths and files over 1 MB.
export async function readProjectFile(files: ProjectFiles, path: string): Promise<{ path: string; content: string; version: string }> {
  await assertCanOpen(files, path);
  const file = await files.readText(path);
  if (!file) throw new NotFoundError(`no file "${path}"`);
  if (file.size > MAX_FILE_BYTES) throw new InvalidInputError(`"${path}" is larger than ${LIMIT}`);
  return { path, content: file.content, version: file.version };
}

// Writes a project file and returns its new version. Refuses other paths and
// content over 1 MB. With `baseVersion` (the version the caller read), refuses
// with FileChangedError when the file on disk is no longer that version;
// without it, overwrites whatever is there.
export async function writeProjectFile(files: ProjectFiles, path: string, content: string, baseVersion?: string): Promise<{ version: string }> {
  await assertCanOpen(files, path);
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) throw new InvalidInputError(`content for "${path}" is larger than ${LIMIT}`);
  if (baseVersion !== undefined) {
    const current = await files.readText(path);
    if (current && current.version !== baseVersion) throw new FileChangedError(path, current.version);
  }
  return await files.writeText(path, content);
}
