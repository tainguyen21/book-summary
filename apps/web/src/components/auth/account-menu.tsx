export function AccountMenu({ email }: { email: string }) {
  return (
    <div>
      <span>{email}</span>
      <a href="/auth/logout">Sign out</a>
    </div>
  );
}
