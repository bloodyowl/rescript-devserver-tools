# rescript-devserver-tools

> A tool to orchestrate ReScript & Webpack in a dev server

⚠️ Experimental, documentation is not ready yet

## Installation

```console
$ yarn add rescript-devserver-tools
```

## Usage

```js
let createRescriptDevserverTools = require("rescript-devserver-tools");

let {
  middleware,
  liveReloadAppendix,
  fs,
} = createRescriptDevserverTools(webpack(config), {
  // rescriptWsPort: 9999,
  // liveReload: true,
  // liveReloadServer: http.createServer(),
})
```