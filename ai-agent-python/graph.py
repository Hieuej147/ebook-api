import os
import json
from datetime import datetime
from typing import Literal, cast
from dotenv import load_dotenv
import jwt



from langchain_core.messages import AIMessage, SystemMessage, HumanMessage, ToolMessage, ToolCall
from langgraph.graph import StateGraph, END
from langgraph.types import Command, interrupt
from langchain_core.runnables import RunnableConfig
from copilotkit.langchain import copilotkit_emit_state, copilotkit_customize_config
from langchain_core.tools import tool

from state import AgentState, InputState, OutputState
from config import get_model
from tools.tavily_search import tavily_search, search_node
from tools.tavily_extract import tavily_extract, extract_node
from langgraph.checkpoint.memory import MemorySaver
from copilotkit.langgraph import copilotkit_interrupt
import json
from util import should_route_to_tool_node 
from tools.get_state import view_chapter_details, view_chapter_node
from tools.statstools import STATS_NODES, STATS_ROUTING, STATS_TOOLS
from tools.booktool import *
from auth_context import current_auth_token

load_dotenv('.env')


ALL_ROUTING = {
    "tavily_search": "search_node",
    "tavily_extract": "extract_node",
    "view_chapter_details": "view_chapter_node",
    **BOOK_ROUTING,
    **STATS_ROUTING,
}

# Danh sách các Backend Tools
TOOLS = [
    tavily_search,
    tavily_extract,
    view_chapter_details,
    *BOOK_TOOLS,
    *STATS_TOOLS,
]


def build_system_prompt(state: AgentState) -> str:
    current_date = datetime.now().strftime('%Y-%m-%d')
    sources = state.get("sources", {})
    sources_text = ""
    frontend_actions = state.get("copilotkit", {}).get("actions", [])

    fe_tools_text = "--- CURRENT VIEW & FRONTEND (UI) TOOLS ---\n"
    if frontend_actions:
        fe_tools_text += (
            "The user is currently on a specific page that supports the following UI interactions. "
            "Use these tools to keep the interface in sync with the conversation:\n"
        )
        for action in frontend_actions:
            name = action.get("name", "UnknownTool")
            desc = action.get("description", "No description provided.")
            fe_tools_text += f"- {name}: {desc}\n"
        fe_tools_text += "\nCRITICAL: Only call these tools if they are listed above. If a tool disappears, the user has likely navigated away from that page.\n"
    else:
        fe_tools_text += (
            "The user is currently in a general context (Home or Navigation). "
            "No specific UI tools are mounted for the current route.\n"
        )

    if sources:
        sources_text = "--- EXTRACTED DATA (IN MEMORY) ---\n"
        for url, data in sources.items():
            content = data.get("raw_content", data.get("content", "No content available."))
            truncated = content[:3000] + ("..." if len(content) > 3000 else "")
            sources_text += f"\nSource: {url}\nContent: {truncated}\n"

    return f"""You are an intelligent AI assistant with two main roles:
1. A book writing and research expert
2. A business analytics assistant for a book-selling system
{fe_tools_text}
--- DYNAMIC UI RULES ---
1. **Context Awareness**: The tools listed in 'FRONTEND (UI) TOOLS' are route-specific. If you see 'updateDashboardStats',
the user is viewing the Dashboard. If you see 'manageTodo', they are looking at the Todo list.
2. **UI Synchronization**: Whenever you perform a backend action that changes data (like updating stats or adding a todo), 
ALWAYS check if there is a corresponding frontend tool to update the UI immediately.
3. **Implicit Navigation**: If the user asks to do something that requires a tool NOT currently in the UI list, 
inform them they might need to navigate to the correct page, 
or perform the backend action and state that the UI will update once they visit that page.

--- BOOK WRITING TOOLS ---
- `tavily_search`: Search the internet for information to support writing.
- `tavily_extract`: Extract detailed content from a specific URL.
- `view_chapter_details`: View chapter list or current chapter content.
- `update_book_outline`: Create a completely new book outline.
- `edit_book_outline`: Add/Edit/Delete chapters in an existing outline.
  IMPORTANT: When adding a new chapter, use action 'add' and LEAVE chapterNumber EMPTY.
- `write_chapter_content`: Write detailed content for a chapter. Requires sources before calling.
- `edit_chapter_content`: Replace a specific paragraph in a chapter. Must match the old text exactly.

--- BUSINESS ANALYTICS TOOLS ---
- `get_overview_stats`: Fetch ALL statistics (revenue + users + orders + books) in one call.
  → Use when user asks about "overview", "dashboard", or "summary report".
- `get_revenue_stats`: Revenue stats, top-selling books, and order status breakdown.
  → Use when user asks about "revenue", "sales", or "top books".
- `get_user_stats`: New users, active buyers, NORMAL vs PREMIUM.
  → Use when user asks about "users", "customers".
- `get_order_stats`: Orders, completion rate, average order value.
  → Use when user asks about "orders", "pending", "completion rate".
- `get_book_stats`: Book status (DRAFT/PUBLISHED), low stock, category distribution.
  → Use when user asks about "books", "inventory", "stock".
- `get_quick_stats`: Conversion rate, average rating, return rate.
  → Use when user asks about "quick stats", "conversion", "rating".
- `manageTodo`: Add/Edit/Delete/Toggle tasks in the Todo list.
  → Use when user says "add todo", "delete task", "mark done".

All stats tools accept parameter period: "today" | "week" | "month" | "year" (default: "month").
If user does not specify, always use "month".

--- ANALYTICS RULES ---
After retrieving data from stats tools:
1. Present data clearly (use tables or bullet points).
2. Calculate additional useful percentages if needed.
3. Highlight anomalies or notable insights.
4. Provide short insights and actionable suggestions if applicable.

--- DASHBOARD RENDERING RULES ---
When user requests to update the dashboard:
1. Call `get_overview_stats` first to retrieve data + charts.
2. Then call `updateDashboardStats` using ALL required parameters from step 1.
- `updateQuickStats`: Update Quick Stats cards on dashboard.
  → Call AFTER `get_quick_stats` if dashboard update is requested.
  → conversion_rate = completion_rate / 10
  → avg_rating comes from books data
  → return_rate = 100 - completion_rate

IMPORTANT: `updateDashboardStats` requires ALL of the following fields:
- total_revenue: from data.revenue.total_revenue
- revenue_trend: string describing trend (e.g. "+12.5% vs last period")
- active_users: from data.users.active_buyers
- users_trend: user trend description
- books_published: from data.books.by_status.PUBLISHED
- books_trend: books trend description
- orders_pending: from data.orders.by_status.PENDING.count
- revenue_chart: array [{{date, value}}] from data.charts.revenue_chart
- users_chart: array [{{date, value}}] from data.charts.users_chart
- orders_chart: array [{{date, value}}] from data.charts.orders_chart
- books_chart: array [{{date, value}}] from data.charts.books_chart

IMPORTANT:
- ONLY call `updateDashboardStats` when user explicitly asks to update dashboard.
- DO NOT call it automatically for normal analytics queries.

--- TODOLIST RULES ---
When using `manageTodo`:
- If user does not specify a date, ALWAYS use today's date: {current_date}
- Date format must be: yyyy-MM-dd (example: {current_date})
- DO NOT invent past or far-future dates unless explicitly requested
- When adding multiple todos, call `manageTodo` multiple times (1 per todo)
- action "add": requires "text" and "date"
- action "edit"/"delete"/"toggle": requires "id"

{sources_text}

GENERAL PRINCIPLES:
- Always use tools to retrieve real data, never fabricate numbers.
- If data already exists in "EXTRACTED DATA", reuse it instead of searching again.
- Always read chapter content before editing it.
"""

