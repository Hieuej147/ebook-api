import { MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { chat_node, shouldContinue } from 'src/agent/nodes/chat.node.js';
import { AgentStateAnnotation } from 'src/agent/state/index.js';
import { tools } from './tools';


// Define the workflow graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode('chat_node', chat_node)
  .addNode('tool_node', new ToolNode(tools))
  .addEdge(START, 'chat_node')
  .addEdge('tool_node', 'chat_node')
  .addConditionalEdges('chat_node', shouldContinue as any);

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});
