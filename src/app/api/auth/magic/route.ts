import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getProgramChairsOfUser } from "@/lib/systemSettings";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const magic = await prisma.magicToken.findUnique({ where: { token } });

  if (!magic || magic.expiresAt < new Date()) {
    // Expired or invalid — delete if it exists and redirect to login
    if (magic) await prisma.magicToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(new URL("/login?error=link-expired", req.url));
  }

  const user = await prisma.user.findUnique({ where: { id: magic.userId } });
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // NOT deleted on use — Office365 SafeLinks prefetches emailed URLs, which used
  // to consume one-time tokens before the recipient clicked. The token stays
  // valid until its 48h expiry (expired tokens are deleted above and by senders).

  // Build the session JWT matching the NextAuth JWT callback output
  const isSecure = req.url.startsWith("https://");
  const cookieName = isSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

  const sessionToken = await encode({
    token: {
      sub:       user.id,
      id:        user.id,
      title:     user.title ?? null,
      name:      user.name,
      email:     user.email,
      roles:         user.roles as string[],
      role:          (user.roles[0] ?? "") as string,
      studentId:     user.studentId ?? undefined,
      programChairFor: await getProgramChairsOfUser(user.id),
    },
    secret:  process.env.AUTH_SECRET!,
    salt:    cookieName,
    maxAge:  SESSION_MAX_AGE,
  });

  // Reject absolute redirects to prevent open-redirect attacks
  const safeRedirect = magic.redirectTo.startsWith("/") ? magic.redirectTo : "/dashboard";
  const redirectUrl = new URL(safeRedirect, req.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure:   isSecure,
    sameSite: "lax",
    path:     "/",
    maxAge:   SESSION_MAX_AGE,
  });

  return response;
}
