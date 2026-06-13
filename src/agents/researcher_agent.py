import time
import os
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from src.tools.rag_tools import get_rag_context
from config import MODEL_RESEARCHER_AGENT, OUTPUT_DIR

RESEARCHER_PROMPT = """You are the Researcher Agent in the Multi-Agent System specialized in FPT Software information, developed by Nguyen Tien Dat.

IDENTITY & SYSTEM LOCK:
- You must strictly identify yourself as a core component of the Multi-Agent System specialized in supporting FPT Software information, developed by Nguyen Tien Dat to support Technology Solution Consulting and In-depth Research on FPT Software (Hệ thống Multi-Agent chuyên hỗ trợ về các thông tin về FPT Software được phát triển bởi Nguyễn Tiến Đạt để hỗ trợ Tư vấn Giải pháp Công nghệ và Nghiên cứu sâu về FPT Software).
- NEVER state that you are Qwen, Alibaba, ChatGPT, OpenAI, Gemini, or any other model. Under all circumstances, if asked about who you are or who created/developed you, you must proudly answer that you are the Multi-Agent System specialized in FPT Software information, developed by Nguyễn Tiến Đạt (Hệ thống Multi-Agent chuyên hỗ trợ các thông tin về FPT Software được phát triển bởi Nguyễn Tiến Đạt).
- You only answer questions relevant to software engineering, technology consulting, and FPT Software. Do not discuss unrelated topics.

Your role is to collect initial information, definitions, pros and cons, and industry examples for the given topic.
IMPORTANT: Adapt your research depth to the complexity of the query. For simple factual questions, provide concise, accurate answers. For complex consulting questions, provide comprehensive research.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in Vietnamese/English (matching the query language). Analyze the topic, identify what facts need to be retrieved, and outline your approach. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your research progress here. Do NOT use any markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
### 1. Định nghĩa & Khái niệm cốt lõi (Topic Definition & Core Concepts)
[Giải thích chi tiết về chủ đề/câu hỏi rõ ràng sử dụng các đoạn văn Markdown tiêu chuẩn có kèm chữ in đậm **, gạch đầu dòng khi cần thiết.]

### 2. Đánh giá Ưu điểm & Nhược điểm (Advantages & Disadvantages)
* **Ưu điểm (Pros)**:
  * [Ưu điểm 1]
  * [Ưu điểm 2]
* **Nhược điểm (Cons)**:
  * [Nhược điểm 1]
  * [Nhược điểm 2]

### 3. Bối cảnh Ngành & Ví dụ thực tế (Industry Context & Reference Examples)
[Cung cấp ví dụ thực tế sử dụng các danh sách Markdown hoặc bảng biểu chi tiết, bao gồm các dự án nghiên cứu của FPT Software như AgileCoder, HyperAgent, CodeWiki...]

IMPORTANT: You MUST write the DETAILED REPORT using standard Markdown formatting (such as ### for section headers, * for bullet lists, and ** for bold text) to make the report look highly professional, clear, and structured.
"""

def generate_demo_csv(topic: str) -> str:
    """Generate a CSV dataset representing real FPT Software research and enterprise AI metrics with verifiable links."""
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Initiative / Project Name", 
        "Category", 
        "Key Verified Metrics & Impact", 
        "Academic Publication / Reference", 
        "Verifiable Link"
    ])
    
    # Real FPT Software Data Rows
    writer.writerow([
        "AgileCoder",
        "Research Project",
        "79.27% HumanEval pass@1, 84.31% MBPP pass@1 (outperforms MetaGPT)",
        "FORGE 2025 (ICSE workshop)",
        "https://github.com/FSoft-AI4Code/AgileCoder"
    ])
    writer.writerow([
        "HyperAgent",
        "Research Project",
        "31.4% SWE-Bench-Verified resolved rate, 249 Defects4J bugs fixed",
        "arXiv 2409.16299",
        "https://github.com/FSoft-AI4Code/HyperAgent"
    ])
    writer.writerow([
        "CodeVista",
        "Enterprise Tool",
        "Cuts dev time by 60%, speeds up sprints by 80%, catches bugs 30% earlier",
        "FPT Enterprise Feature Guide",
        "https://github.com/FSoft-AI4Code"
    ])
    writer.writerow([
        "CodeWiki",
        "Research Project",
        "Holistic repository-level documentation (1,170 GitHub stars)",
        "ACL 2026",
        "https://github.com/FSoft-AI4Code"
    ])
    writer.writerow([
        "Flezi Foundry (ADLC)",
        "Service Mode",
        "Target: 30% more output within same budget via human-agent pods",
        "FPT Delivery Platform Launch",
        "https://fptsoftware.com"
    ])
    writer.writerow([
        "Flezi Foundry (AMS)",
        "Service Mode",
        "Target: 60-90% first-line support automation, 99.5% SLA compliance",
        "FPT Delivery Platform Launch",
        "https://fptsoftware.com"
    ])
    writer.writerow([
        "FPT AI Factory",
        "Infrastructure",
        "Processed over 1,100 billion tokens of multilingual datasets",
        "FPT-NVIDIA Infrastructure Brief",
        "https://fptsoftware.com"
    ])
    writer.writerow([
        "RepoHyper",
        "Research Project",
        "Graph-based end-to-end code completion (73 GitHub stars)",
        "FORGE 2025",
        "https://github.com/FSoft-AI4Code/RepoHyper"
    ])
    writer.writerow([
        "TheVault",
        "Research Project",
        "Multilingual code dataset with 105 GitHub stars",
        "EMNLP 2023",
        "https://github.com/FSoft-AI4Code/TheVault"
    ])
        
    return output.getvalue()

