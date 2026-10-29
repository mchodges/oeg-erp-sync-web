import { NextRequest, NextResponse } from "next/server";

/**
 * Password gate for the Bid Pricing Estimator (page + API routes) and the hidden /dev page.
 *
 * Browser-native HTTP Basic Auth: the browser asks for a username and password once
 * and then sends them with every page load and fetch() call, so no UI changes are needed.
 *
 * Turned on by setting APP_PASSWORD (and optionally APP_USERNAME, default "oeg") in the
 * Vercel project's environment variables, then redeploying. If APP_PASSWORD is not set the
 * gate is open, so deploying this change can never lock anyone out by itself.
 *
 * Deliberately NOT covered: /workflows (embedded in SharePoint) and the other tools.
 */
export const config = {
  matcher: ["/pricing/:path*", "/api/pricing/:path*", "/dev/:path*"],
};

function safeEqual(a: string, b: string): boolean {
  // Compare every character regardless of where the first difference is.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const username = process.env.APP_USERNAME || "oeg";
  const header = req.headers.get("authorization") ?? "";

  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      if (sep >= 0) {
        const okUser = safeEqual(decoded.slice(0, sep), username);
        const okPass = safeEqual(decoded.slice(sep + 1), password);
        if (okUser && okPass) return NextResponse.next();
      }
    } catch {
      // malformed header - fall through to the challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OEG Bid Pricing", charset="UTF-8"' },
  });
}
