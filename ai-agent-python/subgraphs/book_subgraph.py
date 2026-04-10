"""
Book Writing Subgraph
Handles: outline, chapter writing, editing, research
"""
from typing import cast
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

from state import AgentState
from config import get_model
from tools.tavily_search import tavily_search, search_node
from tools.tavily_extract import tavily_extract, extract_node
from tools.get_state import view_chapter_details, view_chapter_node
from tools.book_tool import BOOK_TOOLS, BOOK_NODES, BOOK_ROUTING
from util import should_route_to_tool_node
from copilotkit.langchain import copilotkit_customize_config

BOOK_ROUTING_FULL = {
    "tavily_search": "search_node",
    "tavily_extract": "extract_node",
    "view_chapter_details": "view_chapter_node",
    **BOOK_ROUTING,
}

BOOK_AGENT_TOOLS = [
    tavily_search,
    tavily_extract,
    view_chapter_details,
    *BOOK_TOOLS,
]


def build_book_prompt(state: AgentState) -> str:
    sources = state.get("sources", {})
    sources_text = ""

    if sources:
        sources_text = "\n--- EXTRACTED DATA (IN MEMORY) ---\n"
        for url, data in sources.items():
            content = data.get("raw_content", data.get("content", "No content available."))
            truncated = content[:3000] + ("..." if len(content) > 3000 else "")
            sources_text += f"\nSource: {url}\nContent: {truncated}\n"

    return f"""You are an expert book writing and research assistant.

--- BOOK WRITING TOOLS ---
- `tavily_search`: Search the internet for information to support writing.
- `tavily_extract`: Extract detailed content from a specific URL.
- `view_chapter_details`: View chapter list or current chapter content.
- `update_book_outline`: Create a completely new book outline.
- `edit_book_outline`: Add/Edit/Delete chapters in an existing outline.
  IMPORTANT: When adding a new chapter, use action 'add' and LEAVE chapterNumber EMPTY.
- `write_chapter_content`: Write detailed content for a chapter. Requires sources before calling.
- `edit_chapter_content`: Replace a specific paragraph in a chapter. Must match the old text exactly.

GENERAL PRINCIPLES:
- If data already exists in "EXTRACTED DATA", reuse it instead of searching again.
- Always read chapter content before editing it.
{sources_text}
"""


async def book_agent_node(state: AgentState, config: RunnableConfig):
    frontend_tools = state.get("copilotkit", {}).get("actions", [])
    all_tools = BOOK_AGENT_TOOLS + frontend_tools

    model = get_model(state)
    hidden_config = copilotkit_customize_config(
        config,
        emit_messages=False, 
    )
    ainvoke_kwargs = {}
    if model.__class__.__name__ in ["ChatOpenAI"]:
        ainvoke_kwargs["parallel_tool_calls"] = False

    response = await model.bind_tools(all_tools, **ainvoke_kwargs).ainvoke(
        [
            SystemMessage(content=build_book_prompt(state)),
            *state["messages"],
        ],
        hidden_config,
    )

    ai_message = cast(AIMessage, response)
    goto = END

    if ai_message.tool_calls:
        if should_route_to_tool_node(ai_message.tool_calls, frontend_tools):
            tool_name = ai_message.tool_calls[0]["name"]
            goto = BOOK_ROUTING_FULL.get(tool_name, END)

    return Command(goto=goto, update={"messages": [response]})


def build_book_subgraph():
    graph = StateGraph(AgentState)

    # Main agent node
    graph.add_node("book_agent_node", book_agent_node)

    # Tool nodes
    graph.add_node("search_node", search_node)
    graph.add_node("extract_node", extract_node)
    graph.add_node("view_chapter_node", view_chapter_node)

    for name, node in BOOK_NODES.items():
        graph.add_node(name, node)
        graph.add_edge(name, "book_agent_node")

    # Entry
    graph.set_entry_point("book_agent_node")

    # Tool edges back to agent
    graph.add_edge("search_node", "book_agent_node")
    graph.add_edge("extract_node", "book_agent_node")
    graph.add_edge("view_chapter_node", "book_agent_node")

    return graph


book_subgraph = build_book_subgraph().compile()