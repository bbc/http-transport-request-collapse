# HTTP Transport Request Collapse

Merges duplicate requests into a single request

## Installation

```
npm install --save http-transport-request-collapse
```

## Usage

```js
const url = 'http://example.com/';
const HttpTransport = require('@bbc/http-transport');
const collapse = require('http-transport-request-collapse');

HttpTransport.createClient(collapse(HttpTransport.defaultTransport))
      .get(url)
      .asBody()
      .then((body) => {
        console.log(body);
      });
```

## Test

```
npm test
```

To generate a test coverage report:

```
npm run coverage
```
