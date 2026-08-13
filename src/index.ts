#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "neuralverge-mcp-server",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}

async function runStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NeuralVerge MCP server running on stdio");
}

/**
 * Streamable HTTP transport: required for remote MCP clients that cannot spawn a
 * local process, e.g. ChatGPT's MCP connectors (Developer Mode), which only accept
 * Streamable HTTP or SSE over a reachable HTTPS URL. Stateless: a fresh McpServer +
 * transport is created per request, per the SDK's stateless-server pattern.
 */
async function runHttp() {
  const port = Number(process.env.MCP_HTTP_PORT ?? 8787);
  const path = process.env.MCP_HTTP_PATH ?? "/mcp";
  const authToken = process.env.MCP_HTTP_AUTH_TOKEN;

  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }

    if (req.url !== path) {
      res.writeHead(404, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Not found" }),
      );
      return;
    }

    if (authToken && req.headers.authorization !== `Bearer ${authToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Unauthorized" }),
      );
      return;
    }

    try {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("Error handling MCP HTTP request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(
          JSON.stringify({ error: "Internal server error" }),
        );
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  console.error(
    `NeuralVerge MCP server running on Streamable HTTP at http://localhost:${port}${path}` +
      (authToken ? " (bearer auth enabled)" : " (no auth — do not expose publicly as-is)"),
  );
}

async function main() {
  const transportMode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
  if (transportMode === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error("Fatal error starting NeuralVerge MCP server:", err);
  process.exit(1);
});
