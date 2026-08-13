#!/usr/bin/env node
/**
 * lao MCP server — export .lao projects to SVG / React and describe capabilities.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const headlessPath = resolve(
  import.meta.dirname,
  "../../src/export/code/headless.ts",
);
const { exportProjectCode, describeProject } = await import(
  pathToFileURL(headlessPath).href
);

function loadProject(path: string) {
  const raw = readFileSync(resolve(path), "utf8");
  return JSON.parse(raw);
}

const server = new Server(
  { name: "lao-mcp", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lao_export_svg",
      description: "Export a .lao project file to animated SVG source code.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to .lao file" },
          transparent: { type: "boolean" },
          frame: { type: "number", description: "Static frame index (omit for animated)" },
          baseUrl: { type: "string", description: "Dev server for browser fallback" },
        },
        required: ["path"],
      },
    },
    {
      name: "lao_export_react",
      description: "Export a .lao project file to a React TSX component wrapper.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          transparent: { type: "boolean" },
          frame: { type: "number" },
          baseUrl: { type: "string" },
        },
        required: ["path"],
      },
    },
    {
      name: "lao_describe_project",
      description: "List vector/raster export warnings for a .lao project.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const path = typeof args?.path === "string" ? args.path : "";
  const transparent = Boolean(args?.transparent);
  const frame = typeof args?.frame === "number" ? args.frame : undefined;
  const baseUrl =
    typeof args?.baseUrl === "string" ? args.baseUrl : "http://127.0.0.1:5173";

  try {
    const project = loadProject(path);

    if (name === "lao_describe_project") {
      const caps = describeProject(project);
      const payload = {
        warnings: caps.warnings,
        strokeModes: Object.fromEntries(caps.strokeModes),
        needsRasterFallback: caps.needsRasterFallback,
        needsTextLayout: caps.needsTextLayout,
        needsPlaywright: caps.needsPlaywright,
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }

    if (name === "lao_export_svg" || name === "lao_export_react") {
      const format = name === "lao_export_react" ? "tsx" : "svg";
      const code = await exportProjectCode(project, {
        format,
        transparent,
        frame,
        animated: frame === undefined,
        baseUrl,
      });
      return {
        content: [{ type: "text", text: code }],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
