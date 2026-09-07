import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        passcode: { label: "Passcode", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.passcode) return null;
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).trim().toLowerCase() },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(String(credentials.passcode), user.passcodeHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles as string[],
          role: (user.roles[0] ?? "") as string,
          studentId: user.studentId ?? undefined,
          programChairFor: user.programChairFor,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user.id ?? "") as string;
        token.roles = (user as any).roles as string[];
        token.role = ((user as any).roles?.[0] ?? "") as string;
        token.studentId = (user as any).studentId as string | undefined;
        token.programChairFor = (user as any).programChairFor as string | null | undefined;
      }
      if (!token.roles && token.role) {
        token.roles = [token.role as string];
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.roles = (token.roles ?? [token.role]) as string[];
      session.user.role = ((token.roles as string[])?.[0] ?? token.role) as string;
      session.user.studentId = token.studentId as string | undefined;
      session.user.programChairFor = token.programChairFor as string | null | undefined;
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
});
