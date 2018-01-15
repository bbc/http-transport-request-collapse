'use strict';

const _ = require('lodash');
const HttpTransport = require('@bbc/http-transport');

const inflight = Symbol('inflight');
const delegate = Symbol('transport');
const stats = Symbol('stats');
const delayMs = Symbol('delayMs');

const VALID_METHODS = ['GET', 'OPTIONS', 'HEAD'];
const DEFAULT_COLLASPING_WINDOW = 0;

class RequestCollapsingTransport extends HttpTransport.transport {
  constructor(transportDelegate, opts) {
    super();
    const statsClient = _.get(opts, 'stats');
    if (statsClient) {
      this[stats] = statsClient;
    }
    this[inflight] = new Map();
    this[delegate] = transportDelegate;
    this[delayMs] = _.get(opts, 'collapsingWindow', DEFAULT_COLLASPING_WINDOW);
  }

  toOptions(ctx) {
    return this[delegate].toOptions(ctx);
  }

  toResponse(ctx, from) {
    return this[delegate].toResponse(ctx, from);
  }

  _sendStats(value) {
    if (this[stats]) {
      this[stats].increment(value);
    }
  }

  makeRequest(ctx, opts) {
    if (isInvalidMethod(ctx.req.getMethod())) {
      return this[delegate].makeRequest(ctx, opts);
    }

    const requestKey = createKey(ctx);
    if (this[inflight].has(requestKey)) {
      this._sendStats('http.collapsed.inflight');
      return this[inflight].get(requestKey);
    }
    const pending = this[delegate].makeRequest(ctx, opts);

    this[inflight].set(requestKey, pending);
    this._sendStats('http.collapsed.requests');

    // simulate finally block - ensure request is always removed
    pending.catch(() => { }).then(() => {
      if (this[delayMs] === 0) {
        this[inflight].delete(requestKey);
        return;
      }

      setTimeout(() => {
        this[inflight].delete(requestKey);
      }, this[delayMs]);
    });

    return pending;
  }

  getInflightCount() {
    return this[inflight].size;
  }
}

function createKey(ctx) {
  return ctx.req.getUrl();
}

function isInvalidMethod(method) {
  return VALID_METHODS.indexOf(method) < 0;
}

module.exports = (delegate, opts) => new RequestCollapsingTransport(delegate, opts);