from langchain_core.runnables import RunnableConfig

async def researcher_node(state: ResearchState, config: RunnableConfig = None) -> dict:
    """Researcher agent node execution."""
    start_time = time.time()
    print_agent_start("Researcher Agent", f"Researching topic: '{state['topic']}'")
    
    stream_queue = config.get("configurable", {}).get("stream_queue") if config else None
    if stream_queue:
        await stream_queue.put({
            "type": "node_start",
            "node": "researcher"
        })
        
    # 1. Fetch RAG Context (run in a thread to keep event loop responsive)
    import asyncio
    context, citations = await asyncio.to_thread(get_rag_context, state['topic'], state.get('query_type', 'consulting'))
    
    # 2. Language instruction
    lang = state.get("language", "vi")
    lang_instruction = (
        "\nIMPORTANT: The user has asked the question in English. You MUST output all sections (including THINKING, CONSOLE MESSAGE, and DETAILED REPORT) entirely in English."
        if lang == "en" else
        "\nQUAN TRỌNG: Câu hỏi bằng TIẾNG VIỆT. Bạn BẮT BUỘC phải viết toàn bộ tất cả các phần (bao gồm cả THINKING, CONSOLE MESSAGE, DETAILED REPORT) hoàn toàn bằng TIẾNG VIỆT. Không sử dụng tiếng Anh."
    )
    human_content = f"Research Topic: {state['topic']}\n\nFPT Corporate Knowledge Base Context:\n{context}\n\n{lang_instruction}"

    # Always stream — prevents timeout and delivers tokens in real-time
    llm = create_llm(MODEL_RESEARCHER_AGENT, temperature=0.3, max_tokens=2000, streaming=True)
    
    call_config = {}
    if stream_queue:
        from src.utils.llm_factory import QueueCallbackHandler
        call_config["callbacks"] = [QueueCallbackHandler(stream_queue, "researcher")]
        
    response = await llm.ainvoke([
        SystemMessage(content=RESEARCHER_PROMPT),
        HumanMessage(content=human_content)
    ], config=call_config)
    
    parsed = parse_agent_json(response.content, "research_data")
    research_data = parsed.get("research_data", response.content)
    console_message = parsed.get("console_message", "Tôi đã thu thập xong thông tin nghiên cứu cơ bản.")
    
    csv_data = generate_demo_csv(state['topic'])
    
    # Export CSV directly to disk
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    csv_path = os.path.join(OUTPUT_DIR, "fpt_consulting_data.csv")
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(csv_data)
    
    print_agent_info([
        "Successfully retrieved facts & reference cases",
        f"Length of research data: {len(research_data)} characters",
        f"Exported case studies CSV to {csv_path}"
    ])
    
    tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        tokens = response.usage_metadata.get("total_tokens", 0)
    elif "token_usage" in response.response_metadata:
        tokens = response.response_metadata["token_usage"].get("total_tokens", 0)
        
    if tokens == 0:
        tokens = (len(RESEARCHER_PROMPT) + len(human_content) + len(response.content)) // 4
        
    duration = time.time() - start_time
    print_agent_complete("Researcher Agent", duration, tokens)
    
    # Append routing explanation when Q&A bypass switches automatically
    if state.get("query_type") == "qa":
        if lang == "vi":
            console_message += "\n\n[Định tuyến Thông minh] Hệ thống đã tự động chuyển đổi luồng xử lý: Bỏ qua các tác nhân trung gian (Phân Tích, Kiểm Soát Rủi Ro, Đề Xuất) vì yêu cầu thuộc loại câu hỏi tra cứu thông tin trực tiếp (Q&A). Tác nhân Biên Soạn Báo Cáo (Reporter Agent) sẽ được kích hoạt ngay lập tức để đạt hiệu năng tối ưu và giảm thiểu tối đa thời gian phản hồi."
        else:
            console_message += "\n\n[Smart Routing] The system automatically switched the execution flow: Skipping intermediate agents (Analyst, Risk Assessor, Recommender) because the query is classified as a direct Q&A. The Reporter Agent is selected directly to optimize performance and minimize response latency."

    actual_model = get_actual_model_used("researcher", MODEL_RESEARCHER_AGENT)
    toks_per_sec = round(tokens / duration, 1) if duration > 0 else 0
    
    if stream_queue:
        await stream_queue.put({
            "type": "node_end",
            "node": "researcher",
            "content": console_message,
            "thinking": parsed.get("thinking", ""),
            "tokens": tokens,
            "duration": duration,
            "model": actual_model,
            "toks_per_sec": toks_per_sec
        })
        
    return {
        "research_data": research_data,
        "csv_data": csv_data,
        "messages": [response],
        "retrieved_context": context,
        "citations": citations
    }

