# rescript-devserver-tools

> A tool to orchestrate ReScript & Webpack in a dev server

## Installation

```console
$ yarn add rescript-devserver-tools
```

## Goals

In development mode, we tend to use the _watch_ mode for both ReScript & webpack. Whenever ReScript writes a lot of files, it triggers way too much webpack builds.

This project aims to fix that with a simple model: listen to ReScript, and only build the webpack bundle after a compilation is finished.

## Usage

Your ReScript watcher needs to emit messages, that's achievable using the `-ws` flag (note that you can customize the port, we use `9999` by default by convention). 

```console
$ rescript build -with-deps -w -ws 9999
```

Then, in your dev server:

```js
let createRescriptDevserverTools = require("rescript-devserver-tools");
let fs = require("fs");
let express = require("express")

let app = express()

let {
  middleware,
  getLiveReloadAppendix,
  virtualFs,
} = createRescriptDevserverTools(webpack(config), {
  rescriptWsPort: 9999, // this is the default
  liveReload: true, // your can create a switch with `process.argv.includes("--livereload")`
  liveReloadServer: http.createServer(), // needed if you need secured websockets
});
```

Add the middleware, this will **delay the server requests when a build is running**:

```js
app.use(middleware);
```

Then, you can replace `fs` in your scope by `virtualFs`, this will read from the in-memory build system:

```js
fs = virtualFs;
```

Finally, you can append `getLiveReloadAppendix()` to your HTML entry points:

```js
app.get(`${publicPath}*`, (req, res) => {
  res.set("Cache-control", `public, max-age=0`);
  let appendix = getLiveReloadAppendix();
  res.send(appendix ? entryPoint + appendix : entryPoint)
});
```