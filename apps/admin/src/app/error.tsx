"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="text-om-ink-mute max-w-md text-center">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-om-primary px-4 py-2 text-white hover:bg-om-primary-deep"
      >
        Try again
      </button>
    </div>
  );
}
