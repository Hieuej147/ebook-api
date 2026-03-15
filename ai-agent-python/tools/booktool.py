from pydantic import BaseModel, Field
from typing import List, cast, Literal, Optional
from langchain_core.tools import tool
from langchain_core.messages import AIMessage, ToolMessage, SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from copilotkit.langchain import copilotkit_emit_state, copilotkit_customize_config
from state import AgentState
from config import get_model
from langgraph.types import interrupt


class ChapterSchema(BaseModel):
    chapterNumber: int = Field(..., description="Số thứ tự chương")
    title: str = Field(..., description="Tiêu đề chương")
    description: str = Field(..., description="Mô tả nội dung")
    content: str = Field(default="", description="Nội dung chương (để rỗng khi lập dàn ý)")

class UpdateBookOutlineInput(BaseModel):
    chapters: List[ChapterSchema] = Field(
        description="Danh sách các chương để cập nhật vào dàn ý cuốn sách."
    )

@tool("update_book_outline", args_schema=UpdateBookOutlineInput)
def update_book_outline(chapters: List[ChapterSchema]):
    """
    Cập nhật hoặc khởi tạo dàn ý cho cuốn sách. 
    Gọi tool này sau khi bạn đã thiết kế xong bố cục các chương.
    """
    pass

async def outline_node(state: AgentState, config: RunnableConfig):
    # 1. Lấy tin nhắn và tool call cuối cùng từ LLM
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]

    # 2. Lấy danh sách chapters từ LLM trả về
    chapters_data = args.get("chapters", [])

    # 3. Lấy object sách hiện tại (để KHÔNG LÀM MẤT title, author, topic...)
    book = state.get("book", {})
    book["chapters"] = chapters_data  # Ghi đè/cập nhật riêng danh sách chương
    
    # Cập nhật tạm thời vào state để emit cho frontend
    state["book"] = book

    # 4. Ghi log cho Frontend hiển thị
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"📝 Đã cập nhật dàn ý sách với {len(chapters_data)} chương.",
        "done": True
    })
    
    # 5. Phát state mới nhất sang Frontend UI
    await copilotkit_emit_state(config, state)

    state["logs"] = []
    await copilotkit_emit_state(state,config)

    # 6. Trả về đúng format dict cho LangGraph Reducer

    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"Dàn ý đã được cập nhật thành công với {len(chapters_data)} chương. Hãy hỏi người dùng xem họ có muốn sửa gì không."
        )
    )
    return state


class EditChapterAction(BaseModel):
    action: Literal["add", "update", "delete"] = Field(..., description="Hành động: 'add' (thêm), 'update' (sửa), hoặc 'delete' (xóa)")
    # Cho phép bỏ trống nếu là thêm mới
    chapterNumber: Optional[int] = Field(None, description="Số thứ tự chương. Bắt buộc với 'update'/'delete'. Bỏ trống nếu 'add' để thêm vào cuối sách.")
    title: Optional[str] = Field(None, description="Tiêu đề mới (Bắt buộc nếu add/update)")
    description: Optional[str] = Field(None, description="Mô tả mới (Bắt buộc nếu add/update)")

class EditOutlineInput(BaseModel):
    actions: List[EditChapterAction] = Field(
        description="Danh sách các thao tác thêm, sửa, hoặc xóa chương trong dàn ý."
    )

@tool("edit_book_outline", args_schema=EditOutlineInput)
def edit_book_outline(actions: List[EditChapterAction]):
    """
    Chỉnh sửa dàn ý hiện tại (Thêm, sửa, hoặc xóa các chương cụ thể).
    - MẸO QUAN TRỌNG: Nếu user yêu cầu "Gợi ý/tạo thêm chương mới", hãy dùng action 'add' với title và description, BỎ TRỐNG chapterNumber để tự động nối vào cuối sách.
    """
    pass

