import asyncio
import os
import json
from datetime import datetime
from dotenv import load_dotenv
from copilotkit.langchain import copilotkit_emit_state, copilotkit_customize_config
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from tavily import TavilyClient
from typing import List, Dict, Optional, cast, Any
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import AIMessage, ToolMessage, SystemMessage
from config import get_model
from state import AgentState 

load_dotenv('.env')

# Sử dụng TavilyClient đồng bộ (sync) thay vì AsyncTavilyClient
tavily_api_key = os.getenv("TAVILY_API_KEY")
tavily_client = TavilyClient(api_key=tavily_api_key)

class TavilyQuery(BaseModel):
    query: str = Field(description="Detailed web search query to gather information.")
    topic: str = Field(description="Type of search, MUST be 'general' or 'news'")
    search_depth: str = Field(description="Type of search depth, MUST be 'advanced', 'basic', 'fast' or 'ultra-fast'.")
    domains: Optional[List[str]] = Field(default=None, description="Optional list of trusted domains.")

class TavilySearchInput(BaseModel):
    sub_queries: List[TavilyQuery] = Field(
        description="Independent research queries needed to collect all necessary information for writing the book."
    )

@tool("tavily_search")
def tavily_search(sub_queries: List[TavilyQuery]):  # pylint: disable=invalid-name,unused-argument
    """
    Search the web for multiple queries in parallel to gather information for book writing.
    """

class SourceInput(BaseModel):
    """A relevant source extracted from search results."""
    url: str = Field(description="The URL of the source")
    title: str = Field(description="The title of the source")
    content: str = Field(description="A concise summary or relevant snippet extracted from the search result to answer the research query")

@tool
def ExtractSources(sources: List[SourceInput]):  # pylint: disable=invalid-name,unused-argument
    """Extract the most relevant sources and their information from raw search results."""


# Wrapper bất đồng bộ (Async wrapper) chạy client sync trên thread pool
async def async_tavily_search(item: dict) -> List[Dict[str, Any]]:
    """Asynchronous wrapper for Tavily search API."""
    loop = asyncio.get_event_loop()
    topic = item.get("topic", "general") if item.get("topic") in ['general','news'] else 'general'
    search_depth = item.get("search_depth", "basic") if item.get("search_depth") in ['advanced', 'basic', 'fast', 'ultra-fast'] else 'basic'
    domains = item.get("domains")
    
    try:
        # Chạy tavily_client.search (sync) trong thread pool
        tavily_response = await loop.run_in_executor(
            None,
            lambda: tavily_client.search(
                query=item["query"],
                topic=topic,
                search_depth=search_depth,
                include_domains=domains if domains else None,
                max_results=3
            )
        )
        # Lọc kết quả với score > 0.45
        return [search for search in tavily_response.get('results', []) if search.get('score', 0) > 0.45]
    except Exception as e:
        print(f"Error occurred during search for query '{item.get('query')}': {str(e)}")
        return []

async def search_node(state: AgentState, config: RunnableConfig):
    state["logs"] = state.get("logs", [])
    state["sources"] = state.get("sources", {})  
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    queries = tool_call["args"]["sub_queries"]

    # Khởi tạo logs cho các truy vấn
    for query in queries:
        state["logs"].append({
            "message": f"🌐 Searching the web: '{query.get('query')}'",
            "done": False
        })
    await copilotkit_emit_state(config, state)
    

    # Chạy các tác vụ search song song bằng asyncio.gather
    tasks = [async_tavily_search(query) for query in queries]
    # return_exceptions=True giúp chặn crash toàn bộ pipeline nếu có 1 task thất bại
    search_responses = await asyncio.gather(*tasks, return_exceptions=True)

    raw_search_results = []
    sources = state.get('sources', {})

    # Tổng hợp dữ liệu
    for i, response in enumerate(search_responses):
        if isinstance(response, Exception):
            print(f"Search task {i} failed with exception: {response}")
        else:
            raw_search_results.extend(response)
        # Cập nhật trạng thái log
        state["logs"][i]["done"] = True
        await copilotkit_emit_state(config, state)

    hidden_config = copilotkit_customize_config(
        config, 
        emit_messages=False, 
        emit_tool_calls=False # <-- Quan trọng nhất: chặn stream tool calls
    )
    model = get_model(state)
    ainvoke_kwargs = {}
    if model.__class__.__name__ in ["ChatOpenAI"]:
        ainvoke_kwargs["parallel_tool_calls"] = False

    raw_results_str = json.dumps(raw_search_results, indent=2)

    ai_response = await model.bind_tools(
        [ExtractSources], tool_choice="ExtractSources", **ainvoke_kwargs
    ).ainvoke(
        [
            SystemMessage(
                content="""
            You need to extract the 3-5 most relevant resources from the following search results.
            """
            ),
            *state["messages"],
            ToolMessage(
                tool_call_id=ai_message.tool_calls[0]["id"],
                content=f"Performed search: {raw_results_str}",
            ),
        ],
        hidden_config,
    )
    state["logs"] = []
    await copilotkit_emit_state(config, state)

    ai_extraction_message = cast(AIMessage, ai_response)
    extracted_sources = ai_extraction_message.tool_calls[0]["args"].get("sources", [])

    tool_msg_content = "Added the following curated sources:\n"
    
    for src in extracted_sources:
        url = src.get("url")
        if url and url not in state["sources"]:
            state["sources"][url] = {
                "url": url,
                "title": src.get("title", "No Title"),
                "content": src.get("content", "")
            }
            tool_msg_content += f"- {url}\n"
    state["messages"].append(
        ToolMessage(
            tool_call_id=ai_message.tool_calls[0]["id"],
            content=tool_msg_content,
        )
    )
    
    return state