"use client";
/**
 * React class ErrorBoundary — catches render-phase errors, logs them
 * structured-JSON to the console, and shows a minimal fallback UI.
 */
import React from "react";
import { isAppError } from "@/lib/errors";

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback — receives the error */
  fallback?: (err: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { error: err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    const structured = {
      level:      "error",
      source:     "ErrorBoundary",
      ts:         new Date().toISOString(),
      msg:        err.message,
      code:       isAppError(err) ? err.code : undefined,
      stack:      err.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    };
    console.error(JSON.stringify(structured));
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.handleReset);
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-6 max-w-md">
          <p className="text-red-400 font-semibold mb-2">Something went wrong</p>
          <p className="text-sm text-red-300/70 mb-4">{error.message}</p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 text-sm hover:bg-red-500/30 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
