import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="text-6xl font-bold text-om-line">404</div>
      <h2 className="text-xl font-semibold text-om-ink">Page not found</h2>
      <p className="text-om-ink-soft text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-lg bg-om-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-om-primary-deep transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}
