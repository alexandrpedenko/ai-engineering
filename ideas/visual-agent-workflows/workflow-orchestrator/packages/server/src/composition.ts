import { Hono } from "hono";
import { healthRoutes } from "./routes/healthRoutes";

// Builds the HTTP app: creates adapters, hands them to use cases, mounts routes.
export function createApp() {
  return new Hono().route("/api", healthRoutes());
}
