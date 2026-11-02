
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const RESEND_URL = "https://api.resend.com/emails";

function validEmail(value) {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailTemplate({
  heading,
  recipientName,
  message,
  booking,
  actionUrl,
  actionLabel,
}) {
  const amount = Number(booking.totalAmount || 0);

  const formattedAmount = `$${amount.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  )}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport"
              content="width=device-width, initial-scale=1" />
      </head>
      <body style="
        margin:0;
        padding:30px 15px;
        background:#f5f2fa;
        font-family:Arial,Helvetica,sans-serif;
        color:#24182f;
      ">
        <div style="
          max-width:570px;
          margin:0 auto;
          background:#ffffff;
          border-radius:16px;
          overflow:hidden;
          border:1px solid #e6dbf3;
        ">
          <div style="
            background:#4c1d95;
            color:#ffffff;
            padding:25px 30px;
          ">
            <h1 style="
              margin:0;
              font-size:25px;
              color:#ffffff;
            ">
              StudioSpace
            </h1>
            <p style="
              margin:8px 0 0;
              font-size:13px;
              color:#e9d5ff;
            ">
              Creative studio reservations
            </p>
          </div>

          <div style="padding:30px;">
            <h2 style="
              margin:0 0 18px;
              font-size:23px;
              color:#3b176d;
            ">
              ${escapeHtml(heading)}
            </h2>

            <p style="
              font-size:15px;
              line-height:1.7;
            ">
              Hello ${escapeHtml(recipientName || "there")},
            </p>

            <p style="
              font-size:15px;
              line-height:1.7;
            ">
              ${escapeHtml(message)}
            </p>

            <div style="
              margin:25px 0;
              padding:20px;
              background:#f7f2ff;
              border-radius:12px;
              border:1px solid #eadcf9;
            ">
              <p style="margin:0 0 12px;">
                <strong>Studio:</strong>
                ${escapeHtml(booking.studioTitle || "Studio")}
              </p>

              <p style="margin:0 0 12px;">
                <strong>Date:</strong>
                ${escapeHtml(booking.date)}
              </p>

              <p style="margin:0 0 12px;">
                <strong>Time:</strong>
                ${escapeHtml(booking.startTime)}
                –
                ${escapeHtml(booking.endTime)}
              </p>

              <p style="margin:0 0 12px;">
                <strong>Booking status:</strong>
                ${escapeHtml(booking.status)}
              </p>

              <p style="margin:0;">
                <strong>Total amount:</strong>
                ${formattedAmount}
              </p>
            </div>

            <a href="${escapeHtml(actionUrl)}"
               style="
                 display:inline-block;
                 background:#6d28d9;
                 color:#ffffff;
                 padding:13px 20px;
                 text-decoration:none;
                 border-radius:10px;
                 font-size:14px;
                 font-weight:bold;
               ">
              ${escapeHtml(actionLabel)}
            </a>

            <p style="
              margin-top:25px;
              color:#736581;
              font-size:12px;
              line-height:1.6;
            ">
              This is an automated booking notification.
              No payment was collected through this email.
              Please sign in to StudioSpace for the
              latest booking information.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendEmail({
  to,
  subject,
  heading,
  recipientName,
  message,
  booking,
  actionUrl,
  actionLabel,
  eventKey,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log(
      "Booking email skipped: email service is not configured."
    );
    return false;
  }

  if (!validEmail(to)) {
    console.warn(
      "Booking email skipped: invalid recipient."
    );
    return false;
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "StudioSpace/1.0",
    };

    if (eventKey) {
      headers["Idempotency-Key"] = eventKey;
    }

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: [to.trim()],
        subject,
        html: emailTemplate({
          heading,
          recipientName,
          message,
          booking,
          actionUrl,
          actionLabel,
        }),
      }),
    });

    if (!response.ok) {
      const details = await response.text();

      console.error(
        "Booking email service error:",
        response.status,
        details.slice(0, 500)
      );

      return false;
    }

    console.log(
      "Booking email accepted by provider."
    );

    return true;
  } catch (error) {
    console.error(
      "Booking email delivery error:",
      error.message
    );

    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getEvent(req) {
  if (req.method === "POST" &&
      req.originalUrl.split("?")[0] === "/api/bookings") {
    return "created";
  }

  const customerMatch = req.originalUrl.match(
    /^\/api\/bookings\/([a-fA-F0-9]{24})\/(cancel|reschedule)(?:\?.*)?$/
  );

  if (req.method === "PATCH" && customerMatch) {
    return customerMatch[2] === "cancel"
      ? "cancelled"
      : "rescheduled";
  }

  const hostMatch = req.originalUrl.match(
    /^\/api\/host\/bookings\/([a-fA-F0-9]{24})\/(approve|reject)(?:\?.*)?$/
  );

  if (req.method === "PATCH" && hostMatch) {
    return hostMatch[2] === "approve"
      ? "approved"
      : "rejected";
  }

  return null;
}

function getBookingId(req, responseData) {
  if (responseData?.data?._id) {
    return String(responseData.data._id);
  }

  const match = req.originalUrl.match(
    /\/bookings\/([a-fA-F0-9]{24})\//
  );

  return match ? match[1] : null;
}

function bookingStatusMessage(event, audience) {
  const customerMessages = {
    created: "Your booking request was received and is awaiting host approval.",
    approved: "Good news! Your studio booking has been approved.",
    rejected: "Your studio booking request was rejected by the host.",
    cancelled: "Your pending studio booking has been cancelled.",
    rescheduled: "Your pending studio booking has been rescheduled.",
  };

  const hostMessages = {
    created: "A customer has submitted a new booking request for your studio.",
    cancelled: "A customer has cancelled their pending studio booking.",
    rescheduled: "A customer has rescheduled their pending studio booking.",
  };

  return audience === "customer"
    ? customerMessages[event]
    : hostMessages[event];
}

async function notifySuccessfulBooking(
  req,
  event,
  responseData
) {
  const id = getBookingId(req, responseData);

  if (!id || !ObjectId.isValid(id)) return;

  const db = getDB();

  const booking = await db
    .collection("bookings")
    .findOne({ _id: new ObjectId(id) });

  if (!booking) return;

  const studioId = String(booking.studioId || "");

  const studio = ObjectId.isValid(studioId)
    ? await db.collection("studios").findOne({
        _id: new ObjectId(studioId),
      })
    : null;

  const baseUrl = (
    process.env.CLIENT_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const timestamp = booking.updatedAt
    ? new Date(booking.updatedAt).getTime()
    : Date.now();

  const messages = [];

  const customerMessage = bookingStatusMessage(
    event,
    "customer"
  );

  if (customerMessage && validEmail(booking.userEmail)) {
    messages.push({
      to: booking.userEmail,
      subject: `StudioSpace — Booking ${event}`,
      heading: `Booking ${event}`,
      recipientName: booking.userName,
      message: customerMessage,
      booking,
      actionUrl: `${baseUrl}/my-bookings`,
      actionLabel: "View My Bookings",
      eventKey: `ss-customer-${id}-${event}-${timestamp}`,
    });
  }

  const hostMessage = bookingStatusMessage(
    event,
    "host"
  );

  if (
    hostMessage &&
    studio &&
    validEmail(studio.ownerEmail)
  ) {
    messages.push({
      to: studio.ownerEmail,
      subject: `StudioSpace — Booking ${event}`,
      heading: `Booking ${event}`,
      recipientName: studio.ownerName || "Studio Host",
      message: hostMessage,
      booking,
      actionUrl: `${baseUrl}/host-bookings`,
      actionLabel: "Manage Bookings",
      eventKey: `ss-host-${id}-${event}-${timestamp}`,
    });
  }

  await Promise.allSettled(
    messages.map((details) => sendEmail(details))
  );
}

// ==========================================
// Middleware that observes successful actions
// without changing existing route responses.
// ==========================================

function bookingEmailMiddleware(req, res, next) {
  const event = getEvent(req);

  if (!event) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (
      res.statusCode >= 200 &&
      res.statusCode < 300 &&
      body?.success === true
    ) {
      const responseData = {
        data: body.data,
      };

      // Start email work after the successful
      // response has been sent to the customer.
      res.once("finish", () => {
        void notifySuccessfulBooking(
          req,
          event,
          responseData
        ).catch((error) => {
          console.error(
            "Booking email processing error:",
            error
          );
        });
      });
    }

    return originalJson(body);
  };

  next();
}

module.exports = bookingEmailMiddleware;
