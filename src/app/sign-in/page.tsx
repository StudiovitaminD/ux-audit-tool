import { Suspense } from "react";
import { AuthPageForm } from "@/components/account/auth-page-form";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageForm mode="sign-in" />
    </Suspense>
  );
}
