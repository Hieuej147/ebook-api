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
        description="The sequence number of the chapter to view. If left blank, the system will automatically return the information of the chapter the user is currently selecting on the interface."
    )

@tool("view_chapter_details", args_schema=ViewChapterInput)
def view_chapter_details(chapterNumber: Optional[int] = None):
    """
    Use this tool to view the detailed content and outline of a specific chapter, 
    especially useful for identifying which chapter the user is currently working on.
    """
    pass

async def view_chapter_node(state: AgentState, config: RunnableConfig):
    ai_message = cast(AIMessage, state["messages"][-1])
    tool_call = ai_message.tool_calls[0]
    args = tool_call["args"]
    
    # 1. Prioritize the chapter number requested by the AI. If none is requested (None) -> Use the chapter number selected by the user on the UI
    requested_num = args.get("chapterNumber")
    selected_num = state.get("selectedChapterNumber")
    
    target_num = requested_num if requested_num is not None else selected_num

    book = state.get("book", {})
    chapters = book.get("chapters", [])

    # 2. Process logic to return the appropriate information
    content = ""
    if not chapters:
        content = "Currently, the book has no outline or chapters created."
    elif target_num is not None:
        # Find details of the target chapter
        ch = next((c for c in chapters if c.get("chapterNumber") == target_num), None)
        if ch:
            is_active_chapter = (target_num == selected_num)
            status_text = "THIS IS THE CHAPTER THE USER IS CURRENTLY SELECTING ON THE UI." if is_active_chapter else "This is the chapter you requested to view."
            
            content = (
                f"--- INFORMATION FOR CHAPTER {target_num} ---\n"
                f"- Status: {status_text}\n"
                f"- Title: {ch.get('title')}\n"
                f"- Description/Outline: {ch.get('description')}\n"
                f"- Current content (Length: {len(ch.get('content', ''))} characters):\n"
                f"{ch.get('content') or 'This chapter is currently empty and has no written content.'}\n\n"
            )
            
            # Append a summary line of the other chapters so the AI maintains the overall context
            other_chapters = [str(c['chapterNumber']) for c in chapters if c['chapterNumber'] != target_num]
            if other_chapters:
                content += f"--- OVERALL CONTEXT ---\nThe book has a total of {len(chapters)} chapters. Other chapters include: {', '.join(other_chapters)}."
        else:
            content = f"Chapter {target_num} could not be found in the outline."
    else:
        # Fallback: Return the summary outline if no specific target can be determined
        content = f"--- SUMMARY OUTLINE ({len(chapters)} Chapters) ---\n"
        for ch in chapters:
            content += f"- Chapter {ch.get('chapterNumber')}: {ch.get('title')} (Description: {ch.get('description')})\n"

    # 3. Manually append the tool message to preserve the Context
    state["messages"].append(
        ToolMessage(
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
            content=content
        )
    )

    return state