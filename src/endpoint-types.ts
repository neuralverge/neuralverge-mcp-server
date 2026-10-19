export interface JsonSchema {
  type?: string;
  description?: string;
  format?: string;
  enum?: Array<string | number>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

export interface EndpointDef {
  /** MCP tool name, e.g. run_amazon_product_search */
  name: string;
  method: "GET" | "POST";
  path: string;
  /** API category (OpenAPI tag), e.g. "Company Registries". */
  tag: string;
  description: string;
  /** Request body schema (POST) or query-parameter schema (GET). */
  schema: JsonSchema;
}
