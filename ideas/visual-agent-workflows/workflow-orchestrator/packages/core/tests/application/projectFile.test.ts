import { describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError } from "../../src/application/errors";
import { readProjectFile, writeProjectFile } from "../../src/application/projectFile";
import { FakeProjectFiles } from "../support/FakeProjectFiles";

function files() {
  const f = new FakeProjectFiles();
  f.editable.add("discovery/brief.md");
  f.texts.set("discovery/brief.md", "# Brief");
  return f;
}

describe("readProjectFile", () => {
  it("reads an editable file", async () => {
    expect(await readProjectFile(files(), "discovery/brief.md")).toEqual({ path: "discovery/brief.md", content: "# Brief" });
  });

  it("refuses a file that isn't editable, and reports a missing one", async () => {
    const f = files();
    await expect(readProjectFile(f, "src/index.ts")).rejects.toBeInstanceOf(InvalidInputError);
    f.editable.add("discovery/none.md");
    await expect(readProjectFile(f, "discovery/none.md")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a file over 1 MB", async () => {
    const f = files();
    f.texts.set("discovery/brief.md", "x".repeat(1024 * 1024 + 1));
    await expect(readProjectFile(f, "discovery/brief.md")).rejects.toThrow("larger than 1 MB");
  });
});

describe("writeProjectFile", () => {
  it("writes an editable file", async () => {
    const f = files();
    await writeProjectFile(f, "discovery/brief.md", "new");
    expect(f.texts.get("discovery/brief.md")).toBe("new");
  });

  it("refuses other paths and content over 1 MB", async () => {
    const f = files();
    await expect(writeProjectFile(f, "../etc/passwd", "x")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(writeProjectFile(f, "discovery/brief.md", "x".repeat(1024 * 1024 + 1))).rejects.toThrow("larger than 1 MB");
  });
});
