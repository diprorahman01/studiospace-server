"use strict";

const AUTH_URL = (
  process.env.BETTER_AUTH_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

const JWT_COOKIE_NAMES = [
  "better-auth.session_data",
  "__Secure-better-auth.session_data",
];

let verifierPromise;

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== "string") return null;

  const prefix = `${name}=`;
  const item = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return null;
  }
}

async function verifySessionJwt(cookieHeader) {
  const token = JWT_COOKIE_NAMES
    .map((name) => readCookie(cookieHeader, name))
    .find(Boolean);

  if (!token) return false;

  if (!verifierPromise) {
    verifierPromise = import("jose").then(
      ({ jwtVerify, createRemoteJWKSet }) => ({
        jwtVerify,
        jwks: createRemoteJWKSet(
          new URL(`${AUTH_URL}/api/auth/jwks`),
          { timeoutDuration: 8000 }
        ),
      })
    );
  }

  const { jwtVerify, jwks } = await verifierPromise;
  await jwtVerify(token, jwks, {
    algorithms: ["EdDSA", "ES256", "RS256", "PS256"],
  });
  return true;
}

function requiresJwt(req) {
  const method = req.method;
  const base = req.baseUrl || "";
  const path = req.path || "";
  return (
    (method === "POST" && base === "/api/studios" && path === "/") ||
    (method === "DELETE" && base === "/api/studios" && /^\/[a-fA-F0-9]{24}$/.test(path)) ||
    (method === "POST" && base === "/api/bookings" && path === "/")
  );
}

async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie;

  if (!cookie) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  try {
    // Require the JWT for the three challenge mutations only.
    // Other routes retain their existing Better Auth session behavior.
    if (requiresJwt(req)) {
      const validJwt = await verifySessionJwt(cookie);
      if (!validJwt) {
        return res.status(401).json({
          success: false,
          message: "Authentication token missing. Refresh the page and log in again.",
        });
      }
    }

    // Re-check the primary Better Auth session in the database.
    // The JWT is never trusted as the only proof of an active login.
    const response = await fetch(
      `${AUTH_URL}/api/auth/get-session?disableCookieCache=true`,
      {
        method: "GET",
        headers: {
          Cookie: cookie,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return res.status(503).json({
        success: false,
        message: "Authentication service unavailable.",
      });
    }

    const session = await response.json();
    if (!session?.user?.id || !session?.session?.id) {
      return res.status(401).json({
        success: false,
        message: "Session invalid or expired. Please log in again.",
      });
    }

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
    return next();
  } catch (error) {
    if (
      typeof error?.code === "string" &&
      (error.code.startsWith("ERR_JWT") || error.code.startsWith("ERR_JWS"))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    console.error("Authentication verification error:", error.message);
    return res.status(503).json({
      success: false,
      message: "Could not verify your session.",
    });
  }
}

module.exports = requireAuth;