def validate_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        raw = token.replace("Bearer ", "").strip()
        payload = jwt.decode(
            raw,
            os.getenv("JWT_SECRET"),
            algorithms=["HS256"]
        )
        return {
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
        }
    except Exception:
        return None

async def call_model_node(state: AgentState, config: RunnableConfig):
    
    auth_token = current_auth_token.get()

    user_info = validate_token(auth_token)

    if not user_info:
        if not os.getenv("JWT_SECRET"):
            # ✅ Dev mode — set default user
            print("⚠️ Dev mode — JWT_SECRET not set, skipping auth")
            user_info = {"user_id": "dev", "email": "dev@local"}
        else:
            # ✅ Production — reject
            raise ValueError("Unauthorized: Invalid or expired token")

    print(f"✅ Agent called by: {user_info['email']}")

    frontend_tools = state.get("copilotkit", {}).get("actions", [])
    all_tools = TOOLS + frontend_tools
    # Khởi tạo Model
    model = get_model(state)
    ainvoke_kwargs = {}
    if model.__class__.__name__ in ["ChatOpenAI"]:
        ainvoke_kwargs["parallel_tool_calls"] = False
    # Thực thi model
    response = await model.bind_tools(
        all_tools,
        **ainvoke_kwargs,
    ).ainvoke([
        SystemMessage(content=build_system_prompt(state)),
        *state["messages"],
    ], config)

    ai_message = cast(AIMessage, response)
    goto = "__end__"

    tool_calls = ai_message.tool_calls

    if tool_calls:
        if should_route_to_tool_node(tool_calls, frontend_tools):
            tool_name = tool_calls[0]["name"]
            goto = ALL_ROUTING.get(tool_name, "__end__")
    return Command(
        goto=goto, 
        update={"messages": [response]} 
    )
    
def create_book_agent_graph():
    workflow = StateGraph(AgentState)
    
    # 1. Thêm các Nodes
    workflow.add_node("call_model_node", call_model_node)
    workflow.add_node("search_node", search_node)
    workflow.add_node("extract_node", extract_node)
    workflow.add_node("view_chapter_node", view_chapter_node)
    ALL_NODES = {**BOOK_NODES, **STATS_NODES}
    for name, node in ALL_NODES.items():
        workflow.add_node(name, node)
        workflow.add_edge(name, "call_model_node")
    
    # 2. Cấu hình luồng (Graph Edges)
    # Bắt đầu luôn luôn phải là Model để nó nhận tin nhắn của user và quyết định
    workflow.set_entry_point("call_model_node")
    
    # Sau khi Backend tools chạy xong, bắt buộc phải vòng lại Model để đọc kết quả
    workflow.set_entry_point("call_model_node")
    workflow.add_edge("search_node", "call_model_node")
    workflow.add_edge("extract_node", "call_model_node")
    workflow.add_edge("view_chapter_node", "call_model_node")
    
    # 3. Compile với bộ nhớ
    checkpointer = MemorySaver()
    return workflow.compile(checkpointer=checkpointer)

# Khởi tạo graph để sử dụng
graph = create_book_agent_graph()