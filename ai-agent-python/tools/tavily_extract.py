import os
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from tavily import TavilyClient
from typing import List, Optional, Literal, Dict, cast, Any
from copilotkit.langchain import copilotkit_emit_state
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import AIMessage, ToolMessage
from state import AgentState
import asyncio


tavily_api_key = os.getenv("TAVILY_API_KEY")
tavily_client = TavilyClient(api_key=tavily_api_key)


class TavilyExtractInput(BaseModel):
    urls: List[str] = Field(
        description="List of URLs from which to extract content."
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional query to focus the extraction on specific information."
    )
    extract_depth: Optional[str] = Field(
        default="basic",
        description="Depth of content extraction. MUST be either 'basic' or 'advanced'."
    )


@tool("tavily_extract", args_schema=TavilyExtractInput)
async def tavily_extract(urls: List[str], query: Optional[str] = None, extract_depth: str = "basic"):
    """
    Extracts full, raw content from a specific list of URLs to gather deep, 
    detailed information for research or story world-building.
    
    Use this tool when you have already identified valuable sources (e.g., via search) 
    and need more than just a short snippet to draft a detailed section.
    """
    pass

# Global cache to prevent redundant API calls for previously extracted URLs
_EXTRACT_CACHE = {}

def get_extracted_resource(url: str):
    """Retrieve previously extracted content from the global cache."""
    return _EXTRACT_CACHE.get(url, None)

# Asynchronous wrapper to execute the synchronous Tavily client on a thread pool
async def async_tavily_extract(urls: List[str], query: Optional[str], extract_depth: str) -> Dict[str, Any]:
    """Asynchronous wrapper for the Tavily extract API."""
    loop = asyncio.get_event_loop()
    try:
        # Run tavily_client.extract (synchronous) within the executor pool to prevent blocking the async event loop
        return await loop.run_in_executor(
            None,
            lambda: tavily_client.extract(
                urls=urls,
                query=query,
                extract_depth=extract_depth
            )
        )
    except Exception as e:
        print(f"Error occurred during async extract: {str(e)}")
        raise e


async def extract_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    
    urls = args.get("urls", [])
    query = args.get("query")
    extract_depth = args.get("extract_depth", "basic")
    
    # Initialize default state structures if they are missing
    state["logs"] = state.get("logs", [])
    state["sources"] = state.get("sources", {})
    
    urls_to_extract = []
    tool_msg = "Here is the extracted content from the requested URLs:\n\n"
    
    # 1. STORAGE VALIDATION STEP (CACHE & STATE)
    # Check if the requested URLs have already been extracted and stored
    for url in urls:
        existing_source = state["sources"].get(url, {})
        cached_content = existing_source.get("raw_content") or get_extracted_resource(url)
        
        if cached_content:
            # Truncate content to avoid exceeding token limits for context
            truncated = cached_content[:5000] + ("..." if len(cached_content) > 5000 else "")
            tool_msg += f"--- START CONTENT FROM {url} (CACHED) ---\n{truncated}\n--- END CONTENT ---\n\n"
            
            # Sync the cached content back into the local state if it's not already there
            if url not in state["sources"]:
                state["sources"][url] = {"url": url, "raw_content": cached_content}
            else:
                state["sources"][url]["raw_content"] = cached_content
        else:
            # Mark URL for fresh extraction
            urls_to_extract.append(url)

    # 2. FETCH NEW URLS VIA THREAD POOL
    # Execute API calls only for URLs that were not found in the cache
    if urls_to_extract:
        state["logs"].append({
            "message": f"🚀 Extracting full content from {len(urls_to_extract)} new sources...",
            "done": False
        })
        await copilotkit_emit_state(config, state)
        
        try:
            # Utilize the custom async wrapper to avoid blocking
            response = await async_tavily_extract(urls=urls_to_extract, query=query, extract_depth=extract_depth)
            results = response.get('results', [])

            for itm in results:
                url = itm.get('url')
                if not url:
                    continue
                raw_content = itm.get('raw_content', "No content found.")
                
                # Save the new content to the global cache
                _EXTRACT_CACHE[url] = raw_content
                
                # Save the content in the standard Source TypedDict format to the agent's state
                if url not in state["sources"]:
                    state["sources"][url] = {"url": url, "raw_content": raw_content}
                else:
                    state["sources"][url]["raw_content"] = raw_content
                    
                tool_msg += f"- Successfully extracted content from {url} and saved to state.\n"
                
            # Update UI log status to completed
            state["logs"][-1]["done"] = True
            await copilotkit_emit_state(config, state)
            
        except Exception as e:
            print(f"Error occurred during extract: {str(e)}")
            tool_msg += f"\nError extracting some URLs: {str(e)}\n"
            
            # Ensure the UI loading spinner stops even if an error occurs
            if state["logs"] and not state["logs"][-1]["done"]:
                state["logs"][-1]["done"] = True
            await copilotkit_emit_state(config, state)
        
    # Append the final result message back to the LangGraph state
    state["messages"].append(
        ToolMessage(
            tool_call_id=ai_message.tool_calls[0]["id"],
            name=tool_call["name"],
            content=tool_msg,
        )
    )

    return state