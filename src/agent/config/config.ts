// agent/src/config.ts
export const configs = {
  modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0,
  nestjsUrl: process.env.NESTJS_INTERNAL_URL || 'http://localhost:3000',
  apiKey: process.env.OPENAI_API_KEY,
};

