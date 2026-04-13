import os
import jwt
from typing import cast, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
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
# 1. SUPERVISOR (QUẢN ĐỐC) - Dùng Structured Output & Command
# =====================================================================
class SupervisorRouter(BaseModel):
    """The necessary tool for LLM to return navigation decisions."""
    next_agent: Literal["book_agent", "stats_agent"] = Field(description="Agent mục tiêu")
    instructions: str = Field(description="Mệnh lệnh/chỉ thị chi tiết, rõ ràng dành cho Worker dựa trên yêu cầu của user")

def build_supervisor_prompt(state: AgentState) -> str:
    frontend_actions = state.get("copilotkit", {}).get("actions", [])
    ui_context = ""
    if frontend_actions:
        ui_context = "\n--- CURRENT UI CONTEXT ---\n"
        ui_context += "The user is currently on a page with the following tools available:\n"
        for action in frontend_actions:
            ui_context += f"- {action.get('name')}: {action.get('description', '')}\n"
    report_context = ""
    if state.get("worker_report"):
        report_context = f"\n--- WORKER REPORT ---\n{state['worker_report']}\nYour task: Summarize this report and answer the user directly and politely. Do NOT use the routing tool."

    return f"""You are the Workflow Supervisor and the ONLY agent who talks to the user.

AVAILABLE WORKERS:
- book_agent: For writing, outlines, research, and chapter content.
- stats_agent: For business analytics, revenue, orders, and UI updates (dashboard/todos).
{ui_context}
YOUR RULES:
1. NEW REQUESTS: If the user asks for something new, you MUST use the `SupervisorRouter` tool to delegate the task to the correct worker.
2. IMPORTANT: you must route and do not say anything.

{report_context}
"""

async def supervisor_node(state: AgentState, config: RunnableConfig):
    # 1. Kiểm tra Auth
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
    messages = state.get("messages", [])
    last_message = messages[-1] if messages else None

    # 2. CẤU HÌNH CHUNG
    shared_config = copilotkit_customize_config(
        config, 
        emit_messages=True,   
        emit_tool_calls=False 
    )

    # ========================================================
    # KHU VỰC 3: ĐIỀU PHỐI WORKER & FRONTEND TOOLS
    # ========================================================
    
    # TRƯỜNG HỢP A: Có báo cáo từ Worker -> Trả lời User
    if state.get("worker_report"):
        print("🗣️ Supervisor đang trả lời User dựa trên báo cáo từ Worker...")
        response = await model.ainvoke(
            [SystemMessage(content=build_supervisor_prompt(state)), *state["messages"]],
            shared_config,
        )
        return Command(
            goto=END, 
            update={
                "worker_report": "", 
                "worker_task": "", 
                "active_worker": "", # Đã xong việc, xóa session worker
                "messages": [response]
            }
        )

    # TRƯỜNG HỢP B: Worker vừa gọi một FE Tool (dangling tool call)
    # Bắt buộc phải dừng Supervisor lại (END) để CopilotKit và Frontend chạy tool
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        print("⏸️ Worker vừa gọi Frontend Tool. Tạm dừng đồ thị để chờ UI phản hồi...")
        return Command(goto=END)

    # TRƯỜNG HỢP C: Frontend vừa chạy Tool xong và gửi kết quả (ToolMessage) về
    # Phải đưa kết quả này quay lại đúng Worker đang làm việc dở dang
    if isinstance(last_message, ToolMessage) and state.get("active_worker"):
        active = state["active_worker"]
        print(f"▶️ Đã có kết quả từ UI. Trả về tiếp cho Worker: {active.upper()}")
        return Command(goto=active)

    # ========================================================
    # KHU VỰC 4: GIAO VIỆC MỚI HOẶC CHIT-CHAT TỰ DO
    # ========================================================
    response = await model.bind_tools(
        [SupervisorRouter]
    ).ainvoke(
        [SystemMessage(content=build_supervisor_prompt(state)), *state["messages"]],
        shared_config,
    )

    ai_message = cast(AIMessage, response)
    
    if ai_message.tool_calls:
        args = ai_message.tool_calls[0]["args"]
        next_agent = args.get("next_agent", "book_agent")
        instructions = args.get("instructions", "")

        print(f"🧭 Supervisor giao việc cho -> {next_agent.upper()}: {instructions}")
        return Command(
            goto=next_agent,
            update={
                "worker_task": instructions,
                "active_worker": next_agent # <--- LƯU LẠI WORKER NÀO ĐANG ĐƯỢC GIAO VIỆC
            }
        )
    else:
        print("✅ Supervisor đang tự chat trực tiếp với User -> KẾT THÚC.")
        return Command(
            goto=END,
            update={"messages": [response]} 
        )


def create_agent_graph():
    workflow = StateGraph(AgentState)

    # Khai báo các Node
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("book_agent", book_subgraph)
    workflow.add_node("stats_agent", stats_subgraph)

    # Cấu hình luồng chạy
    workflow.set_entry_point("supervisor")
    workflow.add_edge(START, "supervisor")


    workflow.add_edge("book_agent", "supervisor")
    workflow.add_edge("stats_agent", "supervisor")
    
    is_fast_api = os.environ.get("LANGGRAPH_FAST_API", "false").lower() == "true"
    
    if is_fast_api:
       
        memory = MemorySaver()
        return workflow.compile(checkpointer=memory)
    else:
       
        return workflow.compile()

graph = create_agent_graph()