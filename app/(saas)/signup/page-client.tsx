"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useState, useEffect, useRef } from "react";

import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Shield, Globe, BarChart3, Eye, EyeOff } from "lucide-react";
import { PasswordStrengthIndicator, validatePasswordStrength } from "@/components/auth/password-strength-indicator";
import { trackFunnel, trackFailure } from "@/lib/tracking/analytics-events";

export default function SignupClient() {
  const router = useRouter();
  const sessionData = useSession();
  const status = sessionData?.status ?? "loading";

  useEffect(() => {
    if (status === "authenticated") {
      // If already authenticated, go to the welcome/setup wizard
      router.push("/welcome");
    }
  }, [status, router]);

  const [step, setStep] = useState<"info" | "email-sent">("info");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const formSchema = z.object({
    email: z.string().trim().toLowerCase().email("Please enter a valid email."),
    fullName: z.string().trim().min(2, "Name must be at least 2 characters."),
    orgName: z.string().trim().min(2, "Organization name must be at least 2 characters."),
    password: z.string().min(8, "Password must be at least 8 characters."),
  });

  const passwordValid = password.length > 0 ? validatePasswordStrength(password).isValid : false;
  const validation = formSchema.safeParse({ email, fullName, orgName, password });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current) return;
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Store org name + full name in session storage for the setup wizard.
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "fundroom_signup_context",
          JSON.stringify({
            orgName: validation.data.orgName,
            fullName: validation.data.fullName,
            email: validation.data.email,
          }),
        );
      }

      // Register user with password, then send verification email
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validation.data.email,
          password: validation.data.password,
          name: validation.data.fullName,
        }),
      });

      if (!registerRes.ok) {
        const data = await registerRes.json().catch(() => ({}));
        toast.error(data.error || "Registration failed. Please try again.");
        trackFailure({ name: "auth_failure", properties: { type: "register" } });
        isSubmittingRef.current = false;
        return;
      }

      // Send verification email via magic link
      const res = await signIn("email", {
        email: validation.data.email,
        redirect: false,
        callbackUrl: "/admin/setup",
      });

      if (res?.ok && !res?.error) {
        setStep("email-sent");
        toast.success("Check your email for a verification link!");
        trackFunnel({ name: "funnel_signup_started", properties: { source: "signup_page", utm_source: undefined } });
      } else {
        // Registration succeeded, but email failed — user can still log in with password
        setStep("email-sent");
        toast.success("Account created! Check your email for a verification link.");
        trackFunnel({ name: "funnel_signup_started", properties: { source: "signup_page", utm_source: undefined } });
      }
    } catch {
      toast.error("An error occurred. Please try again.");
      trackFailure({ name: "auth_failure", properties: { type: "register" } });
      isSubmittingRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-wrap bg-gray-950">
      {/* Left — Form */}
      <div className="flex w-full items-center justify-center px-4 md:w-1/2 lg:w-1/2">
        <div className="z-10 mx-auto h-fit w-full max-w-md overflow-hidden rounded-lg">
          {/* Logo */}
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/_static/fundroom-logo-white.png"
              alt="FundRoom AI"
              className="h-10 w-auto"
            />
          </div>

          {step === "info" ? (
            <>
              <h1 className="mb-2 text-3xl font-bold text-white">
                Get started
              </h1>
              <p className="mb-8 text-gray-400">
                Create your organization and set up your investor portal in
                minutes.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-300">
                    Your full name
                  </Label>
                  <Input
                    id="fullName"
                    placeholder="Jane Smith"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 text-base sm:text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgName" className="text-gray-300">
                    Organization name
                  </Label>
                  <Input
                    id="orgName"
                    placeholder="Acme Capital"
                    autoComplete="organization"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 text-base sm:text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300">
                    Work email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="jane@acmecapital.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 text-base sm:text-sm",
                      email.length > 0 &&
                        !z.string().email().safeParse(email).success &&
                        "border-red-500",
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={cn(
                        "border-gray-700 bg-gray-900 pr-10 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 text-base sm:text-sm",
                        password.length > 0 && !passwordValid && "border-red-500",
                        password.length > 0 && passwordValid && "border-green-500",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <PasswordStrengthIndicator password={password} />
                </div>

                <Button
                  type="submit"
                  disabled={!validation.success || !passwordValid || isSubmitting}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                >
                  {isSubmitting ? (
                    "Creating account..."
                  ) : (
                    <>
                      Create Organization
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  Already have an account?{" "}
                  <Link
                    href="/admin/login"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Sign in
                  </Link>
                </p>
              </div>

              <p className="mt-8 text-xs text-gray-500">
                By creating an account, you agree to FundRoom AI&apos;s{" "}
                <Link href="/terms" className="underline hover:text-gray-400">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-gray-400">
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          ) : (
            /* Email sent confirmation */
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/20">
                <svg
                  className="h-8 w-8 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-white">
                Check your email
              </h2>
              <p className="mb-2 text-gray-400">
                We sent a verification link to
              </p>
              <p className="mb-6 font-medium text-white">{email}</p>
              <p className="text-sm text-gray-500">
                Click the link in your email to verify your account and start
                setting up your organization.
              </p>
              <Button
                variant="outline"
                className="mt-6 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => {
                  setStep("info");
                  isSubmittingRef.current = false;
                }}
              >
                Use a different email
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right — Value props */}
      <div className="relative hidden w-full overflow-hidden bg-gradient-to-br from-gray-900 via-blue-950/30 to-gray-900 md:flex md:w-1/2 lg:w-1/2">
        <div className="flex h-full w-full flex-col items-center justify-center px-12">
          <div className="max-w-lg">
            <h2 className="mb-4 text-3xl font-bold text-white">
              Fundraising infrastructure
              <br />
              <span className="text-blue-400">built for modern funds</span>
            </h2>
            <p className="mb-10 text-lg text-gray-400">
              Secure datarooms, investor portals, e-signatures, and compliance
              — all in one platform.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">
                    Enterprise security
                  </h3>
                  <p className="text-sm text-gray-400">
                    AES-256 encryption, audit trails, SOC 2 ready infrastructure
                    for your sensitive fund documents.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <Globe className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">
                    Your brand, your domain
                  </h3>
                  <p className="text-sm text-gray-400">
                    Custom domains, branded portals, and white-label investor
                    experience.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">
                    Investor analytics
                  </h3>
                  <p className="text-sm text-gray-400">
                    Real-time engagement tracking, pipeline management, and
                    smart follow-up suggestions.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 border-t border-gray-800 pt-6">
              <p className="text-sm text-gray-500">
                Trusted by funds and startups raising capital
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
