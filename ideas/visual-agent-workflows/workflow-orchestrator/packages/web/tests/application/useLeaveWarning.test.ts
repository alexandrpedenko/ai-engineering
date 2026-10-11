import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLeaveWarning } from "../../src/application/useLeaveWarning";

const leave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("useLeaveWarning", () => {
  it("asks before leaving only while active, and stops when unmounted", () => {
    const { rerender, unmount } = renderHook(({ active }) => useLeaveWarning(active), { initialProps: { active: false } });
    expect(leave()).toBe(false);

    rerender({ active: true });
    expect(leave()).toBe(true);

    unmount();
    expect(leave()).toBe(false);
  });
});
