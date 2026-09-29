'use strict';

const { expect } = require('@jest/globals');
const nock = require('nock');

const HttpTransport = require('@bbc/http-transport');
const collapse = require('../index').middleware;
const collapseEvents = require('../index').events;

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

  it('behaves as a plugin', async () => {
    nock(host)
      .get(path)
      .reply(200, simpleResponseBody)
      .defaultReplyHeaders({
        'Content-Type': 'text/html'
      });

    const client = createClient();
    const res = await client
      .get(url)
      .asResponse();

    expect(res.statusCode).toBe(200);
  });

  it('collapses requests', async () => {
    nock(host)
      .get(path)
      .times(1)
      .reply(200, simpleResponseBody);

    const client = createClient();
    const pending = makeRequests(buildRequest(client, 'GET'));
    const results = await Promise.all(pending, 20);

    expect(results.length).toBe(pending.length);
    results.forEach((res) => {
      expect(res.body).toBe(simpleResponseBody);
    });
  });

  it('removes the collapsed request key after a successful response', async () => {
    const api = nock(host)
      .get(path)
      .twice()
      .reply(200, simpleResponseBody);

    const client = createClient();
    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));
    await Promise.all(makeRequests(buildRequest(client, 'GET'), 1));

    expect(api.isDone()).toBe(true);
  });

  it('removes the collapsed request key on error', async () => {
    const api1 = nock(host)
      .get(path)
      .once()
      .replyWithError('when wrong!');

    const api2 = nock(host)
      .get(path)
      .once()
      .reply(200, simpleResponseBody);

    const client = createClient();

    let assertedAll = false;
    try {
      await client.get(url).asResponse();
    } catch (err) {
      expect(api1.isDone()).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 25));

      const res = await client
        .get(url)
        .asResponse();

      expect(api2.isDone()).toBe(true);
      expect(res.body).toBe(simpleResponseBody);
      assertedAll = true;
    }

    expect(assertedAll).toBe(true);
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
    const res = await client
      .get(url)
      .asResponse();

    expect(res.body).toBe(simpleResponseBody);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const res2 = await client
      .get(url)
      .asResponse();

    expect(res2.body).toBe(simpleResponseBody);
  });

  it('includes query strings to determine if a request is unique', async () => {
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
    const results = await Promise.all(requests);

    expect(results.length).toBe(2);
    expect(results[0].body).toBe(simpleResponseBody);
    expect(results[1].body).toBe(simpleResponseBody2);
  });

  describe('Write based HTTP Method', () => {
    it('does not collapse POST requests', async () => {
      const api = nock(host)
        .post(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();
      const pending = makeRequests(buildRequest(client, 'POST'), 2);
      const results = await Promise.all(pending);

      expect(api.isDone()).toBe(true);
      expect(results.length).toBe(pending.length);
      results.forEach((result) => {
        expect(result.body).toBe(simpleResponseBody);
      });
    });

    it('does not collapse PUT requests', async () => {
      const api = nock(host)
        .put(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();
      const pending = makeRequests(buildRequest(client, 'PUT'), 2);
      const results = await Promise.all(pending);

      expect(api.isDone()).toBe(true);
      expect(results.length).toBe(pending.length);
      results.forEach((result) => {
        expect(result.body).toBe(simpleResponseBody);
      });
    });

    it('does not collapse PATCH requests', async () => {
      const api = nock(host)
        .patch(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();
      const pending = makeRequests(buildRequest(client, 'PATCH'), 2);
      const results = await Promise.all(pending);

      expect(api.isDone()).toBe(true);
      expect(results.length).toBe(pending.length);
      results.forEach((result) => {
        expect(result.body).toBe(simpleResponseBody);
      });
    });

    it('does not collapse DELETE requests', async () => {
      const api = nock(host)
        .delete(path)
        .twice()
        .reply(200, simpleResponseBody);

      const client = createClient();
      const pending = makeRequests(buildRequest(client, 'DELETE'), 2);
      const results = await Promise.all(pending);

      expect(api.isDone()).toBe(true);
      expect(results.length).toBe(pending.length);
      results.forEach((result) => {
        expect(result.body).toBe(simpleResponseBody);
      });
    });

  });

  describe('Events', () => {
    it('emits a generic event when making a request', async () => {
      nock(host)
        .get(path)
        .times(1)
        .reply(200, simpleResponseBody);

      let emitCount = 0;
      collapseEvents.on('collapsed', () => {
        emitCount++;
      });

      const client = createClient();
      const pending = makeRequests(buildRequest(client, 'GET'), 20);
      await Promise.all(pending);

      expect(emitCount).toBe(19);
    });

    it('emits a named collasping event when making a request', async () => {
      nock(host)
        .get(path)
        .times(1)
        .reply(200, simpleResponseBody);

      const nomine = 'crazy-taff';
      let emitCount = 0;
      collapseEvents.on(`collapsed-${nomine}`, () => {
        emitCount++;
      });

      const client = createClient({ eventName: nomine });
      const pending = makeRequests(buildRequest(client, 'GET'), 20);
      await Promise.all(pending);

      expect(emitCount).toBe(19);
    });
  });
});
