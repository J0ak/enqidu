import { ENQIDU_TOOLS_VERSION, listEnqiduTools } from "../src/enqiduTools/registry.js";

process.stdout.write(`${JSON.stringify({ version: ENQIDU_TOOLS_VERSION, tools: listEnqiduTools() }, null, 2)}\n`);
