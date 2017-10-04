'use strict';

const assert = require('chai').assert;
const nock = require('nock');

const HttpTransport = require('@bbc/http-transport');
const toError = require('@bbc/http-transport-to-error');
const collapse = require('../lib/collapse');

const url = 'http://www.example.com/';
const host = 'http://www.example.com';
const api = nock(host);
const path = '/';

const simpleResponseBody = 'Illegitimi non carborundum';
const simpleResponseBody2 = 'Illegitimi non carborundum2';

function noop() {}

function toUpperCase() {
  return (ctx, next) => {
    return next().then(() => {
      ctx.res.body = ctx.res.body.toUpperCase();
    });
  };
}

function toLowerCase() {
  return (ctx, next) => {
    return next().then(() => {
      ctx.res.body = ctx.res.body.toLowerCase();
    });
  };
}

function createClient(transport) {
  return HttpTransport.createBuilder(transport || new HttpTransport.defaultTransport)
    .use(toError())
    .createClient();
}

function makeRequests(client, n) {
  const pending = [];
  for (let i = 0; i < n; ++i) {
    pending.push(client
      .get(url)
      .asResponse());
  }
  return pending;
}

function assertAllFailed(pending) {
  pending.forEach((result) => {
    result
      .then(assert.fail)
      .catch(noop);
  });
}

describe('Request collasing', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
    api.get(path).reply(200, simpleResponseBody).defaultReplyHeaders({
      'Content-Type': 'text/html'
    });
  });

  it('suppresses duplicated requests at a given time', () => {
    api.get(path)
      .times(1)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport);
    const pending = makeRequests(createClient(transport), 1000);

    return Promise.all(pending)
      .then((results) => {
        assert.equal(results.length, pending.length);
        pending.forEach((result) => {
          result.then((res) => {
            assert.equal(res.body, 'Illegitimi non carborundum');
          });
        });
      });
  });

  it('does not affect the middleware stack', () => {
    api.get('/')
      .times(3)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport);
    const client = HttpTransport.createBuilder(transport)
      .use(toError())
      .createClient();

    const pending1 = client
      .get(url)
      .asResponse();

    const pending2 = client
      .use(toUpperCase())
      .get(url)
      .asResponse();

    const pending3 = client
      .use(toUpperCase())
      .get(url)
      .asResponse();

    const pending4 = client
      .use(toLowerCase())
      .get(url)
      .asResponse();

    const pending5 = client
      .use(toLowerCase())
      .get(url)
      .asResponse();

    return Promise.all([pending1, pending2, pending3, pending4, pending5])
      .then((results) => {
        assert.equal(results.length, 5);
        assert.equal(results[0].body, 'Illegitimi non carborundum');
        assert.equal(results[1].body, 'ILLEGITIMI NON CARBORUNDUM');
        assert.equal(results[2].body, 'ILLEGITIMI NON CARBORUNDUM');
        assert.equal(results[3].body, 'illegitimi non carborundum');
        assert.equal(results[4].body, 'illegitimi non carborundum');
      });
  });

  it('ensure a completed request is removed from the map', () => {
    api.get(path)
      .times(1)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport);
    const client = createClient(transport);

    assert.equal(transport.getInflightCount(), 0); // ensure empty on start

    const pending = client
      .get(url)
      .asResponse();

    return pending.then(() => {
      assert.equal(transport.getInflightCount(), 0);
    });
  });

  it('ensure failed request returns same result for all', () => {
    nock.cleanAll();
    api.get(path)
      .times(1)
      .reply(500, simpleResponseBody);

    const pending = makeRequests(createClient(), 100);

    return Promise.all(pending)
      .then(assert.ifError)
      .catch(err => assertAllFailed(pending));
  });

  it('includes query strings to determine if a request is unique', () => {
    nock.cleanAll();
    api.get(path)
      .times(1)
      .reply(200, simpleResponseBody);

    api.get(path + '?someQueryString=someValue')
      .times(1)
      .reply(200, simpleResponseBody2);

    const transport = collapse(new HttpTransport.defaultTransport);
    const client = createClient(transport);

    const requests = [];
    const pending1 = client
      .get(url)
      .asResponse();

    const pending2 = client
      .query('someQueryString', 'someValue')
      .get(url)
      .asResponse();

    requests.push(pending1, pending2);

    return Promise.all(requests)
      .catch(assert.ifError)
      .then((results) => {
        assert.equal(results.length, 2);
        assert.equal(results[0].body, simpleResponseBody);
        assert.equal(results[1].body, simpleResponseBody2);
      });
  });
});
