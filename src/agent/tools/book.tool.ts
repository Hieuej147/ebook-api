import { tool } from "@langchain/core/tools";
import z from "zod";

// agent/src/tools/book-store.tool.ts
export const searchBooksTool = tool(async ({ query }) => {
  // Gọi sang NestJS API để lấy dữ liệu
  const res = await fetch(`${process.env.NESTJS_URL}/books?q=${query}`);
  return res.json();
}, {
  name: "searchBooks",
  description: "Tìm kiếm sách trong kho lưu trữ của hệ thống",
  schema: z.object({ query: z.string() })
});