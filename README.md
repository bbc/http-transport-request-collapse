# HTTP Transport Request Collapse

Merges duplicate requests into a single request

## Installation

```
npm install --save http-transport-request-collapse
```

## Usage

```js
const HttpTransport = require('@bbc/http-transport');
const collapse = require('http-transport-request-collapse').middleware;

const client = HttpTransport
  .createBuilder()
  .use(collapse())
  .createClient();
```

## Test

```
npm test
```