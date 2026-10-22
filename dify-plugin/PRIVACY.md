## Privacy Policy

This plugin connects Dify to the NeuralVerge MCP server (`https://api.neuralverge.ai/functions/v1/mcp-server`) operated by NeuralVerge.

### Data Collection

- **API key.** The plugin requires your NeuralVerge API key. Dify stores it as an encrypted credential. The plugin sends it only to the NeuralVerge MCP server in the `Authorization` header and does not store it anywhere else.
- **Tool inputs.** The arguments that a Dify app or agent passes to a tool (for example search queries, URLs to extract, company names or identifiers) are sent to the NeuralVerge MCP server to run the request.
- The plugin itself does not collect analytics, does not log user content and does not contact any other service.

### Data Usage

Tool inputs are used only to produce the requested result. NeuralVerge processes them according to its own terms and privacy policy: https://neuralverge.ai. Results are returned to Dify and are not stored by the plugin. If you set a custom MCP server URL in the plugin settings, your API key and tool inputs go to that server instead.

### Data Retention

The plugin retains no data. Retention of request data on the NeuralVerge side is governed by the NeuralVerge privacy policy. You can revoke the API key at any time in the NeuralVerge dashboard.

### Contact

Questions about privacy: https://github.com/neuralverge/neuralverge-mcp-server/issues or via https://neuralverge.ai.
