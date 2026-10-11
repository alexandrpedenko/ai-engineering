import { InvalidInputError, readProjectFile, writeProjectFile } from "@orch/core";
import { Hono } from "hono";
import { z } from "zod";
import { readJson } from "./readJson";
import type { ServerServices } from "./ServerServices";

const FileBody = z.object({ content: z.string() });

function pathParam(path: string | undefined): string {
  if (!path) throw new InvalidInputError("the path query parameter is required");
  return path;
}

// The project's registry, and reading / writing its skill, agent and artefact files.
export function projectRoutes(services: ServerServices) {
  return new Hono()
    .get("/project", async (c) => c.json(await services.scan()))
    .get("/files", async (c) => c.json(await readProjectFile(services.projectFiles, pathParam(c.req.query("path")))))
    .put("/files", async (c) => {
      const body = FileBody.safeParse(await readJson(c));
      if (!body.success) throw new InvalidInputError("the body must be { content: string }");
      await writeProjectFile(services.projectFiles, pathParam(c.req.query("path")), body.data.content);
      return c.body(null, 204);
    });
}
