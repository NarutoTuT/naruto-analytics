import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import UnknownAppPage, { loader } from "../app/routes/app.$";

globalThis.notFoundAuth = { requests: [] };

test.beforeEach(() => {
  globalThis.notFoundAuth = { requests: [] };
});

test("unknown app paths authenticate before returning 404", async () => {
  const request = new Request("https://example.test/app/missing");
  const result = await loader({ request, params: {}, context: {} } as never);

  assert.equal(globalThis.notFoundAuth.requests.length, 1);
  assert.equal(globalThis.notFoundAuth.requests[0], request);
  assert.equal(result.init?.status, 404);
});

test("unknown app page is friendly and links back to Today", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/app/missing"] },
      React.createElement(UnknownAppPage),
    ),
  );

  assert.match(html, /Page unavailable/);
  assert.match(html, /页面暂时无法打开/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /Return to Today/);
  assert.doesNotMatch(html, /Unhandled Thrown Response|Error:|stack/i);
});

test("authentication failures are preserved", async () => {
  globalThis.notFoundAuth.error = new Response(null, { status: 401 });

  await assert.rejects(
    loader({
      request: new Request("https://example.test/app/missing"),
      params: {},
      context: {},
    } as never),
    (error: unknown) => error instanceof Response && error.status === 401,
  );
});

declare global {
  // eslint-disable-next-line no-var
  var notFoundAuth: {
    requests: Request[];
    error?: Response;
  };
}
