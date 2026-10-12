import { describe, expect, it } from "vitest";
import { isSecret } from "../../src/infrastructure/secretFiles";

describe("isSecret", () => {
  it.each([".env", "app/.ENV.local", "deploy/prod.tfvars", ".git-credentials", "k8s/.kube/config", "keys/Id_Rsa", "gcp/service-account-ci.json"])(
    "%s is a credential file",
    (path) => {
      expect(isSecret(path)).toBe(true);
    },
  );

  it.each(["discovery/brief.md", "src/env.ts", "docs/keys.md"])("%s is not", (path) => {
    expect(isSecret(path)).toBe(false);
  });
});
