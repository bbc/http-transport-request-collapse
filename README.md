[![NPM downloads](https://img.shields.io/npm/dm/@bbc/http-transport-request-collapse.svg?style=flat)](https://npmjs.org/package/@bbc/http-transport-rate-limiter)
![npm](https://img.shields.io/npm/v/@bbc/http-transport-request-collapse.svg)
![license](https://img.shields.io/badge/license-MIT-blue.svg) 
![github-issues](https://img.shields.io/github/issues/bbc/http-transport-request-collapse.svg)
![stars](https://img.shields.io/github/stars/bbc/http-transport-request-collapse.svg)
![forks](https://img.shields.io/github/forks/bbc/http-transport-request-collapse.svg)


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
