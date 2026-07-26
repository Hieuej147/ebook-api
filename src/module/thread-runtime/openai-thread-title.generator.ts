import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThreadTitleGenerator } from '@bookstore/thread-manager';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

@Injectable()
export class OpenAiThreadTitleGenerator implements ThreadTitleGenerator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxLength: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('THREAD_TITLE_MODEL', 'gpt-4o-mini');
    this.baseUrl = config
      .get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    this.maxLength = Math.min(
      Math.max(config.get<number>('THREAD_TITLE_MAX_LENGTH', 60), 20),
      120,
    );
  }

  async generate(input: {
    agentId: string;
    threadId: string;
    firstUserMessage: string;
  }): Promise<string> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content:
              `Create a concise conversation title in the same language as the user. ` +
              `Return only 3-8 words, no quotes, markdown, explanation, or ending punctuation. ` +
              `Keep it under ${this.maxLength} characters.`,
          },
          {
            role: 'user',
            content: input.firstUserMessage.slice(0, 4_000),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Title model request failed (${response.status})`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const title = body.choices?.[0]?.message?.content;
    if (typeof title !== 'string' || !title.trim()) {
      throw new Error('Title model returned empty content');
    }
    return title.trim().slice(0, this.maxLength).trim();
  }
}
