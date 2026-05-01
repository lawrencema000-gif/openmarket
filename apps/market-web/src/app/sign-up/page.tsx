import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign up — OpenMarket",
  description: "Create an OpenMarket account.",
};

export default function SignUpPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Create your OpenMarket account
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Free, takes 30 seconds. We never sell your data.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 sm:px-8">
          <AuthForm mode="sign-up" />
        </div>
      </div>
    </div>
  );
}
