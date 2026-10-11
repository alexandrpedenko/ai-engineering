import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useServerStatus } from "../../src/application/useServerStatus";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderHookWithProviders } from "../support/renderWithProviders";

describe("useServerStatus", () => {
  it("starts as checking, then reports up", async () => {
    const { result } = renderHookWithProviders(() => useServerStatus());

    expect(result.current).toBe("checking");
    await waitFor(() => expect(result.current).toBe("up"));
  });

  it("reports down when the API fails", async () => {
    const api = new FakeOrchestratorApi();
    api.serverUp = new Error("connection refused");

    const { result } = renderHookWithProviders(() => useServerStatus(), api);

    await waitFor(() => expect(result.current).toBe("down"));
  });
});
