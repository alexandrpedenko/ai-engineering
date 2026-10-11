import { Box, Paper, Typography } from "@mui/material";

type Props = { path: string; content?: string; error?: string; loading?: boolean };

// One project file as monospace text.
export function FileView({ path, content, error, loading }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} aria-label={path}>
      <Typography variant="caption" color="text.secondary">
        {path}
      </Typography>
      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {error && <Typography color="warning.main">{error}</Typography>}
      {content !== undefined && (
        <Box component="pre" sx={{ m: 0, mt: 1, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 400, overflow: "auto" }}>
          {content}
        </Box>
      )}
    </Paper>
  );
}
