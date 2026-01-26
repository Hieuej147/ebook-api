import { tool } from '@langchain/core/tools';
import z from 'zod';
import { DynamicTool } from '@langchain/core/tools';
import { RunnableConfig } from '@langchain/core/runnables';

// 3. Define a simple tool to get the weather statically
export const getWeather = tool(
  (args) => {
    return `The weather for ${args.location} is 70 degrees, clear skies, 45% humidity, 5 mph wind, and feels like 72 degrees.`;
  },
  {
    name: 'getWeather',
    description: 'Get the weather for a given location.',
    schema: z.object({
      location: z.string().describe('The location to get weather for'),
    }),
  },
);
// agent/src/tools/book-store.tool.ts
export const getBookDetailTool = tool(
  // Đổi tên cho rõ nghĩa
  async ({ id }: { id: string }) => {
    try {
      console.log('Đang gọi API cho ID:', id);
      const res = await fetch(`http://localhost:3000/books/${id}`);

      if (!res.ok) {
        return { error: `Không tìm thấy sách với ID: ${id}` };
      }

      const data = await res.json();
      return data;
    } catch (error) {
      return { error: 'Lỗi kết nối đến server backend' };
    }
  },
  {
    name: 'getBookDetail', // Tên rõ ràng: Lấy chi tiết sách
    description:
      'Dùng tool này khi người dùng cung cấp một mã định danh (ID) cụ thể của sách để lấy thông tin chi tiết.',
    schema: z.object({
      id: z.string().describe('Mã UUID của cuốn sách'),
    }),
  },
);
