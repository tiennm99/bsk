/**
 * Sign-in page — Server Component.
 *
 * Reads async params (Next.js 16 pattern).
 * Redirects already-authenticated users to dashboard.
 * Renders the client-side SignInForm.
 */
import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/get-server-session";
import { SignInForm } from "./sign-in-form";

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 * @returns {Promise<import("react").JSX.Element>}
 */
export default async function SignInPage({ params }) {
  const { locale } = await params;

  // Redirect authenticated users away from the sign-in page.
  const session = await getServerSession();
  if (session?.user) {
    redirect({ href: `/${locale}/dashboard`, locale });
  }

  return <SignInForm />;
}
