import { Button } from "@mft/ui";
import type { ReactNode } from "react";
import type { AsyncState } from "../lib/useAsync";
import { EmptyState } from "./EmptyState";
import { AlertIcon } from "./icons";

interface LoadableProps<T> {
  state: AsyncState<T>;
  reload: () => void;
  /** What is loading, for the messages: "the chart". */
  what: string;
  /** Skeleton shape while nothing has loaded yet. */
  skeleton?: "rows" | "chart" | "bars";
  children: (data: T) => ReactNode;
}

/** Placeholder blocks shaped like the content, so the layout doesn't jump when data arrives. */
export function Skeleton({ kind = "rows", label }: { kind?: "rows" | "chart" | "bars"; label: string }) {
  const count = kind === "chart" ? 6 : kind === "bars" ? 4 : 5;
  return (
    <div className={`skeleton skeleton--${kind}`} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="skeleton__block" style={kind === "chart" ? { height: `${40 + ((i * 37) % 50)}%` } : undefined} />
      ))}
    </div>
  );
}

/** The loading and error states every data card needs; children render the data. */
export function Loadable<T>({ state, reload, what, skeleton = "rows", children }: LoadableProps<T>) {
  if (state.status === "error") {
    return (
      <EmptyState
        tone="error"
        icon={<AlertIcon />}
        heading={`Couldn't load ${what}`}
        action={
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        }
      >
        {state.error.message}
      </EmptyState>
    );
  }
  if (state.data === undefined) return <Skeleton kind={skeleton} label={`Loading ${what}`} />;
  return <>{children(state.data)}</>;
}
