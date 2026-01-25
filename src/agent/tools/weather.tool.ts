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
export const getBooksTool = tool(
  async (id, config: RunnableConfig) => {
    // 1. Trích xuất token đã được forward
    const token = config.configurable?.copilotkit_auth;

    if (!token) return 'Lỗi: Không tìm thấy quyền truy cập.';

    // 2. Gọi API NestJS với Token này
    const response = await fetch(`http://localhost:3000/books/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401)
      return 'Lỗi: Bạn không có quyền xem danh sách sách.';

    return await response.text();
  },
  {
    name: 'get_books',
    description: 'Lấy danh sách sách từ hệ thống NestJS.',
    schema: z.object({
      id: z.string().describe('ID cua sach can lay'),
    }),
  },
);
