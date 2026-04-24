"""
This module provides a function to get a model based on the configuration.
"""

import os
from typing import Any, cast

from langchain_core.language_models.chat_models import BaseChatModel

from state import AgentState


def get_model(state: AgentState) -> BaseChatModel:
    """
    Get a model based on the environment variable.
    """

    state_model = state.get("model", "openai")
    model = os.getenv("MODEL", state_model)

    print(f"Using model: {model}")

    if model == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(temperature=0, model="gpt-4o-mini")

    raise ValueError("Invalid model specified")