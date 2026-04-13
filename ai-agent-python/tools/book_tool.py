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
    chapterNumber: int = Field(..., description="Sequential chapter number")
    title: str = Field(..., description="Chapter title")
    description: str = Field(..., description="Description of the chapter's content")
    content: str = Field(default="", description="Chapter content (leave empty when initializing the outline)")


class UpdateBookOutlineInput(BaseModel):
    chapters: List[ChapterSchema] = Field(
        description="List of chapters to update in the book's outline."
    )


@tool("update_book_outline", args_schema=UpdateBookOutlineInput)
def update_book_outline(chapters: List[ChapterSchema]):
    """
    Updates or initializes the book's outline. 
    Call this tool after you have finalized the design of the chapter layout.
    """
    pass


async def outline_node(state: AgentState, config: RunnableConfig):
    # 1. Retrieve the latest AI message and tool call
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]

    # 2. Extract the list of chapters returned by the LLM
    chapters_data = args.get("chapters", [])

    # 3. Fetch the current book object (to PRESERVE title, author, topic, etc.)
    book = state.get("book", {})
    book["chapters"] = chapters_data  # Overwrite/update only the chapters list
    
    # Temporarily update the state to emit to the frontend
    state["book"] = book

    # 4. Record logs for the Frontend UI
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"📝 Successfully updated the book outline with {len(chapters_data)} chapters.",
        "done": True
    })
    
    # 5. Emit the latest state to the Frontend UI
    await copilotkit_emit_state(config, state)

    # Clear logs before the next cycle
    state["logs"] = []
    await copilotkit_emit_state(config, state)

    # 6. Append the tool response for the LangGraph Reducer
    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"The outline has been successfully updated with {len(chapters_data)} chapters. Please ask the user if they would like to make any adjustments."
        )
    )
    return state


class EditChapterAction(BaseModel):
    action: Literal["add", "update", "delete"] = Field(..., description="Action type: 'add', 'update', or 'delete'")
    chapterNumber: Optional[int] = Field(None, description="Sequential chapter number. Required for 'update' or 'delete'. Leave empty for 'add' to append to the end of the book.")
    title: Optional[str] = Field(None, description="New title (Required for 'add' or 'update')")
    description: Optional[str] = Field(None, description="New description (Required for 'add' or 'update')")


class EditOutlineInput(BaseModel):
    actions: List[EditChapterAction] = Field(
        description="List of actions to add, edit, or delete chapters in the current outline."
    )


@tool("edit_book_outline", args_schema=EditOutlineInput)
def edit_book_outline(actions: List[EditChapterAction]):
    """
    Edits the current outline (Add, update, or delete specific chapters).
    - CRITICAL TIP: If the user requests to "suggest/create a new chapter", use the 'add' action with a title and description, leaving 'chapterNumber' EMPTY to automatically append it to the end of the book.
    """
    pass


async def edit_outline_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    actions = args.get("actions", [])

    book = state.get("book", {})
    current_chapters = book.get("chapters", [])

    # Process each action requested by the AI
    for act in actions:
        action_type = act.get("action")
        c_num = act.get("chapterNumber")
        
        if action_type == "delete":
            if c_num is not None:
                # Filter out the chapter matching the specified number
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
                "title": act.get("title", "New Chapter"),
                "description": act.get("description", ""),
                "content": "",
                # Insert at the specified position. If none provided, use infinity to push to the end
                "chapterNumber": c_num if c_num is not None else float('inf')
            }
            current_chapters.append(new_chapter)

    # CRITICAL STEP 1: Sort the array based on chapterNumber
    current_chapters.sort(key=lambda x: x["chapterNumber"])
    
    # CRITICAL STEP 2: Re-index (Renumber from 1 to N)
    # Ensures chapter numbers remain perfectly sequential (1, 2, 3...) regardless of insertions/deletions
    for idx, ch in enumerate(current_chapters):
        ch["chapterNumber"] = idx + 1
        
    book["chapters"] = current_chapters
    state["book"] = book
    
    # Record logs
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"✏️ Successfully processed {len(actions)} modifications in the outline.",
        "done": True
    })
    
    await copilotkit_emit_state(config, state)

    # Append the tool response
    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"Execution complete. The current outline now contains {len(current_chapters)} sequentially numbered chapters."
        )
    )

    return state


class WriteChapterInput(BaseModel):
    chapterNumber: int = Field(..., description="The sequential number of the chapter to be written.")
    focus_guidelines: str = Field(default="", description="Additional notes regarding writing style or specific points to emphasize for this chapter (if any).")


