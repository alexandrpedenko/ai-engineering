import { describe, expect, it } from "vitest";
import { ConflictError, FileChangedError, InvalidConfigError, InvalidInputError, MissingCredentialsError, NotFoundError } from "../../src/application/errors";

describe("InvalidConfigError", () => {
  it("carries the config path and names every bad key in its message", () => {
    const error = new InvalidConfigError("/o/orchestrator.config.json", [
      { key: "skilDirs", message: "unknown key" },
      { key: "projectRoot", message: "/x is not a folder" },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidConfigError");
    expect(error.configPath).toBe("/o/orchestrator.config.json");
    expect(error.problems).toHaveLength(2);
    expect(error.message).toBe(
      "Invalid orchestrator config (/o/orchestrator.config.json): skilDirs: unknown key; projectRoot: /x is not a folder",
    );
  });
});

describe("InvalidInputError", () => {
  it("lists its problems in the message", () => {
    const error = new InvalidInputError("workflow can't run", [
      { severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' },
    ]);
    expect(error.name).toBe("InvalidInputError");
    expect(error.message).toBe(`workflow can't run: unknown agent "ghost"`);
    expect(error.problems).toHaveLength(1);
  });

  it("is just the message without problems", () => {
    expect(new InvalidInputError("bad").message).toBe("bad");
  });
});

describe("ConflictError", () => {
  it("is a named error", () => {
    const error = new ConflictError("run is finished");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ConflictError");
  });
});

describe("FileChangedError", () => {
  it("is a conflict that names the file and carries its current version", () => {
    const error = new FileChangedError("kb/a.md", "abc");
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ name: "FileChangedError", version: "abc", message: '"kb/a.md" changed on disk since it was opened' });
  });
});

describe("NotFoundError", () => {
  it("is a named error", () => {
    expect(new NotFoundError("no run").name).toBe("NotFoundError");
  });
});

describe("MissingCredentialsError", () => {
  it("names the variable", () => {
    const error = new MissingCredentialsError("CURSOR_API_KEY");
    expect(error.message).toBe("CURSOR_API_KEY is not set");
    expect(error.variable).toBe("CURSOR_API_KEY");
  });
});
