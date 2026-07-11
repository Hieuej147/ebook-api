from typing import List, TypedDict, Optional, Annotated, Dict, Union
from langgraph.graph import MessagesState
from copilotkit import CopilotKitState
from langgraph.graph.message import add_messages


# 1. Những gì nhận vào từ FE
class InputState(CopilotKitState):
    user_request: str

# 2. Những gì trả về cho FE (Dùng cho useAgent hook)
class OutputState(CopilotKitState):
    sections: List[dict]
    logs: List[dict]


class Chapter(TypedDict):
    chapterNumber: int
    title: str
    description: str
    content: Optional[str]

class Book(TypedDict, total=False): # total=False cho phép các field có thể bị thiếu lúc khởi tạo
    title: str
    author: str         # FE phải có trường này
    topic: Optional[str]
    writingStyle: str
    chapters: List[Chapter]

class Log(TypedDict):
    message: str
    done: bool

class Source(TypedDict, total=False):
    url: str
    title: str
    content: str
    raw_content: str 
    score: float
class AgentState(CopilotKitState):
    book: Book
    selectedChapterNumber: int
    sources: Dict[str, Source]
    logs: List[Log]
    active_worker: str
    