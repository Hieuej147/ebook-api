from graph import graph

def export_xray_graph():
    print("🚀 Đang xuất sơ đồ X-Ray...")
    try:
        # LƯU Ý CỰC KỲ QUAN TRỌNG: Phải có xray=True ở đây
        # Nếu muốn nhìn sâu hơn nữa (nếu có subgraph trong subgraph), dùng xray=2
        image_data = graph.get_graph(xray=1).draw_mermaid_png()
        
        file_name = "full_xray_system.png"
        with open(file_name, "wb") as f:
            f.write(image_data)
            
        print(f"✅ Thành công! Hãy mở file '{file_name}'")
    except Exception as e:
        print(f"❌ Lỗi: {e}")

if __name__ == "__main__":
    export_xray_graph()