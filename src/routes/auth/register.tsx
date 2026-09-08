import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Instagram } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/AuthLayout";
import { Spinner } from "@/components/Spinner";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { routeForRole } from "@/routes/auth/login";

type RoleChoice = "brand" | "creator";

export const Route = createFileRoute("/auth/register")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { role?: "brand" | "creator" } =>
    search['role'] === "brand" ? { role: "brand" } : { role: "creator" },
  head: () => ({
    meta: [
      { title: "Create your account — AdBridge" },
      {
        name: "description",
        content:
          "Sign up to AdBridge as a brand to launch influencer campaigns, or as a creator to earn from branded reels.",
      },
      { property: "og:title", content: "Create your account — AdBridge" },
      { property: "og:description", content: "Join AdBridge as a brand or a creator." },
    ],
  }),
  component: RegisterPage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Use at least 6 characters").max(72),
});

function RegisterPage() {
  const { role: initialRole } = Route.useSearch();
  const navigate = useNavigate();
  const [role, setRole] = useState<RoleChoice>(initialRole ?? "creator");
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: values.full_name, role },
      },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data.session) {
      setEmailSent(values.email);
      toast.success("Account created — confirm your email to continue");
      return;
    }

    toast.success("Account created");
    const target = await routeForRole(data.user!.id);
    navigate({ to: target, replace: true });
  };

  const signUpWithGoogle = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast.error("Google sign-up failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const target = await routeForRole(data.user.id);
      navigate({ to: target, replace: true });
    }
    setGoogleLoading(false);
  };

  if (emailSent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={`We sent a confirmation link to ${emailSent}. Click it to activate your account, then sign in.`}
        footer={
          <Link to="/auth/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          Didn't get it? Check spam, or register again with a different email address.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Pick how you want to use AdBridge. You can only have one role per account."
      footer={
        <>
          Already registered?{" "}
          <Link to="/auth/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Tabs value={role} onValueChange={(v) => setRole(v as RoleChoice)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="brand">
            <Building2 className="mr-2 size-4" /> Brand
          </TabsTrigger>
          <TabsTrigger value="creator">
            <Instagram className="mr-2 size-4" /> Creator
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
        {role === "brand"
          ? "Brands post campaign briefs, approve applicants and release payouts after verifying deliverables."
          : "Creators build a media profile, apply to matching campaigns, submit reels and track payouts."}
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{role === "brand" ? "Brand / contact name" : "Full name"}</FormLabel>
                <FormControl>
                  <Input placeholder={role === "brand" ? "Acme Nutrition" : "Ria Sharma"} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Create {role} account
          </Button>
        </form>
      </Form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        OR
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={signUpWithGoogle}
        disabled={googleLoading}
      >
        {googleLoading ? <Spinner /> : null}
        Continue with Google
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Google sign-ups start as creator accounts.
      </p>
    </AuthLayout>
  );
}
