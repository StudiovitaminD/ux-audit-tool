import { Suspense } from "react";
import { AuthPageForm } from "@/components/account/auth-page-form";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageForm mode="sign-up" />
    </Suspense>
  );
}
