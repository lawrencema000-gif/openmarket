import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your OpenMarket account.",
};

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-om-ink">
            Sign in to OpenMarket
          </h1>
          <p className="mt-2 text-sm text-om-ink-mute">
            Welcome back. Sign in to leave reviews, save favorites, and manage
            your library.
          </p>
        </div>
        <div className="bg-om-surface rounded-2xl border border-om-line shadow-sm px-6 py-8 sm:px-8">
          <AuthForm mode="sign-in" />
        </div>
      </div>
    </div>
  );
}
