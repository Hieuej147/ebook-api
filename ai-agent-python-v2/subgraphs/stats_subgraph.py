"""
Business Analytics Subgraph
Handles: revenue, orders, users, books stats, dashboard updates
"""
from typing import cast
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
from datetime import datetime

from state import AgentState
from config import get_model
from tools.statstools import STATS_TOOLS, STATS_NODES, STATS_ROUTING
from util import should_route_to_tool_node
from copilotkit.langchain import copilotkit_customize_config

current_date = datetime.now().strftime('%Y-%m-%d')

STATS_SYSTEM_PROMPT = f"""You are a business analytics assistant for a book-selling system.

--- AVAILABLE TOOLS ---
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

All stats tools accept period: "today" | "week" | "month" | "year" (default: "month").
If user does not specify, always use "month".

--- DASHBOARD RENDERING RULES ---
When user requests to update the dashboard:
1. Call `get_overview_stats` first to retrieve data + charts.
2. Then call `updateDashboardStats` using ALL required parameters:
   - total_revenue: from data.revenue.total_revenue
   - revenue_trend: string describing trend (e.g. "+12.5% vs last period")
   - active_users: from data.users.active_buyers
   - users_trend: user trend description
   - books_published: from data.books.by_status.PUBLISHED
   - books_trend: books trend description
   - orders_pending: from data.orders.by_status.PENDING.count
   - revenue_chart / users_chart / orders_chart / books_chart: array [{{date, value}}]

- `updateQuickStats`: Call AFTER `get_quick_stats` if dashboard update requested.
  → conversion_rate = completion_rate / 10
  → avg_rating comes from books data
  → return_rate = 100 - completion_rate

IMPORTANT: ONLY call `updateDashboardStats` when user explicitly asks to update dashboard.

--- TODOLIST RULES ---
When using `manageTodo`:
- If user does not specify a date, ALWAYS use today's date: {current_date}
- Date format must be: yyyy-MM-dd
- action "add": requires "text" and "date"
- action "edit"/"delete"/"toggle": requires "id"

--- ANALYTICS RULES ---
After retrieving data:
1. Present data clearly (use tables or bullet points).
2. Calculate additional useful percentages if needed.
3. Highlight anomalies or notable insights.
4. Provide short insights and actionable suggestions if applicable.

ALWAYS use tools to retrieve real data, never fabricate numbers.
"""


async def stats_agent_node(state: AgentState, config: RunnableConfig):
    frontend_tools = state.get("copilotkit", {}).get("actions", [])
    all_tools = STATS_TOOLS + frontend_tools

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
            SystemMessage(content=STATS_SYSTEM_PROMPT),
            *state["messages"],
        ],
        hidden_config,
    )

    ai_message = cast(AIMessage, response)
    goto = END

    if ai_message.tool_calls:
        if should_route_to_tool_node(ai_message.tool_calls, frontend_tools):
            tool_name = ai_message.tool_calls[0]["name"]
            goto = STATS_ROUTING.get(tool_name, END)

    return Command(goto=goto, update={"messages": [response]})


def build_stats_subgraph():
    graph = StateGraph(AgentState)

    # Main agent node
    graph.add_node("stats_agent_node", stats_agent_node)

    # Tool nodes
    for name, node in STATS_NODES.items():
        graph.add_node(name, node)
        graph.add_edge(name, "stats_agent_node")

    graph.set_entry_point("stats_agent_node")

    return graph


stats_subgraph = build_stats_subgraph().compile()