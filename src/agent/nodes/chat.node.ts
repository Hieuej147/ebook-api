import { RunnableConfig } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { AgentState } from 'src/agent/state/index.js';
import { convertActionsToDynamicStructuredTools } from '@copilotkit/sdk-js/langgraph';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { configs } from '../config/config.js';
import { tools } from '../tools';

// 5. Define the chat node, which will handle the chat logic
export async function chat_node(state: AgentState, config: RunnableConfig) {
  const authToken = config.configurable?.copilotkit_auth;
  if (authToken) {
    // 2. Logic xác thực user (ví dụ: gọi API khác hoặc giải mã JWT)
    console.log('Token nhận được trong Agent JS:', authToken);
  }
  // 5.1 Define the model, lower temperature for deterministic responses
  const model = new ChatOpenAI({
    temperature: configs.temperature,
    model: configs.modelName,
    apiKey: configs.apiKey,
  });

  // 5.2 Bind the tools to the model, include CopilotKit actions. This allows
  //     the model to call tools that are defined in CopilotKit by the frontend.
  const modelWithTools = model.bindTools!([
    ...convertActionsToDynamicStructuredTools(state.copilotkit?.actions ?? []),
    ...tools,
  ]);

  // 5.3 Define the system message, which will be used to guide the model, in this case
  //     we also add in the language to use from the state.
  const systemMessage = new SystemMessage({
    content: `You are a helpful assistant. The current proverbs are ${JSON.stringify(state.proverbs)}.`,
  });

  // 5.4 Invoke the model with the system message and the messages in the state
  const response = await modelWithTools.invoke(
    [systemMessage, ...state.messages],
    config,
  );

  // 5.5 Return the response, which will be added to the state
  return {
    messages: response,
  };
}
// 6. Define the function that determines whether to continue or not,
//    this is used to determine the next node to run
export function shouldContinue({ messages, copilotkit }: AgentState) {
  // 6.1 Get the last message from the state
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // 7.2 If the LLM makes a tool call, then we route to the "tools" node
  if (lastMessage.tool_calls?.length) {
    // Actions are the frontend tools coming from CopilotKit
    const actions = copilotkit?.actions;
    const toolCallName = lastMessage.tool_calls![0].name;

    // 7.3 Only route to the tool node if the tool call is not a CopilotKit action
    if (!actions || actions.every((action) => action.name !== toolCallName)) {
      return 'tool_node';
    }
  }

  // 6.4 Otherwise, we stop (reply to the user) using the special "__end__" node
  return '__end__';
}