@tool("write_chapter_content", args_schema=WriteChapterInput)
def write_chapter_content(chapterNumber: int, focus_guidelines: str = ""):
    """
    Delegates the task to the AI Writer to synthesize sources and draft detailed content for a specific chapter.
    Only invoke this tool when the outline is confirmed and sufficient reference materials (sources) are available.
    """
    pass


class WriteContentInput(BaseModel):
    content: str = Field(..., description="The complete written content of the chapter.")


@tool("write_content", args_schema=WriteContentInput)
def write_content(content: str):
    """Use this tool to submit the final written content for the chapter."""
    pass


async def write_chapter_node(state: AgentState, config: RunnableConfig):
    # --- 1. EXTRACT MAIN AGENT CONTEXT ---
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    c_num = args.get("chapterNumber") or state.get("selectedChapterNumber", None)
    focus = args.get("focus_guidelines", "")

    book = state.get("book", {})
    target_chapter = next((ch for ch in book.get("chapters", []) if ch["chapterNumber"] == c_num), None)
    
    if not target_chapter:
        return {"messages": [ToolMessage(tool_call_id=tool_call["id"], content=f"Error: Chapter {c_num} could not be found.")]}

    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"⏳ Drafting content for Chapter {c_num}...",
        "done": False
    })
    await copilotkit_emit_state(config, state)
    
    # --- 2. PREPARE REFERENCE MATERIALS ---
    sources = state.get("sources", {})
    sources_text_parts = []
    for url, data in sources.items():
        # Retrieve summaries (from search_node)
        title_content = str(data.get('title', ''))
        summary_content = str(data.get('content', 'No summary available.'))
        
        # Retrieve detailed content (from extract_node)
        raw_content = str(data.get('raw_content', 'No detailed content available.'))
        
        # Truncate to prevent exceeding the LLM's token context window
        summary_truncated = summary_content[:1000] + ("..." if len(summary_content) > 1000 else "")
        raw_truncated = raw_content[:4000] + ("..." if len(raw_content) > 4000 else "")
        
        # Combine into a structured document block
        sources_text_parts.append(
            f"--- SOURCE URL: {url} ---\n"
            f"[SOURCE TITLE]: {title_content}\n"
            f"[SEARCH SUMMARY]:\n{summary_truncated}\n\n"
            f"[EXTRACTED DETAIL]:\n{raw_truncated}\n"
        )

    sources_text = "\n\n".join(sources_text_parts)
    
    # Warn the AI if no reference materials are available
    if not sources_text.strip():
        sources_text = "WARNING: There are currently no reference materials in memory. Please rely on your fundamental knowledge or ask the user for permission to conduct a search."

    # --- 3. CONSTRUCT THE WRITER PROMPT ---
    # --- 3. CONSTRUCT THE WRITER PROMPT ---
    writer_system_prompt = f"""You are a master NOVELIST and creative writer. Your task is to write the manuscript for Chapter {c_num}: {target_chapter.get('title', 'Untitled')}.

Chapter Outline/Beats: {target_chapter.get('description', 'No description provided')}
Additional Guidelines: {focus}

Reference Materials:
{sources_text}

--- CRITICAL NARRATIVE RULES (MUST FOLLOW) ---
1. SHOW, DON'T TELL: Do not summarize the plot or analyze the characters' feelings. Immerse the reader in the scene. Describe sensory details (sight, sound, touch), specific actions, and the environment. 
2. DIALOGUE & INTERACTION: Drive the story forward through character dialogue and active scenes, not inner monologues or historical summaries.
3. NO ESSAY STRUCTURES: NEVER use headings like "Introduction", "Khám Phá", "Kết Luận", or "Summary". Write seamlessly from paragraph to paragraph like a real fiction book.
4. PACING: Expand on the points in the outline. Turn a simple sentence from the outline into a full, vivid scene.

--- FORMATTING REQUIREMENTS (MARKDOWN) ---
- Use `*italics*` for inner thoughts or emphasis.
- Use `---` for scene breaks or time skips.
- Maintain one blank line between paragraphs.

CRITICAL AND FINAL REQUIREMENT:
You MUST use the `write_content` tool to return the complete finalized content."""

    # Provide context of the user's last message to the Sub-agent
    last_user_msg = next((m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None)
    sub_messages = [SystemMessage(content=writer_system_prompt)]
    if last_user_msg:
        sub_messages.append(last_user_msg)
    
    # Crucial step: Prevent streaming tool calls to the frontend prematurely
    hidden_config = copilotkit_customize_config(
        config, 
        emit_messages=False, 
        emit_tool_calls=False
    )
 
    # --- 4. EXECUTE SUB-AGENT ---
    model = get_model(state)

    ainvoke_kwargs = {}
    if model.__class__.__name__ in ["ChatOpenAI"]:
        ainvoke_kwargs["parallel_tool_calls"] = False
    
    # Bind the specific submission tool and enforce its usage
    model_with_tools = model.bind_tools([write_content], tool_choice="write_content", **ainvoke_kwargs)
    response = await model_with_tools.ainvoke(sub_messages, hidden_config)
    generated_content = response.tool_calls[0]["args"]["content"]

    # --- 5. UPDATE STATE ---
    target_chapter["content"] = generated_content
    state["book"] = book

    state["logs"][-1]["done"] = True
    await copilotkit_emit_state(config, state)

    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=f"Successfully drafted Chapter {c_num}. The generated content length is {len(generated_content)} characters and has been stored in memory."
        )
    )

    return state


