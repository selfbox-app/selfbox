import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@selfbox/database/client';
import { users, sessions, accounts, verifications } from '@selfbox/database';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.PORTLESS_URL,
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    process.env.PORTLESS_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://web.localhost",
    "https://selfbox.localhost",
  ].filter((origin): origin is string => Boolean(origin)),
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session;
