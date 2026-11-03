
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const requireAuth = require(
  "../src/middleware/requireAuth"
);

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("Rejects requests without a session cookie", async () => {
  const request = {
    headers: {},
  };

  const response = mockResponse();

  let nextCalled = false;

  await requireAuth(
    request,
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(nextCalled, false);
});

test("Rejects an invalid authenticated session", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        user: null,
        session: null,
      }),
    });

    const request = {
      headers: {
        cookie: "better-auth.session_token=invalid",
      },
    };

    const response = mockResponse();

    let nextCalled = false;

    await requireAuth(
      request,
      response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(response.statusCode, 401);
    assert.equal(nextCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Accepts a valid authenticated session", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        user: {
          id: "test-user-123",
          name: "StudioSpace Test User",
          email: "test@example.com",
        },
        session: {
          id: "test-session-123",
        },
      }),
    });

    const request = {
      headers: {
        cookie: "better-auth.session_token=test-token",
      },
    };

    const response = mockResponse();

    let nextCalled = false;

    await requireAuth(
      request,
      response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(nextCalled, true);
    assert.equal(request.user.id, "test-user-123");
    assert.equal(
      request.user.email,
      "test@example.com"
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("Returns 503 when authentication service is unavailable", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => {
      throw new Error("Connection failed");
    };

    const request = {
      headers: {
        cookie: "better-auth.session_token=unknown",
      },
    };

    const response = mockResponse();

    let nextCalled = false;

    await requireAuth(
      request,
      response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(response.statusCode, 503);
    assert.equal(nextCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
