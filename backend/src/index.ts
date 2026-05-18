import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SnakeRoom } from "./rooms/SnakeRoom.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 2567);
const publicHttpUrl = resolvePublicHttpUrl();
const publicWsUrl = resolvePublicWsUrl();

const httpServer = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        room: "snake",
        publicHttpUrl,
        publicWsUrl
      })
    );
    return;
  }

  if (request.url === "/" || request.url === "/metadata") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
        JSON.stringify({
          room: "snake",
          host,
          port,
          publicHttpUrl,
          publicWsUrl
        })
    );
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("Not found");
});
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer })
});

gameServer.define("snake", SnakeRoom).filterBy(["matchId"]);

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[kudoku] Port ${port} is already in use. Stop the existing server or set PORT to another value.`);
    process.exit(1);
  }

  console.error("[kudoku] Failed to start server.", error);
  process.exit(1);
});

httpServer.listen(port, host, () => {
  console.log(`[kudoku] Colyseus server listening on ${host}:${port}`);

  if (publicHttpUrl) {
    console.log(`[kudoku] Public HTTP endpoint ${publicHttpUrl}`);
  }

  if (publicWsUrl) {
    console.log(`[kudoku] Public WebSocket endpoint ${publicWsUrl}`);
  }
});

function resolvePublicHttpUrl(): string | null {
  return process.env.PUBLIC_HTTP_URL ?? null;
}

function resolvePublicWsUrl(): string | null {
  return process.env.PUBLIC_WS_URL ?? null;
}
