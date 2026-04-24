# tools/stats_tools.py
import httpx
import os
from pydantic import BaseModel, Field
from typing import Literal, cast
from langchain_core.tools import tool
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from copilotkit.langchain import copilotkit_emit_state
import json 
import asyncio
from state import AgentState

NESTJS_BASE_URL = os.getenv("NESTJS_BASE_URL", "http://localhost:3000")

Period = Literal["today", "week", "month", "year"]

# ============================
# TOOL 1: Overview Statistics
# ============================
class OverviewStatsInput(BaseModel):
    period: Period = Field(default="month", description="Time period: 'today', 'week', 'month', or 'year'")

@tool("get_overview_stats", args_schema=OverviewStatsInput)
def get_overview_stats(period: str = "month"):
    """
    Retrieve overview statistics: revenue, users, orders, and books. 
    Use this tool when the user asks for a general dashboard overview.
    """
    pass

async def overview_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    # Log UI status
    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"📊 Fetching overview statistics ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        # ✅ Concurrently fetch overview data and all related charts to optimize speed
        overview_res, rev_chart, usr_chart, ord_chart, book_chart = await asyncio.gather(
            client.get(f"{NESTJS_BASE_URL}/stats/overview", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/revenue/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/users/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/orders/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/books/chart", params={"period": period}),
        )
        
        # Construct the final data payload
        data = {
            **overview_res.json(),  # Spread the entire overview data
            "charts": {
                "revenue_chart": rev_chart.json(),
                "users_chart": usr_chart.json(),
                "orders_chart": ord_chart.json(),
                "books_chart": book_chart.json(),
            }
        }

    # Update UI status to completed
    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    # Append the JSON response to the state messages
    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)
    ))
    return state


class QuickStatsInput(BaseModel):
    period: Period = Field(default="month", description="Time period: 'today', 'week', 'month', or 'year'")

@tool("get_quick_stats", args_schema=QuickStatsInput)
def get_quick_stats(period: str = "month"):
    """Retrieve quick statistics metrics such as conversion rate, average rating, and return rate."""
    pass

async def quick_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    async with httpx.AsyncClient() as client:
        # Calculate derived metrics from overview and order endpoints
        overview, orders = await asyncio.gather(
            client.get(f"{NESTJS_BASE_URL}/stats/overview", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/orders", params={"period": period}),
        )
        ov = overview.json()
        od = orders.json()
        
        data = {
            "period": period,
            "conversion_rate": round(od.get("completion_rate", 0) / 10, 2),
            "avg_rating": ov.get("books", {}).get("avg_rating", 0),
            "return_rate": round(100 - od.get("completion_rate", 0), 2),
        }

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)
    ))
    return state


# ============================
# TOOL 2: Revenue Statistics
# ============================
class RevenueStatsInput(BaseModel):
    period: Period = Field(default="month", description="Time period: 'today', 'week', 'month', or 'year'")

@tool("get_revenue_stats", args_schema=RevenueStatsInput)
def get_revenue_stats(period: str = "month"):
    """
    Retrieve detailed revenue statistics: total revenue, period-over-period comparison, 
    top-selling books, and orders categorized by status.
    """
    pass

async def revenue_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"💰 Fetching revenue data ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/revenue", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  # ✅ using json.dumps instead of str()
    ))
    return state


# ============================
# TOOL 3: User Statistics
# ============================
class UserStatsInput(BaseModel):
    period: Period = Field(default="month", description="Time period: 'today', 'week', 'month', or 'year'")

@tool("get_user_stats", args_schema=UserStatsInput)
def get_user_stats(period: str = "month"):
    """
    Retrieve user statistics: total users, newly registered users, 
    active buyers, and the distribution of NORMAL vs PREMIUM accounts.
    """
    pass

async def user_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"👥 Fetching user data ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/users", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  
    ))
    return state


# ============================
# TOOL 4: Order Statistics
# ============================
class OrderStatsInput(BaseModel):
    period: Period = Field(default="month", description="Time period: 'today', 'week', 'month', or 'year'")

@tool("get_order_stats", args_schema=OrderStatsInput)
def get_order_stats(period: str = "month"):
    """
    Retrieve order statistics: pending, completed, cancelled orders, 
    overall completion rate, and average order value.
    """
    pass

async def order_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"📦 Fetching order data ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/orders", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  
    ))
    return state


# ============================
# TOOL 5: Book Statistics
# ============================
@tool("get_book_stats")
def get_book_stats():
    """
    Retrieve book statistics: DRAFT vs PUBLISHED statuses, 
    books that are running out of stock, and distribution across categories.
    """
    pass

async def book_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": "📚 Fetching book inventory and statistics...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/books")
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False) 
    ))
    return state


# ============================
# EXPORTS: Tools, Nodes, and Routing
# ============================
STATS_TOOLS = [
    get_overview_stats,
    get_revenue_stats,
    get_user_stats,
    get_order_stats,
    get_book_stats,
    get_quick_stats
]

STATS_NODES = {
    "overview_stats_node": overview_stats_node,
    "revenue_stats_node": revenue_stats_node,
    "user_stats_node": user_stats_node,
    "order_stats_node": order_stats_node,
    "book_stats_node": book_stats_node,
    "quick_stats_node": quick_stats_node,
}

STATS_ROUTING = {
    "get_overview_stats": "overview_stats_node",
    "get_revenue_stats": "revenue_stats_node",
    "get_user_stats": "user_stats_node",
    "get_order_stats": "order_stats_node",
    "get_book_stats": "book_stats_node",
    "get_quick_stats": "quick_stats_node"
}