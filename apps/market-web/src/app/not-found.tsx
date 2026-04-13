import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="text-6xl font-bold text-gray-200">404</div>
      <h2 className="text-xl font-semibold text-gray-900">Page not found</h2>
      <p className="text-gray-500 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}
