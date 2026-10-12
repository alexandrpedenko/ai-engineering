// Run ids name folders and files, so they are letters, digits, "_" and "-" only.
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Throws when `runId` could not safely name a folder.
export function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`invalid run id "${runId}"`);
}
