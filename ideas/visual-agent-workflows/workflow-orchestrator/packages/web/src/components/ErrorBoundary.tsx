import { Alert, Button } from "@mui/material";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Shows what went wrong, with a way out, when drawing the page inside it
// throws, instead of a blank screen. Give it a `key` that changes on
// navigation so another page starts clean.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error("the page failed to draw", error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        }
      >
        This page failed to draw: {this.state.error.message}
      </Alert>
    );
  }
}
