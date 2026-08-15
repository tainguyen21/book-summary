import { AccountMenu } from "../components/auth/account-menu";
import { auth0 } from "../lib/auth0";

export default async function HomePage() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <main>
        <h1>Bookwise</h1>
        <p>Your private library is one sign-in away.</p>
        <a href="/auth/login">Sign in</a>
      </main>
    );
  }

  const email = session.user.email?.trim();

  if (!email) {
    throw new Error("Authenticated user email is required.");
  }

  return (
    <main>
      <h1>Your library</h1>
      <AccountMenu email={email} />
      <p>Private uploads and saved books will appear here soon.</p>
    </main>
  );
}
