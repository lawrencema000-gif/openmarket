import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in — OpenMarket",
  description: "Sign in to your OpenMarket account.",
};

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Sign in to OpenMarket
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Welcome back. Sign in to leave reviews, save favorites, and manage
            your library.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 sm:px-8">
          <AuthForm mode="sign-in" />
        </div>
      </div>
    </div>
  );
}