class EditChapterContentInput(BaseModel):
    chapterNumber: int = Field(..., description="The sequence number of the chapter to be edited.")
    search_text: str = Field(
        ..., 
        description="The exact original text snippet in the chapter that needs replacing (must be a 100% exact match)."
    )
    replacement_text: str = Field(
        ...,
        description="The NEW text snippet you have authored to replace the original text."
    )


@tool("edit_chapter_content", args_schema=EditChapterContentInput)
def edit_chapter_content(chapterNumber: int, search_text: str, replacement_text: str):
    """
    Locally replaces a specific text segment within a chapter. 
    Note: This action triggers a SYSTEM PAUSE to request user approval. The document will only update upon user consent.
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
    
    # 1. Validate the existence of the chapter
    target_chapter = next((ch for ch in chapters if ch.get("chapterNumber") == c_num), None)
    
    if not target_chapter or not target_chapter.get("content"):
        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"], 
                name=tool_call["name"],
                content=f"Error: Chapter {c_num} does not currently have any content."
            )
        )
        return {"messages": state["messages"]}

    current_content = target_chapter["content"]

    # 2. Validate the existence of the text targeted for replacement
    if not search_text or search_text not in current_content:
        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"], 
                name=tool_call["name"],
                content=f"Error: Could not locate the original text snippet in the manuscript. Please ensure a 100% exact copy."
            )
        )
        return {"messages": state["messages"]}

    # --- 3. INITIATE HUMAN-IN-THE-LOOP (FREEZE GRAPH) ---
    state["logs"] = state.get("logs", [])
    state["logs"].append({
        "message": f"✋ Awaiting your approval for modifications in Chapter {c_num}...", 
        "done": False
    })
    await copilotkit_emit_state(config, state)

    # The interrupt command freezes the execution thread here and emits this object to the UI
    user_approval = interrupt({
        "type": "edit_approval",
        "chapter": c_num,
        "old_text": search_text,
        "new_text": replacement_text
    })

    # --- 4. PROCESS RESULT UPON GRAPH RESUMPTION ---
    # Supporting both English and Vietnamese affirmative inputs for flexibility
    is_approved = str(user_approval).lower() in ["yes", "true", "ok", "approve", "có", "đồng ý"]

    if is_approved:
        # User APPROVED -> Execute replacement and persist State
        new_content = current_content.replace(search_text, replacement_text)
        target_chapter["content"] = new_content
        state["book"] = book
        
        state["logs"][-1]["done"] = True
        state["logs"].append({"message": f"✅ Approved. Chapter {c_num} has been successfully updated.", "done": True})
        await copilotkit_emit_state(config, state)

        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"],
                name=tool_call["name"],
                content=f"The user has APPROVED. The new content was successfully updated."
            )
        )
    else:
        # User REJECTED -> Maintain current State, notify AI
        state["logs"][-1]["done"] = True
        state["logs"].append({"message": f"❌ You REJECTED the modifications for Chapter {c_num}.", "done": True})
        await copilotkit_emit_state(config, state)

        state["messages"].append(
            ToolMessage(
                tool_call_id=tool_call["id"],
                name=tool_call["name"],
                content=f"The user has REJECTED this edit. Please ask them how they would prefer to adjust the text."
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