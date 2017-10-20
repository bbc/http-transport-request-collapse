'use strict';

const HttpTransport = require('@bbc/http-transport');

const inflight = Symbol('inflight');
const delegate = Symbol('transport');

class RequestCollapsingTransport extends HttpTransport.transport {
  constructor(transportDelegate) {
    super();
    this[inflight] = new Map();
    this[delegate] = transportDelegate;
  }

  toOptions(ctx) {
    return this[delegate].toOptions(ctx);
  }

  toResponse(ctx, from) {
    return this[delegate].toResponse(ctx, from);
  }

  makeRequest(ctx, opts) {
    const requestKey = createKey(ctx);
    if (this[inflight].has(requestKey)) {
      return this[inflight].get(requestKey);
    }
    const pending = this[delegate].makeRequest(ctx, opts);
    this[inflight].set(requestKey, pending);

    // simulate finally block - ensure request is always removed
    pending.catch(() => {}).then(() => {
      this[inflight].delete(requestKey);
    });

    return pending;
  }

  getInflightCount() {
    return this[inflight].size;
  }
}

function createKey(ctx) {
  const url = ctx.req.getUrl();
  if (ctx.req.hasQueries()) {
    const queries = JSON.stringify(ctx.req.getQueries());
    return url + queries;
  }
  return url;
}

module.exports = delegate => new RequestCollapsingTransport(delegate);
