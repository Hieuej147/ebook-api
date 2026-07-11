import os
import jwt
from typing import cast
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command

from copilotkit.langchain import copilotkit_customize_config
from state import AgentState
from config import get_model
from auth_context import current_auth_token

# 1. Define the Router Tool to force structured output from the LLM
class SupervisorRouter(BaseModel):
    """Use this tool to make an accurate routing decision."""
    reasoning: str = Field(description="Brief reasoning for why this agent was chosen based on the user's message.")
    next_agent: str = Field(description="The target agent: 'book_agent' or 'stats_agent'")

def build_supervisor_prompt(state: AgentState) -> str:
    """Build a prompt focused on intent analysis."""
    frontend_actions = state.get("copilotkit", {}).get("actions", [])
    
    # Identify UI context to assist the LLM's decision making
    ui_context = ""
    if frontend_actions:
        ui_context = "\n--- CURRENT UI CONTEXT ---\n"
        ui_context += "The user is currently on a page with the following tools available:\n"
        for action in frontend_actions:
            ui_context += f"- {action.get('name')}: {action.get('description', '')}\n"

    return f"""You are an intelligent Supervisor. Your task is to analyze the user's request and route it to the most appropriate Agent.

AVAILABLE AGENTS:
- book_agent: Handles everything related to writing, outlines, content research, and chapter editing.
- stats_agent: Handles business analytics, revenue, orders, Todo list management, and Dashboard updates.
{ui_context}
ROUTING RULES:
1. If the user wants to update the UI (e.g., 'update dashboard', 'add todo'), prioritize stats_agent.
2. If the user asks about book content or writing, choose book_agent.
3. You MUST use the SupervisorRouter tool to respond. Do not reply with plain text.
"""

async def supervisor_node(state: AgentState, config: RunnableConfig):
    """Supervisor node relying entirely on the LLM, without the Fast Route."""
    
    # Check authentication
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

    # Initialize the model
    model = get_model(state)
    
    # Configure to hide intermediate reasoning steps (tool calls) from the UI
    hidden_config = copilotkit_customize_config(
        config,
        emit_messages=False,
        emit_tool_calls=False,
    )

    # The LLM analyzes and makes the decision
    response = await model.bind_tools(
        [SupervisorRouter],
        tool_choice="SupervisorRouter",
    ).ainvoke(
        [
            SystemMessage(content=build_supervisor_prompt(state)),
            *state["messages"],
        ],
        hidden_config,
    )

    ai_message = cast(AIMessage, response)
    
    # Extract the target agent from the tool call
    next_agent = "book_agent" # Default fallback
    if ai_message.tool_calls:
        args = ai_message.tool_calls[0]["args"]
        next_agent = args.get("next_agent", "book_agent")
        print(f"🎯 LLM Routing: {next_agent} | Reason: {args.get('reasoning')}")

    # Execute the routing command in the Graph
    return Command(goto=next_agent)