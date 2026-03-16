# main.py
import os
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from auth_context import current_auth_token

# Import graph đã được compile từ hệ thống thư mục mới của bạn
# Giả sử bạn đặt graph tại src/lib/graph.py
from graph import graph

# 1. Khởi tạo FastAPI app
app = FastAPI(
    title="eBook AI Agent - AG-UI Server",
    description="Hệ thống điều phối AI Agent hỗ trợ viết sách chuyên nghiệp."
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
# 3. Đăng ký Endpoint LangGraph qua giao thức AG-UI
# Endpoint này sẽ tự động xử lý:
# - Streaming văn bản (Token-by-token)
# - Streaming Tool Call arguments
# - Đồng bộ State (State Sync)
# - Quản lý Thread (Conversation history)
add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="default", # ID này phải khớp với id ở phía NestJS/Frontend
        description="Agent biên tập sách thông minh, hỗ trợ lập dàn ý và soạn thảo.",
        graph=graph, # Đối tượng CompiledGraph từ src/lib/graph.py
    ),
    path="/book-agent", # URL: http://localhost:8000/langgraph-agent
)


# 4. Route kiểm tra trạng thái (Health Check)
# Thêm vào main.py
@app.get("/book-agent/info")
def agent_info():
    return {
        "agents": [
            {
                "name": "default",
                "description": "Agent biên tập sách thông minh.",
            }
        ]
    }

# 5. Khởi chạy Server
def main():
    """Hàm chạy uvicorn server."""
    # Lấy port từ env hoặc mặc định 8000
    port = int(os.getenv("PORT", "8000"))
    
    print("\n" + "="*50)
    print(f"🚀 AG-UI Agent Server đang khởi động tại:")
    print(f"🔗 URL: http://0.0.0.0:{port}/langgraph-agent")
    print("="*50 + "\n")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
    )

if __name__ == "__main__":
    main()