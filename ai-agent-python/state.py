from typing import List, TypedDict, Optional, Annotated, Dict, Union
from langgraph.graph import MessagesState
from copilotkit import CopilotKitState
from langgraph.graph.message import add_messages



class InputState(CopilotKitState):
    user_request: str


class OutputState(CopilotKitState):
    sections: List[dict]
    logs: List[dict]


class Chapter(TypedDict):
    chapterNumber: int
    title: str
    description: str
    content: Optional[str]

class Book(TypedDict, total=False): 
    title: str
    author: str        
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
    worker_task: Optional[str]
    worker_report: Optional[str]
    active_worker: Optional[str]
    
