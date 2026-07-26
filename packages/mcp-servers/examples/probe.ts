/** Confirm the MCP round-trip works over the in-memory transport. */
import { connectGlobexMcp, mcpCallJson } from "../src/index";

const client = await connectGlobexMcp();

const tools = await client.listTools();
console.log("MCP tools:", tools.tools.map((t) => t.name).join(", "));

const result = await mcpCallJson(client, "lookup_line", { subscriber: "Globex Marketing" });
console.log("lookup_line ->", JSON.stringify(result));

await client.close();
