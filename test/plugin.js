'use strict';

const assert = require('chai').assert;
const nock = require('nock');

const HttpTransport = require('@bbc/http-transport');
const collapse = require('../lib/plugin');

const url = 'http://www.example.com/';
const host = 'http://www.example.com';
const path = '/';

const simpleResponseBody = 'Du mich auch';

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

describe.only('Request collapsing', () => {
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
    const n = nock(host)
      .get(path)
      .twice()
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient();

    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));
    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));
    assert.ok(n.isDone());
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
    })
  });
});
