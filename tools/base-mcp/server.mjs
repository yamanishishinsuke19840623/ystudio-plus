#!/usr/bin/env node
// BASE（thebase.in）ネットショップ用 MCP サーバー（stdio：Claude Desktop / Claude Code 向け）
// 既定は読み取り専用。BASE_ALLOW_WRITE=1 のときだけ書き込みツールを公開する。
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.mjs';

await createServer().connect(new StdioServerTransport());
