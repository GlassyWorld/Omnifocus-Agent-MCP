import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTags } from '../primitives/readTags.js';
import * as searchTagsTool from './searchTags.js';

vi.mock('../primitives/readTags.js', () => ({
  readTags: vi.fn(),
}));

const mockedReadTags = vi.mocked(readTags);
const rawTags = [
  {
    id: 'root',
    name: 'Home',
    status: 'Active',
    parentId: null,
    childrenAreMutuallyExclusive: false,
  },
  {
    id: 'child',
    name: 'Desk',
    status: 'Active',
    parentId: 'root',
    childrenAreMutuallyExclusive: false,
  },
];

async function createProtocolHarness() {
  const server = new McpServer({ name: 'tag-discovery-test-server', version: '1.0.0' });
  server.registerTool(
    'search_tags',
    {
      description: 'Read-only. Search existing OmniFocus Tags; never creates a Tag.',
      inputSchema: searchTagsTool.inputSchema,
      outputSchema: searchTagsTool.outputSchema,
    },
    searchTagsTool.handler,
  );
  const client = new Client({ name: 'tag-discovery-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

describe('search_tags MCP protocol contract', () => {
  beforeEach(() => {
    mockedReadTags.mockReset();
    mockedReadTags.mockResolvedValue({ success: true, tags: rawTags });
  });

  it('publishes the strict client-visible input/output Schema with read-tool metadata convention', async () => {
    const { server, client } = await createProtocolHarness();
    try {
      const listed = await client.listTools();
      const tool = listed.tools.find(candidate => candidate.name === 'search_tags');
      expect(tool).toBeDefined();
      expect(tool?.annotations).toBeUndefined();
      expect(tool?.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 200 },
          status: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', enum: ['active', 'on_hold', 'dropped'] },
          },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      });
      expect(tool?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['success', 'tags', 'page'],
      });
      const tagSchema = (tool?.outputSchema as any).properties.tags.items;
      expect(tagSchema.additionalProperties).toBe(false);
      expect(tagSchema.properties.hierarchy.additionalProperties).toBe(false);
      expect(tagSchema.properties.exclusivity.additionalProperties).toBe(false);
      expect(tagSchema.properties.hierarchy.properties.path.items.additionalProperties).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('roundtrips structuredContent and JSON text over MCP with one snapshot read', async () => {
    const { server, client } = await createProtocolHarness();
    try {
      const result = await client.callTool({
        name: 'search_tags',
        arguments: { query: 'home', limit: 1 },
      });
      expect(mockedReadTags).toHaveBeenCalledTimes(1);
      expect(result.isError).not.toBe(true);
      const text = JSON.parse((result.content as any[])[0].text);
      expect(result.structuredContent).toEqual(text);
      expect(text.page).toEqual({ matched: 2, returned: 1, truncated: true });
      expect(text.tags[0].hierarchy.path).toEqual([
        { id: 'root', name: 'Home', status: 'active' },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('rejects unknown input fields at the protocol boundary without reading OmniFocus', async () => {
    const { server, client } = await createProtocolHarness();
    try {
      const result = await client.callTool({
        name: 'search_tags',
        arguments: { extra: true },
      });
      expect(result.isError).toBe(true);
      expect(mockedReadTags).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('structuredContent');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
