import { z } from 'zod';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool } from '@langchain/core/tools';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import {
  MemorySaver,
  START,
  StateGraph,
  Annotation,
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama';
import {
  convertActionsToDynamicStructuredTools,
  CopilotKitStateAnnotation,
} from '@copilotkit/sdk-js/langgraph';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path if needed

// 1. Define our agent state
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec,
  tools: Annotation<any[]>, // ag-ui tools will be added here
});

export type AgentState = typeof AgentStateAnnotation.State;

// 2. Factory function to create the agent (we need this to inject PrismaService)
export function createEbookAgent(prisma?: PrismaService) {
  // Khởi tạo Ollama cho việc tạo vector từ câu hỏi
  const embeddings = new OllamaEmbeddings({
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
  });

  // 3. Define the book search tool
  const searchBooksTool = tool(
    async (args) => {
      try {
        console.log(
          `[TOOL CALL] AI đang tìm kiếm với từ khóa: "${args.query}"`,
        );

        // Tạo vector từ câu hỏi
        const queryVector = await embeddings.embedQuery(args.query);
        const vectorString = `[${queryVector.join(',')}]`;
        const limit = args.limit || 4;

        // Query bằng pgvector (Cosine Distance <=> )
        const books = await prisma?.$queryRawUnsafe<any[]>(
          `
          SELECT id, title, author, price, description, "imageUrl"
          FROM books 
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector 
          LIMIT $2
          `,
          vectorString,
          limit,
        );

        // 👉 THÊM ĐOẠN LOG NÀY ĐỂ CHECK KẾT QUẢ TỪ DB
        console.log(`[DB RESULT] Tìm thấy ${books?.length || 0} cuốn sách.`);
        if (books && books.length > 0) {
          console.log(
            `[DB RESULT] Tên các sách:`,
            books.map((b) => b.title),
          );
        }

        if (!books || books.length === 0) {
          return JSON.stringify({
            message: 'Không tìm thấy cuốn sách nào phù hợp.',
          });
        }

        // Ép kiểu Decimal của Prisma về số để JSON.stringify không bị lỗi
        const formattedBooks = books.map((book) => ({
          ...book,
          price: Number(book.price),
        }));

        return JSON.stringify(formattedBooks);
      } catch (error) {
        console.error('Lỗi trong tool searchBooksTool:', error);
        return JSON.stringify({ error: 'Hệ thống tìm kiếm tạm thời gặp lỗi.' });
      }
    },
    {
      name: 'search_books',
      description:
        'Sử dụng công cụ này để tìm kiếm sách trong database dựa trên tiêu đề, tác giả, mô tả hoặc nhu cầu của khách hàng. Luôn ưu tiên dùng công cụ này khi khách hỏi về sách.',
      schema: z.object({
        query: z
          .string()
          .describe(
            "Chuỗi văn bản mô tả cuốn sách cần tìm (vd: 'sách học lập trình web', 'tiểu thuyết lãng mạn')",
          ),
        limit: z
          .number()
          .optional()
          .describe('Số lượng sách tối đa cần lấy, mặc định là 4'),
      }),
    },
  );

  const tools = [searchBooksTool];

  // 4. Define the chat node
  async function chat_node(state: AgentState, config: RunnableConfig) {
    const model = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: 'ministral-3:3b', // Tên model bạn vừa pull về
      temperature: 0.2, // Giữ ở mức thấp để nó gọi tool chính xác
    });

    // Bind both Backend Tools (search) and Frontend Tools (CopilotKit Actions)
    const modelWithTools = model.bindTools!([
      ...convertActionsToDynamicStructuredTools(state.tools || []),
      ...tools,
    ]);

    const systemMessage = new SystemMessage({
      content: `Bạn là chuyên gia tư vấn sách của hệ thống API-EBook.

NHIỆM VỤ CỦA BẠN:
1. Luôn sử dụng công cụ 'search_books' để lấy dữ liệu thực tế từ Database.
2. Khi giới thiệu bất kỳ cuốn sách nào, bạn BẮT BUỘC phải tạo một đường link Markdown để người dùng click vào xem chi tiết trên website.

QUY TẮC QUAN TRỌNG VỀ ĐƯỜNG DẪN:
  - Khi tạo link cho sách, bạn CHỈ ĐƯỢC PHÉP sử dụng đường dẫn tương đối, bắt đầu bằng dấu gạch chéo.
  - CẤM TUYỆT ĐỐI thêm tên miền (domain) như http://localhost hay https://api.e-book.com vào link.
  - Định dạng chuẩn: [Tên Sách](/books/id-cua-sach)
  
  Ví dụ đúng: [PT 109](/books/f08cd324-a6b8-47be-893b-a349aeeb9479)
  Ví dụ sai: [PT 109](https://api.e-book.com/books/f08cd324-a6b8-47be-893b-a349aeeb9479)
  
  Nếu bạn vi phạm quy tắc này, hệ thống của người dùng sẽ không thể chuyển trang.`,
    });

    const response = await modelWithTools.invoke(
      [systemMessage, ...state.messages],
      config,
    );

    return {
      messages: response,
    };
  }

  // 5. Routing logic
  function shouldContinue({ messages, tools: stateTools }: AgentState) {
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (lastMessage.tool_calls?.length) {
      const toolCallName = lastMessage.tool_calls[0].name;

      // Route to tool_node ONLY if it's our backend tool (search_books)
      if (
        !stateTools ||
        stateTools.every((tool) => tool.name !== toolCallName)
      ) {
        return 'tool_node';
      }
    }

    return '__end__';
  }

  // 6. Build Graph
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('chat_node', chat_node)
    .addNode('tool_node', new ToolNode(tools))
    .addEdge(START, 'chat_node')
    .addEdge('tool_node', 'chat_node')
    .addConditionalEdges('chat_node', shouldContinue as any);

  const memory = new MemorySaver();

  return workflow.compile({ checkpointer: memory });
}
