// agent/src/agent.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool } from '@langchain/core/tools';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { MemorySaver, START, StateGraph, Annotation } from '@langchain/langgraph';
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama';
import {
  convertActionsToDynamicStructuredTools,
  CopilotKitStateAnnotation,
} from '@copilotkit/sdk-js/langgraph';
import pg from 'pg';

// 1. Kết nối DB trực tiếp bằng pg
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Agent state
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec,
  tools: Annotation<any[]>,
});

export type AgentState = typeof AgentStateAnnotation.State;

// 3. Embeddings
const embeddings = new OllamaEmbeddings({
  model: 'nomic-embed-text',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
});

// 4. Tool tìm kiếm sách
const searchBooksTool = tool(
  async (args) => {
    try {
      console.log(`[TOOL CALL] Tìm kiếm: "${args.query}"`);

      const queryVector = await embeddings.embedQuery(args.query);
      const vectorString = `[${queryVector.join(',')}]`;
      const limit = args.limit || 4;

      const result = await pool.query(
        `SELECT id, title, author, price::float, description, "imageUrl"
         FROM books
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vectorString, limit],
      );

      const books = result.rows;

      console.log(`[DB RESULT] Tìm thấy ${books.length} cuốn sách.`);
      if (books.length > 0) {
        console.log(`[DB RESULT] Tên sách:`, books.map((b: any) => b.title));
      }

      if (!books.length) {
        return JSON.stringify({ message: 'Không tìm thấy cuốn sách nào phù hợp.' });
      }

      return JSON.stringify(books);
    } catch (error) {
      console.error('Lỗi searchBooksTool:', error);
      return JSON.stringify({ error: 'Hệ thống tìm kiếm tạm thời gặp lỗi.' });
    }
  },
  {
    name: 'search_books',
    description:
      'Tìm kiếm sách trong database dựa trên tiêu đề, tác giả, mô tả hoặc nhu cầu của khách hàng. Luôn ưu tiên dùng công cụ này khi khách hỏi về sách.',
    schema: z.object({
      query: z.string().describe("Từ khóa tìm kiếm (vd: 'sách lập trình web', 'tiểu thuyết lãng mạn')"),
      limit: z.number().optional().describe('Số sách tối đa, mặc định 4'),
    }),
  },
);

const tools = [searchBooksTool];

// 5. Chat node
async function chat_node(state: AgentState, config: RunnableConfig) {
  const model = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'ministral-3:3b',
    temperature: 0.2,
  });

  const modelWithTools = model.bindTools!([
    ...convertActionsToDynamicStructuredTools(state.tools || []),
    ...tools,
  ]);

  const systemMessage = new SystemMessage({
    content: `Bạn là chuyên gia tư vấn sách của BookStore.

NHIỆM VỤ:
1. Luôn dùng tool 'search_books' để lấy dữ liệu thực từ Database.
2. Khi giới thiệu sách, BẮT BUỘC tạo link Markdown để user xem chi tiết.

QUY TẮC ĐƯỜNG DẪN:
- CHỈ dùng đường dẫn tương đối, bắt đầu bằng /
- TUYỆT ĐỐI KHÔNG thêm domain (http://localhost, https://...)
- Định dạng: [Tên Sách](/books/id-sach)

Ví dụ đúng: [PT 109](/books/f08cd324-a6b8-47be-893b-a349aeeb9479)
Ví dụ sai: [PT 109](http://localhost:4200/books/f08cd324-a6b8-47be-893b-a349aeeb9479)`,
  });

  const response = await modelWithTools.invoke(
    [systemMessage, ...state.messages],
    config,
  );

  return { messages: response };
}

// 6. Routing
function shouldContinue({ messages, tools: stateTools }: AgentState) {
  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls?.length) {
    const toolCallName = lastMessage.tool_calls[0].name;
    if (!stateTools || stateTools.every((t) => t.name !== toolCallName)) {
      return 'tool_node';
    }
  }

  return '__end__';
}

// 7. Build graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode('chat_node', chat_node)
  .addNode('tool_node', new ToolNode(tools))
  .addEdge(START, 'chat_node')
  .addEdge('tool_node', 'chat_node')
  .addConditionalEdges('chat_node', shouldContinue as any);

export const graph = workflow.compile({ checkpointer: new MemorySaver() });