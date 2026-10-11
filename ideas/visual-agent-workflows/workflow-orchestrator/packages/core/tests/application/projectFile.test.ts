import { describe, expect, it } from "vitest";
import { FileChangedError, InvalidInputError, NotFoundError } from "../../src/application/errors";
import { readProjectFile, writeProjectFile } from "../../src/application/projectFile";
import { FakeProjectFiles, fakeVersion } from "../support/FakeProjectFiles";

function files() {
  const f = new FakeProjectFiles();
  f.editable.add("discovery/brief.md");
  f.texts.set("discovery/brief.md", "# Brief");
  return f;
}

describe("readProjectFile", () => {
  it("reads an editable file", async () => {
    expect(await readProjectFile(files(), "discovery/brief.md")).toEqual({ path: "discovery/brief.md", content: "# Brief", version: fakeVersion("# Brief") });
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
  it("writes an editable file and returns its new version", async () => {
    const f = files();
    expect(await writeProjectFile(f, "discovery/brief.md", "new")).toEqual({ version: fakeVersion("new") });
    expect(f.texts.get("discovery/brief.md")).toBe("new");
  });

  it("writes when the file is still the version it was read at", async () => {
    const f = files();
    await writeProjectFile(f, "discovery/brief.md", "new", fakeVersion("# Brief"));
    expect(f.texts.get("discovery/brief.md")).toBe("new");
  });

  it("refuses when the file changed since it was read, and leaves it alone", async () => {
    const f = files();
    f.texts.set("discovery/brief.md", "changed by an agent");

    const write = writeProjectFile(f, "discovery/brief.md", "mine", fakeVersion("# Brief"));

    await expect(write).rejects.toBeInstanceOf(FileChangedError);
    await expect(write).rejects.toMatchObject({ version: fakeVersion("changed by an agent") });
    expect(f.texts.get("discovery/brief.md")).toBe("changed by an agent");
  });

  it("refuses other paths and content over 1 MB", async () => {
    const f = files();
    await expect(writeProjectFile(f, "../etc/passwd", "x")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(writeProjectFile(f, "discovery/brief.md", "x".repeat(1024 * 1024 + 1))).rejects.toThrow("larger than 1 MB");
  });
});
