import { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { logUserAction } from "../lib/analytics";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Mail, Lock, CheckCircle, ArrowRight } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'LoginPage' });
  }, []);

  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const verified = new URLSearchParams(window.location.search).get("verified") === "true";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema as any),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res: any) => {
          if (res?.requires2FA && res?.tempToken) {
            sessionStorage.setItem("hubforte_2fa_temp", res.tempToken);
            setLocation("/auth/2fa");
          } else {
            toast({ title: `Welcome back${res?.user?.name ? `, ${res.user.name.split(" ")[0]}` : ""}!`, variant: "default" });
            setLocation("/ext/dashboard");
          }
        },
        onError: () => {
          form.setError("root", { message: "Email or password is incorrect. Please try again." });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12 bg-[#0f172a] text-white">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="h-9 w-9 rounded-lg bg-cyan-500 flex items-center justify-center font-bold text-white text-lg">Y</div>
            <span className="text-xl font-semibold tracking-tight">Hubforte</span>
          </div>
          <h1 className="text-3xl font-bold leading-snug mb-4">
            The intelligent platform for teams that mean business
          </h1>
          <ul className="space-y-3 mt-8">
            {[
              "All your CRM, LMS, and operations in one place",
              "Every module on or off, per client, instantly",
              "AI that works for your team, not the other way around",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-slate-300">
                <CheckCircle className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-slate-500 text-sm">© {new Date().getFullYear()} Hubforte. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 bg-white dark:bg-slate-950">
        <div className="w-full max-w-md mx-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center font-bold text-white">Y</div>
            <span className="text-lg font-semibold">Hubforte</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome back</h2>
          <p className="text-slate-500 mt-1 mb-8">Sign in to your workspace</p>

          {verified && (
            <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800 text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Email verified! You can now sign in.
            </div>
          )}

          {form.formState.errors.root && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
              {form.formState.errors.root.message}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          className="pl-9"
                          disabled={loginMutation.isPending}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-cyan-600 hover:text-cyan-700">
                        Forgot your password?
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          className="pl-9 pr-10"
                          disabled={loginMutation.isPending}
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Signing in...</span>
                ) : (
                  <span className="flex items-center gap-2">Sign in <ArrowRight className="w-4 h-4" /></span>
                )}
              </Button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs text-slate-400 bg-white dark:bg-slate-950 px-2">or</div>
              </div>

              <p className="text-center text-sm text-slate-500">
                Need an account?{" "}
                <Link href="/auth/register" className="text-cyan-600 hover:text-cyan-700 font-medium">
                  Start your free workspace →
                </Link>
              </p>
            </form>
          </Form>
        </div>
      </div>
      {/* Status page footer link — degrades gracefully if URL not configured */}
      {import.meta.env.VITE_STATUS_PAGE_URL && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <a
            href={import.meta.env.VITE_STATUS_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Check system status →
          </a>
        </div>
      )}
    </div>
  );
}
