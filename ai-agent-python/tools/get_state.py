from pydantic import BaseModel, Field
from typing import List, cast, Optional
from langchain_core.tools import tool
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from copilotkit.langchain import copilotkit_emit_state
from state import AgentState

class ViewChapterInput(BaseModel):
    chapterNumber: Optional[int] = Field(
        default=None, 
        description="Số thứ tự chương cần xem. Nếu để trống, hệ thống sẽ tự động trả về thông tin của chương mà người dùng đang chọn trên màn hình."
    )

@tool("view_chapter_details", args_schema=ViewChapterInput)
def view_chapter_details(chapterNumber: Optional[int] = None):
    """
    Sử dụng tool này để xem nội dung chi tiết và dàn ý của một chương cụ thể, 
    đặc biệt là để biết người dùng đang thao tác ở chương nào.
    """
    pass

async def view_chapter_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    
    # 1. Ưu tiên số chương AI yêu cầu, nếu AI không yêu cầu (None) -> Lấy số chương user đang chọn trên UI
    requested_num = args.get("chapterNumber")
    selected_num = state.get("selectedChapterNumber")
    
    target_num = requested_num if requested_num is not None else selected_num

    book = state.get("book", {})
    chapters = book.get("chapters", [])

    # 2. Xử lý logic trả về thông tin
    content = ""
    if not chapters:
        content = "Hiện tại sách chưa có dàn ý hoặc chương nào được tạo."
    elif target_num is not None:
        # Tìm chi tiết chương mục tiêu
        ch = next((c for c in chapters if c.get("chapterNumber") == target_num), None)
        if ch:
            is_active_chapter = (target_num == selected_num)
            status_text = "ĐÂY LÀ CHƯƠNG NGƯỜI DÙNG ĐANG CHỌN TRÊN GIAO DIỆN." if is_active_chapter else "Đây là chương bạn yêu cầu xem."
            
            content = (
                f"--- THÔNG TIN CHƯƠNG {target_num} ---\n"
                f"- Trạng thái: {status_text}\n"
                f"- Tiêu đề: {ch.get('title')}\n"
                f"- Mô tả/Dàn ý: {ch.get('description')}\n"
                f"- Nội dung hiện tại (Độ dài: {len(ch.get('content', ''))} ký tự):\n"
                f"{ch.get('content') or 'Chương này đang trống, chưa được viết nội dung.'}\n\n"
            )
            
            # Gắn thêm một dòng tóm tắt các chương khác để AI không bị mất bối cảnh tổng thể
            other_chapters = [str(c['chapterNumber']) for c in chapters if c['chapterNumber'] != target_num]
            if other_chapters:
                content += f"--- BỐI CẢNH TỔNG THỂ ---\nSách có tổng cộng {len(chapters)} chương. Các chương khác gồm: {', '.join(other_chapters)}."
        else:
            content = f"Không tìm thấy chương {target_num} trong dàn ý."
    else:
        # Fallback: Trả về mục lục nếu không có target nào xác định được
        content = f"--- DÀN Ý TÓM TẮT ({len(chapters)} Chương) ---\n"
        for ch in chapters:
            content += f"- Chương {ch.get('chapterNumber')}: {ch.get('title')} (Mô tả: {ch.get('description')})\n"

    # 3. Ghi đè tin nhắn thủ công để bảo toàn Context
    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=content
        )
    )

    return state