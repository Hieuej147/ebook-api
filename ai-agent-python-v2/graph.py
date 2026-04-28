import os
import jwt
from typing import cast, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
from langgraph.checkpoint.memory import MemorySaver

from copilotkit.langchain import copilotkit_customize_config

# Import State và Auth chung
from state import AgentState
from config import get_model
from auth_context import current_auth_token

# Import 2 Workers (Subgraphs)
from subgraphs.book_subgraph import book_subgraph
from subgraphs.stats_subgraph import stats_subgraph

load_dotenv('.env')

# =====================================================================
# 1. SUPERVISOR Dùng Structured Output & Command
# =====================================================================
class SupervisorRouter(BaseModel):
    """The necessary tool for LLM to return navigation decisions."""
    next_agent: Literal["book_agent", "stats_agent"] = Field(description="Agent mục tiêu")

def build_supervisor_prompt(state: AgentState) -> str:
    frontend_actions = state.get("copilotkit", {}).get("actions", [])
    ui_context = ""
    if frontend_actions:
        ui_context = "\n--- CURRENT UI CONTEXT ---\n"
        ui_context += "The user is currently on a page with the following tools available:\n"
        for action in frontend_actions:
            ui_context += f"- {action.get('name')}: {action.get('description', '')}\n"

    return f"""You are the Workflow Supervisor and the ONLY agent who talks to the user.

AVAILABLE WORKERS:
- book_agent: For writing, outlines, research, and chapter content.
- stats_agent: For business analytics, revenue, orders, and UI updates (dashboard/todos).
{ui_context}
YOUR RULES:
1. NEW REQUESTS: If the user asks for something new, you MUST use the `SupervisorRouter` tool to delegate the task to the correct worker.
2. IMPORTANT: you must route and do not say anything.
"""

async def supervisor_node(state: AgentState, config: RunnableConfig):
    # Kiểm tra Auth
    auth_token = current_auth_token.get()
    raw_token = auth_token.replace("Bearer ", "").strip() if auth_token else None
    
    try:
        if raw_token:
            payload = jwt.decode(raw_token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
            user_email = payload.get("email")
            print(f"🧭 Supervisor is routing for: {user_email}")
        else:
            print("⚠️ Warning: Running in unauthenticated mode (Dev mode)")
    except Exception:
        raise ValueError("Invalid or expired token.")
    
    model = get_model(state)
    
    # Ẩn luồng suy nghĩ của Supervisor khỏi Frontend
    custom_config = copilotkit_customize_config(
        config, 
        emit_messages=False,   # <--- Đổi thành True để user thấy Supervisor chat
        emit_tool_calls=False # <--- Giữ False để ẩn cái rác của SupervisorRouter
    )

    response = await model.bind_tools(
        [SupervisorRouter], tool_choice="SupervisorRouter"
    ).ainvoke(
        [SystemMessage(content=build_supervisor_prompt(state)), *state["messages"]],
        custom_config,
    )

    ai_message = cast(AIMessage, response)
    
    # Mặc định an toàn
    next_agent = "book_agent" 
    if ai_message.tool_calls:
        next_agent = ai_message.tool_calls[0]["args"].get("next_agent", "book_agent")
        print(f"🧭 Supervisor giao việc cho -> {next_agent.upper()}")
        return Command(goto=next_agent)
    else:
        print("✅ Supervisor đã tổng hợp xong và trả lời User -> KẾT THÚC.")
        return Command(goto=END)

    # Điều hướng thẳng đến Subgraph
    return Command(goto=next_agent)


def create_agent_graph():
    workflow = StateGraph(AgentState)

    # Khai báo các Node
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("book_agent", book_subgraph)
    workflow.add_node("stats_agent", stats_subgraph)

    # Cấu hình luồng chạy
    workflow.set_entry_point("supervisor")
    workflow.add_edge(START, "supervisor")


    workflow.add_edge("book_agent", END)
    workflow.add_edge("stats_agent", END)
    
    is_fast_api = os.environ.get("LANGGRAPH_FAST_API", "false").lower() == "true"
    
    if is_fast_api:
       
        memory = MemorySaver()
        return workflow.compile(checkpointer=memory)
    else:
       
        return workflow.compile()

graph = create_agent_graph()