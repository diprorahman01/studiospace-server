
const AUTH_URL =
  process.env.BETTER_AUTH_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000";

async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie;

  if (!cookie) {
    return res.status(401).json({
      success: false,
      message: "Please log in to make a booking.",
    });
  }

  try {
    const response = await fetch(
      `${AUTH_URL}/api/auth/get-session`,
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
        message: "Your session is invalid. Please log in again.",
      });
    }

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(503).json({
      success: false,
      message: "Could not verify your session.",
    });
  }
}

module.exports = requireAuth;
