# HTTP Transport Request Collapse

Merges duplicate requests into a single request

## Installation

```
npm install --save @bbc/http-transport-request-collapse
```

## Usage

```js
const HttpTransport = require('@bbc/http-transport');
const collapse = require('@bbc/http-transport-request-collapse').middleware;

const client = HttpTransport
  .createBuilder()
  .use(collapse())
  .createClient();
```

## Key generation
⚠️ 🔥 Requests are de-dupded by creating a cache key from the request. Currently, this is **only based on the url** 🔥 ⚠️

## Test

```
npm test
```