async def edit_outline_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    actions = args.get("actions", [])

    book = state.get("book", {})
    current_chapters = book.get("chapters", [])

    # Duyệt qua từng hành động của AI
    for act in actions:
        action_type = act.get("action")
        c_num = act.get("chapterNumber")
        
        if action_type == "delete":
            if c_num is not None:
                # Lọc bỏ chương có số thứ tự trùng với c_num
                current_chapters = [ch for ch in current_chapters if ch["chapterNumber"] != c_num]
        
        elif action_type == "update":
            if c_num is not None:
                for ch in current_chapters:
                    if ch["chapterNumber"] == c_num:
                        if act.get("title"): 
                            ch["title"] = act.get("title")
                        if act.get("description"): 
                            ch["description"] = act.get("description")
                            
        elif action_type == "add":
            new_chapter = {
                "title": act.get("title", "Chương mới"),
                "description": act.get("description", ""),
                "content": "",
                # Nếu AI truyền c_num, chèn vào vị trí đó. Nếu bỏ trống, gán vô cực để đẩy xuống cuối mảng
                "chapterNumber": c_num if c_num is not None else float('inf')
            }
            current_chapters.append(new_chapter)

    # BƯỚC QUAN TRỌNG 1: Sắp xếp lại mảng theo chapterNumber
    current_chapters.sort(key=lambda x: x["chapterNumber"])
    
    # BƯỚC QUAN TRỌNG 2: Re-index (Đánh số lại từ 1 đến N)
    # Giúp số thứ tự luôn liền mạch (1, 2, 3...) dù có thêm hay xóa ở giữa
    for idx, ch in enumerate(current_chapters):
        ch["chapterNumber"] = idx + 1
        
    book["chapters"] = current_chapters
    state["book"] = book
    
    # Ghi log
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"✏️ Đã chỉnh sửa/thêm {len(actions)} mục trong dàn ý.",
        "done": True
    })
    
    # (Giả định bạn có hàm copilotkit_emit_state, nếu không cứ giữ nguyên code cũ của bạn)
    await copilotkit_emit_state(config, state)

    # Nối message
    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"Đã thực hiện xong. Dàn ý hiện tại có {len(current_chapters)} chương được đánh số thứ tự liền mạch."
        )
    )

    return state



class WriteChapterInput(BaseModel):
    chapterNumber: int = Field(..., description="Số thứ tự của chương cần viết.")
    focus_guidelines: str = Field(default="", description="Ghi chú thêm về phong cách hoặc điểm cần nhấn mạnh cho chương này (nếu có).")

@tool("write_chapter_content", args_schema=WriteChapterInput)
def write_chapter_content(chapterNumber: int, focus_guidelines: str = ""):
    """
    Giao việc cho AI Writer để tổng hợp sources và viết nội dung chi tiết cho một chương.
    Chỉ gọi khi đã có dàn ý (outline) và đủ tài liệu tham khảo (sources).
    """
    pass

class WriteContentInput(BaseModel):
    content: str = Field(..., description="Toàn bộ nội dung bài viết.")

# Ép cứng tên tool là "write_content" (chữ thường)
@tool("write_content", args_schema=WriteContentInput)
def write_content(content: str):
    """use this tool write content for chapter"""
    pass


