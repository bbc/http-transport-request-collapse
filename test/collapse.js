'use strict';

const assert = require('chai').assert;
const nock = require('nock');
const sinon = require('sinon');

const HttpTransport = require('@bbc/http-transport');
const toError = require('@bbc/http-transport-to-error');
const collapse = require('../lib/collapse');

const url = 'http://www.example.com/';
const host = 'http://www.example.com';
const path = '/';

const simpleResponseBody = 'Illegitimi non carborundum';
const simpleResponseBody2 = 'Illegitimi non carborundum2';

const sandbox = sinon.sandbox.create();

function noop() { }

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
  return HttpTransport.createBuilder(transport || new HttpTransport.defaultTransport())
    .use(toError())
    .createClient();
}

function buildRequest(client, method) {
  method = method.toLowerCase();

  return () => {
    return client[method](url).asResponse();
  };
}

function makeRequests(request, n) {
  const pending = [];
  for (let i = 0; i < n; ++i) {
    pending.push(request());
  }
  return pending;
}

function assertAllFailed(pending) {
  pending.forEach((result) => {
    result.then(assert.fail).catch(noop);
  });
}

describe('Request collapsing', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock(host)
      .get(path)
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('suppresses duplicated requests at a given time', () => {
    nock(host)
      .get(path)
      .times(1)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);
    const pending = makeRequests(buildRequest(client, 'GET'), 1000);

    return Promise.all(pending).then((results) => {
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, 'Illegitimi non carborundum');
        });
      });
    });
  });

  it('does not collapse POST requests', () => {
    const post = nock(host)
      .post(path)
      .times(10)
      .socketDelay(2000)
      .reply(201, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);
    const pending = makeRequests(buildRequest(client, 'POST'), 10);

    return Promise.all(pending).then((results) => {
      post.done();
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, 'Illegitimi non carborundum');
        });
      });
    });
  });

  it('does not collapse PUT requests', () => {
    const put = nock(host)
      .put(path)
      .times(10)
      .socketDelay(2000)
      .reply(201, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);
    const pending = makeRequests(buildRequest(client, 'PUT'), 10);

    return Promise.all(pending).then((results) => {
      put.done();
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, 'Illegitimi non carborundum');
        });
      });
    });
  });

  it('does not collapse PATCH requests', () => {
    const patch = nock(host)
      .patch(path)
      .times(10)
      .socketDelay(2000)
      .reply(201, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);
    const pending = makeRequests(buildRequest(client, 'PATCH'), 10);

    return Promise.all(pending).then((results) => {
      patch.done();
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, 'Illegitimi non carborundum');
        });
      });
    });
  });

  it('does not collapse DELETE requests', () => {
    const del = nock(host)
      .delete(path)
      .times(10)
      .socketDelay(2000)
      .reply(201, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);
    const pending = makeRequests(buildRequest(client, 'DELETE'), 10);

    return Promise.all(pending).then((results) => {
      del.done();
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, 'Illegitimi non carborundum');
        });
      });
    });
  });

  it('does not affect the middleware stack', () => {
    nock(host)
      .get('/')
      .times(3)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = HttpTransport.createBuilder(transport)
      .use(toError())
      .createClient();

    const pending1 = client.get(url).asResponse();

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

    return Promise.all([pending1, pending2, pending3, pending4, pending5]).then((results) => {
      assert.equal(results.length, 5);
      assert.equal(results[0].body, 'Illegitimi non carborundum');
      assert.equal(results[1].body, 'ILLEGITIMI NON CARBORUNDUM');
      assert.equal(results[2].body, 'ILLEGITIMI NON CARBORUNDUM');
      assert.equal(results[3].body, 'illegitimi non carborundum');
      assert.equal(results[4].body, 'illegitimi non carborundum');
    });
  });

  it('removes a successful request from the in flight lookup', () => {
    nock(host)
      .get(path)
      .times(1)
      .socketDelay(2000)
      .reply(200, simpleResponseBody);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);

    assert.equal(transport.getInflightCount(), 0); // ensure empty on start
    const pending = client.get(url).asResponse();

    return pending.then(() => {
      assert.equal(transport.getInflightCount(), 0);
    });
  });

  it('removes a failed request from the in flight lookup', () => {
    nock(host)
      .get(path)
      .times(1)
      .socketDelay(2000)
      .reply(500);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);

    assert.equal(transport.getInflightCount(), 0);
    const pending = client.get(url).asResponse();

    return pending.catch(noop).then(() => {
      assert.equal(transport.getInflightCount(), 0);
    });
  });

  it('removes a request from the in flight lookup on error', () => {
    nock(host)
      .get(path)
      .replyWithError('when wrong!');

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);

    assert.equal(transport.getInflightCount(), 0);
    const pending = client.get(url).asResponse();

    return pending.catch(noop).then(() => {
      assert.equal(transport.getInflightCount(), 0);
    });
  });

  it('ensure failed request returns same result for all', () => {
    nock(host)
      .get(path)
      .times(1)
      .reply(500, simpleResponseBody);

    const client = createClient();
    const pending = makeRequests(buildRequest(client, 'GET'), 100);

    return Promise.all(pending)
      .then(assert.ifError)
      .catch(() => assertAllFailed(pending));
  });

  it('includes query strings to determine if a request is unique', () => {
    nock(host)
      .get(path)
      .times(1)
      .reply(200, simpleResponseBody);

    nock(host)
      .get(path + '?someQueryString=someValue')
      .times(1)
      .reply(200, simpleResponseBody2);

    const transport = collapse(new HttpTransport.defaultTransport());
    const client = createClient(transport);

    const requests = [];
    const pending1 = client.get(url).asResponse();

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

  describe('collasping window', () => {
    it('expands collapsing window', () => {
      let counter = 0;
      nock(host).get(path + '?anotherQueryString=someValue').times(1).reply(200, 'RESPONSE1');

      const collapsingWindow = 100;
      const coll = collapse(new HttpTransport.defaultTransport(), { collapsingWindow });
      const client = createClient(coll);

      const first = client
        .query('anotherQueryString', 'someValue')
        .get(url)
        .asResponse();

      return first
        .then(() => {
          nock(host).get(path + '?anotherQueryString=someValue').reply(200, 'RESPONSE2');

          const second = client
            .query('anotherQueryString', 'someValue')
            .get(url)
            .asResponse();

          return second.then((res) => {
            assert.equal(res.body, 'RESPONSE1');
          });
        });
    });
  });

  describe('stats', () => {
    const stats = {};

    beforeEach(() => {
      stats.increment = sandbox.stub();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('sends stats when making a request', () => {
      nock(host)
        .get(path)
        .times(1)
        .socketDelay(2000)
        .reply(200, simpleResponseBody);

      const transport = collapse(new HttpTransport.defaultTransport(), { stats });
      const client = createClient(transport);
      const pending = client.get(url).asResponse();

      return pending
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(stats.increment, 'http.collapsed.requests');
        });
    });

    it('sends stats when returning inflight response', () => {
      nock(host)
        .get(path)
        .times(2)
        .socketDelay(2000)
        .reply(200, simpleResponseBody);

      const transport = collapse(new HttpTransport.defaultTransport(), { stats });
      const client = createClient(transport);
      const pending = makeRequests(buildRequest(client, 'GET'), 2);

      return Promise.all(pending)
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(stats.increment, 'http.collapsed.inflight');
        });
    });
  });
});
