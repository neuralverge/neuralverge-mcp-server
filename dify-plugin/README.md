## NeuralVerge

**Author:** neuralverge
**Version:** 0.0.1
**Type:** tool

### Description

NeuralVerge is the data layer for agentic AI: structured, cited facts about the real world from one API. This plugin connects Dify apps and agents to the NeuralVerge hosted MCP server, which exposes Search, AI Extract and 300+ data sources (e-commerce marketplaces, corporate registries, company intelligence, enrichment, social) as tools.

### Setup

1. Sign up at [app.neuralverge.ai](https://app.neuralverge.ai) and pick a plan.
2. In the dashboard open **Settings, API** and create an API key.
3. In Dify, open the NeuralVerge plugin, choose **Authorize** and paste the key. Leave **MCP server URL** at its default unless you self-host the server.

### Tools

The server exposes 342 tools, so the plugin gives your agent three tools that reach all of them:

| Tool | What it does |
|---|---|
| `list_tools` | Lists NeuralVerge tools, optionally filtered by keyword (for example `amazon`, `registry`, `linkedin`). Free. |
| `describe_tool` | Returns the description and JSON input schema of one tool. Free. |
| `call_tool` | Runs a tool by name with JSON arguments, for example `run_search` or `run_extract`. Spends plan points. |

### Usage

Typical agent flow: `list_tools` with a keyword, `describe_tool` for the chosen tool, then `call_tool` with arguments that match its schema. For example, `call_tool` with `tool_name` = `run_search` and `arguments` = `{"query": "Skoda Auto registered address", "settings": {"max_results": 5}}`.

### Links

- Source and self-hosting: https://github.com/neuralverge/neuralverge-mcp-server
- MCP server docs: https://docs.neuralverge.ai/mcp-server
