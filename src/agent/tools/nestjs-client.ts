import { tool } from '@langchain/core/tools';
import z from 'zod';

export const getSystemDataTool = tool(
  async ({ userId }) => {
    const baseUrl = process.env.NESTJS_INTERNAL_URL;
    const apiKey = process.env.INTERNAL_API_KEY;

    const response = await fetch(`${baseUrl}/internal/user-info/${userId}`, {
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'x-internal-api-key': apiKey,
    //   },
    });

    if (!response.ok) {
      return 'Không thể lấy dữ liệu từ hệ thống chính.';
    }

    return await response.json();
  },
  {
    name: 'getSystemData',
    description: 'Lấy thông tin chi tiết của người dùng từ hệ thống chính.',
    schema: z.object({ userId: z.string() }),
  },
);
