import { Box, Button, Paper, Stack, Typography } from "@mui/material";

type Props = { path: string; content?: string; error?: string; loading?: boolean; onEdit?: () => void };

// One project file as monospace text, with an Edit button when `onEdit` is given.
export function FileView({ path, content, error, loading, onEdit }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} aria-label={path}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">
          {path}
        </Typography>
        {onEdit && (
          <Button size="small" onClick={onEdit} aria-label={`edit ${path}`}>
            Edit
          </Button>
        )}
      </Stack>
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