async def write_chapter_node(state: AgentState, config: RunnableConfig):
    # --- 1. LẤY THÔNG TIN AGENT CHÍNH ---
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    c_num = args.get("chapterNumber") or state.get("selectedChapterNumber", None)
    focus = args.get("focus_guidelines", "")

    book = state.get("book", {})
    target_chapter = next((ch for ch in book.get("chapters", []) if ch["chapterNumber"] == c_num), None)
    
    if not target_chapter:
        return {"messages": [ToolMessage(tool_call_id=tool_call["id"], content=f"Lỗi: Không tìm thấy chương {c_num}")]}

    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"⏳ Đang viết nội dung cho chương {c_num}...",
        "done": False
    })
    await copilotkit_emit_state(config, state)
    
    sources = state.get("sources", {})
    sources_text_parts = []
    for url, data in sources.items():
        # 1. Lấy bản tóm tắt (từ search_node)

        title_content = str(data.get('title',''))

        summary_content = str(data.get('content', 'Không có thông tin tóm tắt.'))
        
        # 2. Lấy bản chi tiết (từ extract_node), nếu chưa cào thì để mặc định
        raw_content = str(data.get('raw_content', 'Khong co nội dung chi tiết'))
        
        # 3. Giới hạn độ dài để không làm nổ Token Context của LLM
        # Tuỳ vào model bạn dùng mà có thể tăng/giảm con số này
        summary_truncated = summary_content[:1000] + ("..." if len(summary_content) > 1000 else "")
        raw_truncated = raw_content[:4000] + ("..." if len(raw_content) > 4000 else "")
        
        # 4. Gom cả 2 vào chung một khối tài liệu
        sources_text_parts.append(
            f"--- NGUỒN TÀI LIỆU TỪ URL: {url} ---\n"
            f"[TITLE cua nguon]: {title_content}"
            f"[TÓM TẮT TỪ SEARCH]:\n{summary_truncated}\n\n"
            f"[NỘI DUNG CHI TIẾT TỪ EXTRACT]:\n{raw_truncated}\n"
        )

    sources_text = "\n\n".join(sources_text_parts)
    
    # Cảnh báo cho AI nếu không có bất kỳ tài liệu nào
    if not sources_text.strip():
        sources_text = "CẢNH BÁO: Hiện tại không có tài liệu tham khảo nào trong bộ nhớ. Hãy dựa vào kiến thức nền tảng của bạn hoặc yêu cầu người dùng cho phép tìm kiếm thêm."

    writer_system_prompt = f"""Bạn là một tác giả sách chuyên nghiệp. Hãy viết nội dung chi tiết cho Chương {c_num}: {target_chapter.get('title', 'Không có tiêu đề')}.

Dàn ý chương: {target_chapter.get('description', 'Không có mô tả')}
Ghi chú thêm: {focus}

Tài liệu tham khảo:
{sources_text}

--- YÊU CẦU VỀ TRÌNH BÀY (MARKDOWN FORMATTING) ---
Hãy trình bày nội dung chương sách thật chuyên nghiệp, dễ đọc và có tính thẩm mỹ cao bằng cách sử dụng linh hoạt các thẻ Markdown:
- Headings: Dùng `##` cho phần chính, `###` cho phần phụ. KHÔNG dùng `#`.
- Text: Dùng **in đậm** cho từ khóa quan trọng/nhân vật mới; *in nghiêng* cho suy nghĩ/từ ngoại ngữ/nhấn mạnh.
- Trích dẫn: Dùng `> ` cho thơ, châm ngôn, hoặc lời trích dẫn quan trọng.
- Liệt kê: Dùng `-` hoặc `1. ` khi cần liệt kê thay vì viết đoạn văn dài.
- Ngắt cảnh: Dùng `---` để chuyển cảnh hoặc ngắt mạch thời gian.
- Khoảng trắng: Luôn có 1 dòng trống giữa các đoạn văn và các phần khác nhau.

YÊU CẦU CUỐI CÙNG VÀ QUAN TRỌNG NHẤT:
Bạn BẮT BUỘC phải sử dụng công cụ `write_content` để trả về toàn bộ nội dung bài viết."""

    # Lấy tin nhắn cuối của User để Sub-agent biết ngữ cảnh hỏi
    last_user_msg = next((m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None)
    sub_messages = [SystemMessage(content=writer_system_prompt)]
    if last_user_msg:
        sub_messages.append(last_user_msg)
    
    hidden_config = copilotkit_customize_config(
        config, 
        emit_messages=False, 
        emit_tool_calls=False # <-- Quan trọng nhất: chặn stream tool calls
    )
 
    # --- 4. GỌI SUB-AGENT THỰC THI ---
    model = get_model(state)

    ainvoke_kwargs = {}
    if model.__class__.__name__ in ["ChatOpenAI"]:
        ainvoke_kwargs["parallel_tool_calls"] = False
    
    # AI sẽ bắt đầu stream vào stream_key ngay tại đây
    model_with_tools = model.bind_tools([write_content], tool_choice="write_content", **ainvoke_kwargs)
    response = await model_with_tools.ainvoke(sub_messages, hidden_config)
    generated_content = response.tool_calls[0]["args"]["content"]

    # --- 5. CẬP NHẬT STATE ---
    target_chapter["content"] = generated_content
    state["book"] = book

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"Đã viết xong chương {c_num}. Nội dung dài {len(generated_content)} ký tự đã được lưu vào bộ nhớ sách."
        )
    )

    return state





class EditChapterContentInput(BaseModel):
    chapterNumber: int = Field(..., description="Số thứ tự của chương cần chỉnh sửa.")
    search_text: str = Field(
        ..., 
        description="Đoạn văn bản gốc trong bài cần được thay thế (phải copy chính xác 100%)."
    )
    replacement_text: str = Field(
        ...,
        description="Đoạn văn bản MỚI do bạn viết ra để thay thế cho đoạn cũ."
    )

