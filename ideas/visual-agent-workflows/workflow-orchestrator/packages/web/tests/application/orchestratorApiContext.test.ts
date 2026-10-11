import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOrchestratorApi } from "../../src/application/orchestratorApiContext";

describe("useOrchestratorApi", () => {
  it("throws outside a provider", () => {
    expect(() => renderHook(() => useOrchestratorApi())).toThrow(/provider/);
  });
});
