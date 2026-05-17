import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SnakeRoom } from "./rooms/SnakeRoom.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 2567);
const appId = process.env.DSTACK_APP_ID ?? null;
const gatewayDomain = process.env.DSTACK_GATEWAY_DOMAIN ?? null;
const appDomain = process.env.DSTACK_APP_DOMAIN ?? null;
const publicHttpUrl = resolvePublicHttpUrl(port);
const publicWsUrl = resolvePublicWsUrl(port);

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
        appId,
        gatewayDomain,
        appDomain,
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

function resolvePublicHttpUrl(port: number): string | null {
  if (process.env.PUBLIC_HTTP_URL) {
    return process.env.PUBLIC_HTTP_URL;
  }

  if (!appId || !gatewayDomain) {
    return null;
  }

  if (port === 80) {
    return `https://${appDomain ?? `${appId}.${gatewayDomain}`}`;
  }

  return `https://${appId}-${port}.${gatewayDomain}`;
}

function resolvePublicWsUrl(port: number): string | null {
  if (process.env.PUBLIC_WS_URL) {
    return process.env.PUBLIC_WS_URL;
  }

  if (!appId || !gatewayDomain) {
    return null;
  }

  if (port === 80) {
    return `wss://${appDomain ?? `${appId}.${gatewayDomain}`}`;
  }

  return `wss://${appId}-${port}.${gatewayDomain}`;
}
