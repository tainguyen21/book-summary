import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BookwiseAuth0Provider } from "../components/auth/auth0-provider";

export const metadata: Metadata = {
  title: "Bookwise",
  description: "Evidence-first book summaries",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <BookwiseAuth0Provider>{children}</BookwiseAuth0Provider>
      </body>
    </html>
  );
}