@tool("edit_chapter_content", args_schema=EditChapterContentInput)
def edit_chapter_content(chapterNumber: int, search_text: str, replacement_text: str):
    """
    Thay thế cục bộ một đoạn văn trong chương. 
    Lưu ý: Hành động này sẽ TẠM DỪNG hệ thống để xin phép người dùng. Hệ thống chỉ cập nhật khi người dùng đồng ý.
    """
    pass

async def edit_chapter_content_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]

    c_num = args.get("chapterNumber") or state.get("selectedChapterNumber")
    search_text = args.get("search_text", "")
    replacement_text = args.get("replacement_text", "")

    book = state.get("book", {})
    chapters = book.get("chapters", [])
    
    # 1. Kiểm tra chương
    target_chapter = next((ch for ch in chapters if ch.get("chapterNumber") == c_num), None)
    
    if not target_chapter or not target_chapter.get("content"):
        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"], 
                name=tool_call["name"],
                content=f"Lỗi: Chương {c_num} chưa có nội dung."
            )
        )
        return {"messages": state["messages"]}

    current_content = target_chapter["content"]

    # 2. Kiểm tra đoạn text cần vá có tồn tại không
    if not search_text or search_text not in current_content:
        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"], 
                name=tool_call["name"],
                content=f"Lỗi: Không tìm thấy đoạn văn bản cũ trong bản thảo để thay thế. Vui lòng copy chính xác 100%."
            )
        )
        return {"messages": state["messages"]}

    # --- 3. BẮT ĐẦU HUMAN-IN-THE-LOOP (TẠM DỪNG GRAPH) ---
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"✋ Đang chờ bạn phê duyệt thay đổi ở Chương {c_num}...", 
        "done": False
    })
    await copilotkit_emit_state(config, state)

    # Lệnh interrupt sẽ đóng băng luồng chạy tại đây và gửi object này ra ngoài UI
    user_approval = interrupt({
        "type": "edit_approval",
        "chapter": c_num,
        "old_text": search_text,
        "new_text": replacement_text
    })

    # --- 4. XỬ LÝ KẾT QUẢ KHI GRAPH ĐƯỢC RESUME ---
    is_approved = str(user_approval).lower() in ["yes", "true", "ok", "approve", "có", "đồng ý"]

    if is_approved:
        # User ĐỒNG Ý -> Thực hiện thay thế và lưu State
        new_content = current_content.replace(search_text, replacement_text)
        target_chapter["content"] = new_content
        state["book"] = book
        
        state["logs"][-1]["done"] = True
        state["logs"].append({"message": f"✅ Bạn đã DUYỆT. Đã cập nhật Chương {c_num}.", "done": True})
        await copilotkit_emit_state(config, state)

        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"],
                name=tool_call["name"],
                content=f"Người dùng đã ĐỒNG Ý. Nội dung mới đã được cập nhật thành công."
            )
        )
    else:
        # User TỪ CHỐI -> Giữ nguyên State, chỉ báo lại cho AI
        state["logs"][-1]["done"] = True
        state["logs"].append({"message": f"❌ Bạn đã TỪ CHỐI thay đổi ở Chương {c_num}.", "done": True})
        await copilotkit_emit_state(config, state)

        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"],
                name=tool_call["name"],
                content=f"Người dùng ĐÃ TỪ CHỐI bản chỉnh sửa này. Hãy hỏi xem họ muốn điều chỉnh cụ thể như thế nào."
            )
        )

    return state


BOOK_TOOLS = [
    update_book_outline,
    edit_book_outline,
    write_chapter_content,
    edit_chapter_content,
]

BOOK_NODES = {
    "outline_node": outline_node,
    "edit_outline_node": edit_outline_node,
    "write_chapter_node": write_chapter_node,
    "edit_chapter_content_node": edit_chapter_content_node,
}

BOOK_ROUTING = {
    "update_book_outline": "outline_node",
    "edit_book_outline": "edit_outline_node",
    "write_chapter_content": "write_chapter_node",
    "edit_chapter_content": "edit_chapter_content_node",
}