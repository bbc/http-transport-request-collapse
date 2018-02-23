'use strict';

const _ = require('lodash');
const EventEmitter = require('events');

const DEFAULT_COLLAPSING_WINDOW = 0;
const VALID_METHODS = ['GET', 'OPTIONS', 'HEAD'];

const events = new EventEmitter();

function emitEvent(e) {
  events.emit(e);
}

function isValidMethod(method) {
  return VALID_METHODS.includes(method);
}

module.exports.middleware = (opts) => {
  const inflight = new Map();
  const refCounter = new Map();

  const collapsingWindow = _.get(opts, 'collapsingWindow', DEFAULT_COLLAPSING_WINDOW);

  return async (ctx, next) => {
    if (!isValidMethod(ctx.req.getMethod())) {
      return next();
    }

    const key = ctx.req.getUrl();

    if (inflight.get(key)) {
      emitEvent('collapsed');
      const counter = refCounter.get(key);
      refCounter.set(key, counter + 1);

      const res = await inflight.get(key);
      ctx.res = res;
      return;
    }

    let pendingResolve;
    let pendingReject;

    const pendingRequest = new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    inflight.set(key, pendingRequest);
    refCounter.set(key, 0);

    try {
      await next();
    } catch (e) {
      if (refCounter.get(key) > 0) {
        pendingReject(e);
      }

      inflight.delete(key);
      refCounter.delete(key);

      throw e;
    }

    if (collapsingWindow > 0) {
      setTimeout(() => inflight.delete(key), collapsingWindow);

    } else {
      inflight.delete(key);
    }

    pendingResolve(ctx.res);
  };
};

module.exports.events = events;
