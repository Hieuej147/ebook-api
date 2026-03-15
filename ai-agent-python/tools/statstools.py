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
# TOOL 1: Overview (tất cả)
# ============================
class OverviewStatsInput(BaseModel):
    period: Period = Field(default="month", description="Khoảng thời gian: today, week, month, year")

@tool("get_overview_stats", args_schema=OverviewStatsInput)
def get_overview_stats(period: str = "month"):
    """Lấy tổng quan thống kê: doanh thu, người dùng, đơn hàng, sách. Dùng khi user hỏi tổng quan dashboard."""
    pass

async def overview_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"📊 Đang lấy thống kê tổng quan ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        # ✅ Gọi cả overview + chart cùng lúc
        overview_res, rev_chart, usr_chart, ord_chart, book_chart = await asyncio.gather(
            client.get(f"{NESTJS_BASE_URL}/stats/overview", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/revenue/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/users/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/orders/chart", params={"period": period}),
            client.get(f"{NESTJS_BASE_URL}/stats/books/chart", params={"period": period}),
        )
        data = {
            **overview_res.json(),  # spread toàn bộ overview data
            "charts": {
                "revenue_chart": rev_chart.json(),
                "users_chart": usr_chart.json(),
                "orders_chart": ord_chart.json(),
                "books_chart": book_chart.json(),
            }
        }

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)
    ))
    return state

class QuickStatsInput(BaseModel):
    period: Period = Field(default="month")

@tool("get_quick_stats", args_schema=QuickStatsInput)
def get_quick_stats(period: str = "month"):
    """Lấy quick stats: conversion rate, avg rating, return rate."""
    pass

async def quick_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    async with httpx.AsyncClient() as client:
        # Tính từ overview + order stats
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
# TOOL 2: Doanh thu
# ============================
class RevenueStatsInput(BaseModel):
    period: Period = Field(default="month", description="Khoảng thời gian: today, week, month, year")

@tool("get_revenue_stats", args_schema=RevenueStatsInput)
def get_revenue_stats(period: str = "month"):
    """Lấy thống kê doanh thu: tổng revenue, so sánh kỳ trước, top sách bán chạy, đơn hàng theo status."""
    pass

async def revenue_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"💰 Đang lấy dữ liệu doanh thu ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/revenue", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  # ✅ thay str(data)
    ))
    return state


# ============================
# TOOL 3: Người dùng
# ============================
class UserStatsInput(BaseModel):
    period: Period = Field(default="month", description="Khoảng thời gian: today, week, month, year")

@tool("get_user_stats", args_schema=UserStatsInput)
def get_user_stats(period: str = "month"):
    """Lấy thống kê người dùng: tổng users, users mới, active buyers, NORMAL vs PREMIUM."""
    pass

async def user_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"👥 Đang lấy dữ liệu người dùng ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/users", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  # ✅ thay str(data)
    ))
    return state


# ============================
# TOOL 4: Đơn hàng
# ============================
class OrderStatsInput(BaseModel):
    period: Period = Field(default="month", description="Khoảng thời gian: today, week, month, year")

@tool("get_order_stats", args_schema=OrderStatsInput)
def get_order_stats(period: str = "month"):
    """Lấy thống kê đơn hàng: pending, completed, cancelled, completion rate, avg order value."""
    pass

async def order_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    period = tool_call["args"].get("period", "month")

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": f"📦 Đang lấy dữ liệu đơn hàng ({period})...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/orders", params={"period": period})
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  # ✅ thay str(data)
    ))
    return state


# ============================
# TOOL 5: Sách
# ============================
@tool("get_book_stats")
def get_book_stats():
    """Lấy thống kê sách: DRAFT vs PUBLISHED, sách sắp hết hàng, phân bổ theo category."""
    pass

async def book_stats_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]

    state["logs"] = state.get("logs", [])
    state["logs"].append({"message": "📚 Đang lấy dữ liệu sách...", "done": False})
    await copilotkit_emit_state(config, state)

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{NESTJS_BASE_URL}/stats/books")
        data = res.json()

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(ToolMessage(
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
        content=json.dumps(data, ensure_ascii=False)  # ✅ thay str(data)
    ))
    return state


# Export tất cả tools và nodes
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