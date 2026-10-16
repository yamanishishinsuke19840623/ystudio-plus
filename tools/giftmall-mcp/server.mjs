#!/usr/bin/env node
// ギフトモール MCP（stdio：Claude Desktop / Claude Code 向け）
// お客さまの情報を扱うので、リモート版は用意していない
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.mjs';

await createServer().connect(new StdioServerTransport());
