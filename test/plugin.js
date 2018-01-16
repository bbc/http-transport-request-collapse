'use strict';

const assert = require('chai').assert;
const nock = require('nock');

const HttpTransport = require('@bbc/http-transport');
const collapse = require('../lib/plugin').middleware;
const collapseEvents = require('../lib/plugin').events;

const url = 'http://www.example.com/';
const host = 'http://www.example.com';
const path = '/';

const simpleResponseBody = 'Du mich auch';
const simpleResponseBody2 = 'Ich dich nicht';

function createClient(opts) {
  return HttpTransport.createBuilder()
    .use(collapse(opts))
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

describe('Request collapsing', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('behaves as a plugin', () => {
    nock(host)
      .get(path)
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient();

    return client
      .get(url)
      .asResponse()
      .then((res) => {
        assert.equal(res.statusCode, 200);
      });
  });

  it('collapses requests', () => {
    nock(host)
      .get(path)
      .times(1)
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient();

    const pending = makeRequests(buildRequest(client, 'GET'), 20);

    return Promise.all(pending).then((results) => {
      assert.equal(results.length, pending.length);
      pending.forEach((result) => {
        result.then((res) => {
          assert.equal(res.body, simpleResponseBody);
        });
      });
    });
  });

  it('removes the collapsed request key after a successful response', async () => {
    const api = nock(host)
      .get(path)
      .twice()
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient();

    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));
    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));
    assert.ok(api.isDone());
  });

  it('keeps a window of collapsed requests', async () => {
    nock(host)
      .get(path)
      .once()
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient({
      collapsingWindow: 50
    });

    return client
      .get(url)
      .asResponse()
      .then(async (res) => {
        assert.equal(res.body, simpleResponseBody);
        await new Promise((resolve) => setTimeout(resolve, 25));
        return client
          .get(url)
          .asResponse()
          .then((res) => {
            assert.equal(res.body, simpleResponseBody);
          });
      });
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

    const client = createClient();

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

  describe('Write based HTTP Method', () => {
    it('does not collapse POST requests', () => {
      const api = nock(host)
        .post(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();

      const pending = makeRequests(buildRequest(client, 'POST'), 2);

      return Promise.all(pending).then((results) => {
        assert.ok(api.isDone());
        assert.equal(results.length, pending.length);

        pending.forEach((result) => {
          result.then((res) => {
            assert.equal(res.body, simpleResponseBody);
          });
        });
      });
    });

    it('does not collapse PUT requests', () => {
      const api = nock(host)
        .put(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();

      const pending = makeRequests(buildRequest(client, 'PUT'), 2);

      return Promise.all(pending).then((results) => {
        assert.ok(api.isDone());
        assert.equal(results.length, pending.length);

        pending.forEach((result) => {
          result.then((res) => {
            assert.equal(res.body, simpleResponseBody);
          });
        });
      });
    });

    it('does not collapse PATCH requests', () => {
      const api = nock(host)
        .patch(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();

      const pending = makeRequests(buildRequest(client, 'PATCH'), 2);

      return Promise.all(pending).then((results) => {
        assert.ok(api.isDone());
        assert.equal(results.length, pending.length);

        pending.forEach((result) => {
          result.then((res) => {
            assert.equal(res.body, simpleResponseBody);
          });
        });
      });
    });

    it('does not collapse DELETE requests', () => {
      const api = nock(host)
        .delete(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();

      const pending = makeRequests(buildRequest(client, 'DELETE'), 2);

      return Promise.all(pending).then((results) => {
        assert.ok(api.isDone());
        assert.equal(results.length, pending.length);

        pending.forEach((result) => {
          result.then((res) => {
            assert.equal(res.body, simpleResponseBody);
          });
        });
      });
    });

  });

  describe('Events', () => {
    it('emits an event when making a request', () => {
      nock(host)
        .get(path)
        .times(1)
        .reply(200, simpleResponseBody);

      const client = createClient();

      let emitCount = 0;
      collapseEvents.on('collapsed', () => {
        emitCount++;
      });

      const pending = makeRequests(buildRequest(client, 'GET'), 20);

      return Promise.all(pending).then(() => {
        assert.equal(emitCount, 19);
      });
    });
  });
});
