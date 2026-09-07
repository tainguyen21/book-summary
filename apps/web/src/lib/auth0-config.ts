import { z } from "zod";

const publicAuth0ConfigSchema = z.object({
  NEXT_PUBLIC_AUTH0_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_AUTH0_CLIENT_ID: z.string().min(1),
  NEXT_PUBLIC_AUTH0_AUDIENCE: z.string().url(),
  NEXT_PUBLIC_AUTH0_REDIRECT_URI: z.string().url(),
});

export const publicAuth0Config = publicAuth0ConfigSchema.parse({
  NEXT_PUBLIC_AUTH0_DOMAIN: process.env.NEXT_PUBLIC_AUTH0_DOMAIN,
  NEXT_PUBLIC_AUTH0_CLIENT_ID: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
  NEXT_PUBLIC_AUTH0_AUDIENCE: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
  NEXT_PUBLIC_AUTH0_REDIRECT_URI: process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI,
});
