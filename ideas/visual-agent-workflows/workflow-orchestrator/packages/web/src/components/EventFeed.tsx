import { Box, Typography } from "@mui/material";
import type { FeedLine } from "../domain/eventLines";

const MAX_LINES = 200;

// What the agent is doing, newest at the bottom (the last 200 lines).
export function EventFeed({ lines }: { lines: FeedLine[] }) {
  if (lines.length === 0) return null;
  return (
    <Box aria-label="live feed" sx={{ fontFamily: "monospace", fontSize: 13, maxHeight: 220, overflow: "auto", pl: 2, borderLeft: 2, borderColor: "divider" }}>
      {lines.slice(-MAX_LINES).map((line) => (
        <Typography key={line.seq} component="div" variant="body2" color={line.tone === "error" ? "error" : line.tone === "tool" ? "text.secondary" : "text.primary"} sx={{ fontFamily: "inherit" }}>
          {line.tone === "error" ? "! " : "· "}
          {line.text}
        </Typography>
      ))}
    </Box>
  );
}
