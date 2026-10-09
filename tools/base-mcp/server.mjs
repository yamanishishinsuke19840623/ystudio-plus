#!/usr/bin/env node
// BASE（thebase.in）ネットショップ用 MCP サーバー（stdio）
// 既定は読み取り専用。BASE_ALLOW_WRITE=1 のときだけ書き込みツールを公開する。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { callApi } from './base-client.mjs';

const allowWrite = process.env.BASE_ALLOW_WRITE === '1';

const server = new McpServer({ name: 'base-shop', version: '0.1.0' });

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e.message }] });
const tool = (name, description, inputSchema, run) =>
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try { return ok(await run(args)); } catch (e) { return fail(e); }
  });

// BASE API ドキュメント記載のパラメータをそのまま渡すための逃げ道
const extra = z.record(z.string(), z.union([z.string(), z.number()])).optional()
  .describe('BASE APIドキュメントにある追加クエリ（例: 並び順・期間指定など）。キーと値をそのまま送る');
const paging = {
  limit: z.number().int().min(1).max(100).optional().describe('取得件数'),
  offset: z.number().int().min(0).optional().describe('開始位置'),
  extra,
};

// ---- 読み取り ----
tool('base_get_shop', 'ショップ（ユーザー）情報を取得する。GET /1/users/me', {},
  () => callApi('GET', '/1/users/me'));

tool('base_list_items', '商品一覧を取得する。GET /1/items', paging,
  ({ limit, offset, extra }) => callApi('GET', '/1/items', { ...extra, limit, offset }));

tool('base_get_item', '商品詳細を取得する。GET /1/items/detail/:item_id',
  { item_id: z.union([z.string(), z.number()]).describe('商品ID') },
  ({ item_id }) => callApi('GET', `/1/items/detail/${encodeURIComponent(item_id)}`));

tool('base_list_orders', '注文一覧を取得する（要 read_orders）。GET /1/orders', paging,
  ({ limit, offset, extra }) => callApi('GET', '/1/orders', { ...extra, limit, offset }));

tool('base_get_order', '注文詳細を取得する（要 read_orders）。GET /1/orders/detail/:unique_key',
  { unique_key: z.string().describe('注文のユニークキー') },
  ({ unique_key }) => callApi('GET', `/1/orders/detail/${encodeURIComponent(unique_key)}`));

tool('base_list_categories', 'カテゴリ一覧を取得する。GET /1/categories', {},
  () => callApi('GET', '/1/categories'));

tool('base_get_item_categories', '商品に紐づくカテゴリを取得する。GET /1/item_categories/detail/:item_id',
  { item_id: z.union([z.string(), z.number()]).describe('商品ID') },
  ({ item_id }) => callApi('GET', `/1/item_categories/detail/${encodeURIComponent(item_id)}`));

tool('base_list_savings', '振込申請履歴を取得する（要 read_savings）。GET /1/savings', paging,
  ({ limit, offset, extra }) => callApi('GET', '/1/savings', { ...extra, limit, offset }));

// ---- 書き込み（明示的に許可した場合のみ） ----
if (allowWrite) {
  const WRITE_ENDPOINTS = [
    '/1/items/add', '/1/items/edit', '/1/items/delete', '/1/items/edit_stock',
    '/1/items/delete_variation', '/1/items/add_image', '/1/items/delete_image',
    '/1/categories/add', '/1/categories/edit', '/1/categories/delete',
    '/1/item_categories/add', '/1/item_categories/delete',
    '/1/orders/edit_status',
  ];
  tool('base_write',
    'BASEショップのデータを変更する（商品・在庫・カテゴリ・注文ステータス）。' +
    '実行前に必ずユーザーへ変更内容を見せて確認を取ること。params は BASE API ドキュメント記載のパラメータ名をそのまま使う。',
    {
      endpoint: z.enum(WRITE_ENDPOINTS).describe('POST先のエンドポイント'),
      params: z.record(z.string(), z.union([z.string(), z.number()])).describe('送信パラメータ'),
    },
    ({ endpoint, params }) => callApi('POST', endpoint, params));
}

await server.connect(new StdioServerTransport());
