let http = require("http");

module.exports = function createRescriptDevserverTools(
  webpackCompilers,
  {
    rescriptWsPort = 9999,
    liveReload = true,
    liveReloadServer = http.createServer(),
  } = {}
) {
  let https = require("https");
  let { createFsFromVolume, Volume } = require("memfs");
  let volume = new Volume();
  let outputFileSystem = createFsFromVolume(volume);
  let pendingBuild = null;
  let liveReloadAppendix = null;

  async function startDev() {
    let getPort = require("get-port");
    let WebSocket = require("ws");
    let shouldRebuild = false;

    async function createWebsocketServer(port) {
      let server = new WebSocket.Server({
        server: liveReloadServer,
      });
      let openedConnections = [];
      server.on("connection", (ws) => {
        openedConnections.push(ws);
        ws.on("close", () => {
          openedConnections = openedConnections.filter((item) => item != ws);
        });
      });
      liveReloadServer.listen(port);

      return {
        send: (message) => {
          openedConnections.forEach((ws) => ws.send(message));
        },
      };
    }

    let reloadWsPort = await getPort();
    let protocol = liveReloadServer instanceof https.Server ? "wss://" : "ws://";
    liveReloadAppendix = liveReload
      ? `<script>new WebSocket("${protocol}" + window.location.hostname + ":${reloadWsPort}").onmessage = function() {location.reload(true)}</script>`
      : null;

    let isFirstRun = true;

    let reloadWs = await createWebsocketServer(reloadWsPort);

    outputFileSystem.join = path.join.bind(path);
    let compilers = Array.isArray(webpackCompilers)
      ? webpackCompilers
      : [webpackCompilers];
    function build() {
      console.log(
        chalk.white(new Date().toJSON()) +
          " " +
          chalk.blue("Webpack") +
          " start"
      );
      return (pendingBuild = Promise.all(
        compilers.map((compiler) => {
          return new Promise((resolve, reject) => {
            compiler.outputFileSystem = outputFileSystem;
            compiler.run((error, stats) => {
              if (error) {
                reject(error);
              } else {
                if (stats.hasErrors()) {
                  let errors = stats.toString("errors-warnings");
                  reject(errors);
                } else {
                  if (!isFirstRun) {
                    reloadWs.send("change");
                  }
                  isFirstRun = false;
                  resolve();
                }
              }
            });
          });
        })
      )
        .then(() => {
          if (shouldRebuild) {
            shouldRebuild = false;
            return build();
          } else {
            console.log(
              chalk.white(new Date().toJSON()) +
                " " +
                chalk.blue("Webpack") +
                " done"
            );
            pendingBuild = null;
          }
        })
        .catch((errors) => {
          console.log(
            chalk.white(new Date().toJSON()) +
              " " +
              chalk.blue("Webpack") +
              " errored"
          );
          console.error(
            "\n" +
              errors
                .split("\n")
                .filter(
                  (line) => line !== "" && !line.startsWith("webpack compiled")
                )
                .map((line) => chalk.yellow(`    ${line}`))
                .join("\n") +
              "\n"
          );
          pendingBuild = null;
        }));
    }

    process.nextTick(() => {
      build();
    });

    function listenToReScript() {
      let ws = new WebSocket(`ws://localhost:${rescriptWsPort}`);
      let LAST_SEEN_SUCCESS_BUILD_STAMP = Date.now();

      ws.on("open", () => {
        console.log(
          chalk.white(new Date().toJSON()) +
            " " +
            chalk.red("ReScript") +
            " connected"
        );
      });

      let hasErrored = false;
      ws.on("error", () => {
        hasErrored = true;
        console.log(
          chalk.white(new Date().toJSON()) +
            " " +
            chalk.red("ReScript") +
            " failed to connect, retrying in 10s"
        );
        setTimeout(listenToReScript, 10000);
      });

      ws.on("message", (data) => {
        let LAST_SUCCESS_BUILD_STAMP =
          JSON.parse(data).LAST_SUCCESS_BUILD_STAMP;
        if (LAST_SUCCESS_BUILD_STAMP > LAST_SEEN_SUCCESS_BUILD_STAMP) {
          console.log(
            chalk.white(new Date().toJSON()) +
              " " +
              chalk.red("ReScript") +
              " change"
          );
          LAST_SEEN_SUCCESS_BUILD_STAMP = LAST_SUCCESS_BUILD_STAMP;
          if (pendingBuild == null) {
            build();
          } else {
            shouldRebuild = true;
          }
        }
      });

      ws.on("close", () => {
        if (!hasErrored) {
          console.log(
            chalk.white(new Date().toJSON()) +
              " " +
              chalk.red("ReScript") +
              " disconnected, retrying in 10s"
          );
          setTimeout(listenToReScript, 10000);
        }
      });
    }

    listenToReScript();
  }

  startDev();

  // Delay requests until webpack has finished building
  let middleware = (req, res, next) => {
    if (pendingBuild != null) {
      pendingBuild.then(
        () => {
          process.nextTick(() => {
            next();
          }, 0);
        },
        () => {
          res.status(500).end("Build error");
        }
      );
    } else {
      next();
    }
  };

  return {
    middleware,
    liveReloadAppendix,
    fs: outputFileSystem,
  };
};
