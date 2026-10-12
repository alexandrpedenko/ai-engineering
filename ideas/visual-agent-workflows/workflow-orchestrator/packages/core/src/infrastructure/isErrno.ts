// Whether `error` is a Node system error with one of these codes (ENOENT, …).
export function isErrno(error: unknown, ...codes: string[]): boolean {
  return typeof error === "object" && error !== null && "code" in error && codes.includes(String(error.code));
}
