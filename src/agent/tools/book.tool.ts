import { tool } from '@langchain/core/tools';
import z from 'zod';

// agent/src/tools/book-store.tool.ts
export const searchBooksTool = tool(
  async ({ query }: { query: string }) => {
    // Gọi sang NestJS API để lấy dữ liệu
    const res = await fetch(`http://localhost:3000/books/${query}`);
    return res.json();
  },
  {
    name: 'searchBooks',
    description:
      'Tìm kiếm sách trong kho lưu trữ của hệ thống voi id nguoi dung caung cap',
    schema: z.object({ query: z.string() }),
  },
);
