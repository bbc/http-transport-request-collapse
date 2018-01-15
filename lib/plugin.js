'use strict';

const _ = require('lodash');

const DEFAULT_COLLASPING_WINDOW = 0;

module.exports = (opts) => {
  const inflight = new Map();

  const collapsingWindow = _.get(opts, 'collapsingWindow', DEFAULT_COLLASPING_WINDOW);

  return async (ctx, next) => {
    const key = ctx.req.getUrl();
    
    if (inflight.get(key)) {
      ctx.res = await inflight.get(key);
      return;
    }
    
    let pendingResolve;
    const pendingRequest = new Promise((resolve) => {
      pendingResolve = resolve;
    });
    inflight.set(key, pendingRequest);

    return next().then(() => {
      if (collapsingWindow > 0) {
        setTimeout(() => inflight.delete(key), collapsingWindow);
      } else {
        inflight.delete(key);
      }

      pendingResolve(ctx.res);
    });
  };
};
