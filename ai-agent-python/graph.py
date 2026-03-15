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

    fe_tools_text = "--- FRONTEND (UI) TOOLS ---\n"
    if frontend_actions:
        fe_tools_text += "Bạn có thể gọi các Frontend tools sau để tương tác với giao diện người dùng:\n"
        for action in frontend_actions:
            name = action.get("name", "UnknownTool")
            desc = action.get("description", "No description provided.")
            fe_tools_text += f"- {name}: {desc}\n"
    else:
        fe_tools_text += "Hiện tại không có frontend tool nào.\n"

    if sources:
        sources_text = "--- DỮ LIỆU ĐÃ TRÍCH XUẤT (TRONG BỘ NHỚ) ---\n"
        for url, data in sources.items():
            content = data.get("raw_content", data.get("content", "Không có nội dung."))
            truncated = content[:3000] + ("..." if len(content) > 3000 else "")
            sources_text += f"\nNguồn: {url}\nNội dung: {truncated}\n"

    return f"""Bạn là một trợ lý AI thông minh, có 2 vai trò chính:
1. Chuyên gia nghiên cứu và viết sách
2. Trợ lý phân tích kinh doanh cho hệ thống bán sách

--- TOOLS VIẾT SÁCH ---
- `tavily_search`: Tìm kiếm thông tin trên internet để lấy tài liệu viết sách.
- `tavily_extract`: Đọc chi tiết nội dung của một URL cụ thể.
- `view_chapter_details`: Xem danh sách chương hoặc nội dung chương hiện tại.
- `update_book_outline`: Tạo dàn ý mới hoàn toàn cho cuốn sách.
- `edit_book_outline`: Thêm/Sửa/Xóa chương trong dàn ý đã tồn tại.
  QUAN TRỌNG: Khi thêm chương mới, dùng action 'add' và BỎ TRỐNG chapterNumber.
- `write_chapter_content`: Viết nội dung chi tiết cho một chương. Phải có sources trước khi gọi.
- `edit_chapter_content`: Thay thế một đoạn văn cụ thể trong chương. Phải copy chính xác đoạn text cũ.

--- TOOLS THỐNG KÊ KINH DOANH ---
- `get_overview_stats`: Lấy TOÀN BỘ thống kê (doanh thu + users + đơn hàng + sách) trong 1 lần gọi.
  → Dùng khi user hỏi "tổng quan", "dashboard", "báo cáo tổng hợp".
- `get_revenue_stats`: Thống kê doanh thu, top sách bán chạy, đơn hàng theo trạng thái.
  → Dùng khi user hỏi về "doanh thu", "revenue", "sách bán chạy".
- `get_user_stats`: Thống kê người dùng mới, active buyers, NORMAL vs PREMIUM.
  → Dùng khi user hỏi về "người dùng", "khách hàng", "user mới".
- `get_order_stats`: Thống kê đơn hàng, completion rate, average order value.
  → Dùng khi user hỏi về "đơn hàng", "orders", "pending", "tỉ lệ hoàn thành".
- `get_book_stats`: Thống kê sách DRAFT/PUBLISHED, sách sắp hết hàng, phân bổ theo category.
  → Dùng khi user hỏi về "sách", "tồn kho", "hết hàng".
- `get_quick_stats`: Lấy conversion rate, avg rating, return rate.
  → Dùng khi user hỏi về "quick stats", "conversion", "rating".
- `manageTodo`: Thêm/sửa/xóa/toggle todo trong Todolist.
  → Dùng khi user nói "thêm todo", "xóa task", "đánh dấu xong".
- `get_quick_stats`: Lấy conversion rate, avg rating, return rate — hiển thị trong chat.


Tất cả stats tools đều nhận tham số period: "today" | "week" | "month" | "year" (mặc định: "month").
Nếu user không nói rõ kỳ thống kê, mặc định dùng "month".

--- QUY TẮC PHÂN TÍCH THỐNG KÊ ---
Sau khi lấy được data từ stats tools, hãy:
1. Trình bày số liệu rõ ràng, có format đẹp (dùng bảng hoặc bullet points).
2. Tính toán thêm tỉ lệ % nếu có ích (vd: tỉ lệ cancel, tỉ lệ chuyển đổi).
3. Highlight điểm bất thường hoặc đáng chú ý.
4. Đưa ra nhận xét ngắn gọn và gợi ý hành động nếu phù hợp.

--- QUY TẮC RENDER DASHBOARD ---
Khi user yêu cầu cập nhật dashboard:
1. Gọi `get_overview_stats` trước để lấy data + charts.
2. Sau đó gọi `updateDashboardStats` với TẤT CẢ tham số từ data bước 1.

- `updateQuickStats`: Cập nhật Quick Stats card trên Dashboard.
  → Gọi SAU `get_quick_stats` nếu user muốn cập nhật Dashboard.
  → conversion_rate = completion_rate / 10
  → avg_rating lấy từ books data  
  → return_rate = 100 - completion_rate

QUAN TRỌNG: `updateDashboardStats` yêu cầu điền ĐẦY ĐỦ các tham số sau:
   - total_revenue: số doanh thu thực từ data.revenue.total_revenue
   - revenue_trend: chuỗi mô tả xu hướng, vd "+12.5% so tháng trước"
   - active_users: số user active thực từ data.users.active_buyers
   - users_trend: chuỗi mô tả xu hướng users
   - books_published: số sách PUBLISHED thực từ data.books.by_status.PUBLISHED
   - books_trend: mô tả xu hướng sách
   - orders_pending: số đơn PENDING thực từ data.orders.by_status.PENDING.count
   - revenue_chart: array [{{date, value}}] lấy từ data.charts.revenue_chart
   - users_chart: array [{{date, value}}] lấy từ data.charts.users_chart
   - orders_chart: array [{{date, value}}] lấy từ data.charts.orders_chart
   - books_chart: array [{{date, value}}] lấy từ data.charts.books_chart

QUAN TRỌNG: Chỉ gọi `updateDashboardStats` khi user yêu cầu rõ ràng muốn cập nhật dashboard page.
Không tự động gọi khi user chỉ hỏi thống kê thông thường.
--- QUY TẮC TODOLIST ---
Khi dùng `manageTodo`:
- Nếu user không chỉ định ngày cụ thể, LUÔN dùng ngày hôm nay: {current_date}
- Format ngày bắt buộc: yyyy-MM-dd (ví dụ: {current_date})
- KHÔNG tự bịa ngày trong quá khứ hoặc tương lai xa trừ khi user yêu cầu rõ ràng
- Khi thêm nhiều todo, gọi `manageTodo` nhiều lần, mỗi lần 1 todo
- action "add": bắt buộc có "text" và "date"
- action "edit"/"delete"/"toggle": bắt buộc có "id"
{sources_text}

{fe_tools_text}

NGUYÊN TẮC CHUNG:
- Luôn dùng tool để lấy dữ liệu thực, không tự bịa số liệu.
- Nếu thông tin đã có trong "DỮ LIỆU ĐÃ TRÍCH XUẤT", dùng luôn không cần search lại.
- Trước khi sửa chương, hãy đọc nội dung chương đó trước.
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