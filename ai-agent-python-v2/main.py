# main.py
import os
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from langchain_core.runnables import RunnableConfig
from auth_context import current_auth_token
from checkpointer import create_checkpointer

from graph import create_agent_graph

DEFAULT_RECURSION_LIMIT = 12


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with create_checkpointer() as (checkpointer, persistence_info):
        app.state.checkpointer = checkpointer
        app.state.persistence_info = persistence_info

        graph = create_agent_graph(checkpointer)
        add_langgraph_fastapi_endpoint(
            app=app,
            agent=LangGraphAGUIAgent(
                name="dashboard",
                description="Agent biên tập sách thông minh, hỗ trợ lập dàn ý và soạn thảo.",
                graph=graph,
                config=RunnableConfig(recursion_limit=DEFAULT_RECURSION_LIMIT),
            ),
            path="/book-agent",
        )

        yield


app = FastAPI(
    title="eBook AI Agent - AG-UI Server",
    description="Hệ thống điều phối AI Agent hỗ trợ viết sách chuyên nghiệp.",
    lifespan=lifespan,
)

# 2. Cấu hình CORS (Cực kỳ quan trọng để NestJS và Browser không bị chặn)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        os.getenv("FRONTEND_URL", "http://localhost:3001"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    # Lưu vào request state để graph lấy được
    token = current_auth_token.set(auth_header)
    try:
        response = await call_next(request)
    finally:
        current_auth_token.reset(token)
    return response
@app.get("/book-agent/info")
def agent_info():
    return {
        "checkpointer": app.state.persistence_info,
        "agents": [
            {
                "name": "dashboard",
                "description": "Agent biên tập sách thông minh.",
            }
        ]
    }

# 5. Khởi chạy Server
def main():
    """Hàm chạy uvicorn server."""
    # Lấy port từ env hoặc mặc định 8001
    port = int(os.getenv("PORT", "8001"))
    
    print("\n" + "="*50)
    print(f"🚀 AG-UI Agent Server đang khởi động tại:")
    print(f"🔗 URL: http://0.0.0.0:{port}/book-agent")
    print("="*50 + "\n")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
    )

if __name__ == "__main__":
    main()
