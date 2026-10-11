import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useServerStatus } from "../../src/application/useServerStatus";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderHookWithProviders } from "../support/renderWithProviders";

describe("useServerStatus", () => {
  it("starts as checking, then reports up with the runtime", async () => {
    const { result } = renderHookWithProviders(() => useServerStatus());

    expect(result.current.status).toBe("checking");
    await waitFor(() => expect(result.current).toEqual({ status: "up", runtime: "fake" }));
  });

  it("reports down when the API fails", async () => {
    const api = new FakeOrchestratorApi();
    api.serverUp = new Error("connection refused");

    const { result } = renderHookWithProviders(() => useServerStatus(), api);

    await waitFor(() => expect(result.current).toEqual({ status: "down" }));
  });
});
