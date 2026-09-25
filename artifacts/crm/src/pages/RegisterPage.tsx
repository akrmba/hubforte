import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CheckCircle, Eye, EyeOff, ArrowRight } from "lucide-react";

const schema = z.object({
  workspaceName: z.string().min(2, "Workspace name must be at least 2 characters").max(100),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  email: z.string().email("Valid email required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Must contain a letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
  agreedToTerms: z.boolean().refine((v) => v, "You must agree to the terms"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof schema>;

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: "", color: "bg-slate-200", width: "0%" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "25%" };
  if (score === 2) return { label: "Fair", color: "bg-amber-500", width: "50%" };
  if (score === 3) return { label: "Strong", color: "bg-cyan-500", width: "75%" };
  return { label: "Very Strong", color: "bg-green-500", width: "100%" };
}

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      workspaceName: "", firstName: "", lastName: "",
      email: "", password: "", confirmPassword: "", agreedToTerms: false,
    },
  });

  const pw = form.watch("password");
  const strength = passwordStrength(pw);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/self-register", {
        workspaceName: data.workspaceName,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        agreedToTerms: data.agreedToTerms,
      });
      setSubmittedEmail(data.email);
      setSubmitted(true);
    } catch (err: any) {
      form.setError("root", { message: err.message || "Registration failed. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Check your email</h2>
          <p className="text-slate-500">We sent a verification link to <strong>{submittedEmail}</strong></p>
          <p className="text-sm text-slate-400">Click the link in the email to activate your workspace.</p>
          <button
            className="text-sm text-cyan-600 hover:text-cyan-700 underline"
            onClick={async () => {
              try {
                await api.post("/auth/resend-verification", { email: submittedEmail });
                toast({ title: "Verification email resent" });
              } catch {
                toast({ title: "Could not resend. Please try again.", variant: "destructive" });
              }
            }}
          >
            Didn't get it? Resend
          </button>
          <div className="pt-2">
            <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">← Back to login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center font-bold text-white">Y</div>
          <span className="text-lg font-semibold">Hubforte</span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Create your workspace</h2>
        <p className="text-slate-500 mt-1 mb-8">Start free — no credit card needed</p>

        {form.formState.errors.root && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
            {form.formState.errors.root.message}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="workspaceName" render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace Name</FormLabel>
                <FormControl><Input placeholder="Acme Ltd" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl><Input placeholder="Jane" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl><Input placeholder="Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Work Email</FormLabel>
                <FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="Min 8 chars, 1 letter, 1 number" className="pr-10" {...field} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                {pw && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <p className="text-xs text-slate-500">{strength.label}</p>
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="agreedToTerms" render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-2">
                  <input type="checkbox" id="terms" checked={field.value} onChange={field.onChange} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600" />
                  <label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer">
                    I agree to the <span className="text-cyan-600 underline">Terms of Service</span> and <span className="text-cyan-600 underline">Privacy Policy</span>
                  </label>
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="submit" className="w-full h-11 bg-cyan-600 hover:bg-cyan-700 text-white" disabled={loading}>
              {loading
                ? <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating workspace...</span>
                : <span className="flex items-center gap-2">Create workspace <ArrowRight className="w-4 h-4" /></span>}
            </Button>

            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">Sign in</Link>
            </p>
          </form>
        </Form>
      </div>
    </div>
  );
}
