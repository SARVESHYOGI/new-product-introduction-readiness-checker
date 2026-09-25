"use client";

import { ErrorState } from "@/components/ui/states";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred while rendering this page. Your session and data are safe."
        onRetry={reset}
      />
    </div>
  );
}