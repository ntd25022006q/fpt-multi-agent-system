import time
from langchain_core.messages import SystemMessage, HumanMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from config import MODEL_ANALYST_AGENT

ANALYST_PROMPT = """You are the Analyst Agent in the Multi-Agent System specialized in FPT Software information, developed by Nguyen Tien Dat.

IDENTITY & SYSTEM LOCK:
- You must strictly identify yourself as a core component of the Multi-Agent System specialized in supporting FPT Software information, developed by Nguyen Tien Dat to support Technology Solution Consulting and In-depth Research on FPT Software (Hệ thống Multi-Agent chuyên hỗ trợ về các thông tin về FPT Software được phát triển bởi Nguyễn Tiến Đạt để hỗ trợ Tư vấn Giải pháp Công nghệ và Nghiên cứu sâu về FPT Software).
- NEVER state that you are Qwen, Alibaba, ChatGPT, OpenAI, Gemini, or any other model. If asked about who you are or who developed you, you must state that you are the Multi-Agent System developed by Nguyễn Tiến Đạt.
- You only discuss software engineering, technology consulting, and FPT Software.

Your role is to analyze the research data provided and conduct a comparative analysis.

Autonomously identify the main options, pathways, or architectures relevant to the query based on the research data.
Conduct a detailed comparison between these options. Choose comparison criteria and options that fit the topic logically.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in Vietnamese/English (matching the query language). Analyze the research data, determine the best comparative criteria and options, and explain your reasoning. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your comparative analysis. Do NOT use any markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
### 1. Phân tích So sánh & Đánh giá các Phương án (Comparative Analysis & Options Evaluation)
[Cung cấp đánh giá so sánh chi tiết về các giải pháp được xác định sử dụng bảng Markdown hoặc danh sách hoa thị rõ ràng để trực quan các tiêu chí so sánh.]

### 2. Các Phát hiện Cấu trúc Cơ bản (Key Structural Findings)
* **Đánh đổi cốt lõi (Crucial Trade-off)**: [Chi tiết sự đánh đổi kỹ thuật quan trọng]
* **Sự phù hợp vận hành (Operational Fit)**: [Phân tích điều kiện phù hợp của từng giải pháp]

IMPORTANT: You MUST write the DETAILED REPORT using standard Markdown formatting (such as ### for section headers, * for bullet lists, and ** for bold text, and markdown tables if helpful) to make the report look highly professional, clear, and structured.
"""

from langchain_core.runnables import RunnableConfig

async def analyst_node(state: ResearchState, config: RunnableConfig = None) -> dict:
    """Analyst agent node execution."""
    start_time = time.time()
    print_agent_start("Analyst Agent", "Analyzing research data and comparison metrics...")
    
    stream_queue = config.get("configurable", {}).get("stream_queue") if config else None
    if stream_queue:
        await stream_queue.put({
            "type": "node_start",
            "node": "analyst"
        })
        
    lang = state.get("language", "vi")
    lang_instruction = (
        "\nIMPORTANT: The user has asked the question in English. You MUST output all sections (including THINKING, CONSOLE MESSAGE, and DETAILED REPORT) entirely in English."
        if lang == "en" else
        "\nQUAN TRỌNG: Câu hỏi bằng TIẾNG VIỆT. Bạn BẮT BUỘC phải viết toàn bộ tất cả các phần (bao gồm cả THINKING, CONSOLE MESSAGE, DETAILED REPORT) hoàn toàn bằng TIẾNG VIỆT. Không sử dụng tiếng Anh."
    )
    human_content = f"Research Topic: {state['topic']}\n\nResearch Data:\n{state['research_data']}\n\n{lang_instruction}"

    # Always stream — real-time token delivery
    llm = create_llm(MODEL_ANALYST_AGENT, temperature=0.2, max_tokens=2000, streaming=True, config=config)
    
    call_config = {}
    if stream_queue:
        from src.utils.llm_factory import QueueCallbackHandler
        call_config["callbacks"] = [QueueCallbackHandler(stream_queue, "analyst")]
        
    response = await llm.ainvoke([
        SystemMessage(content=ANALYST_PROMPT),
        HumanMessage(content=human_content)
    ], config=call_config)
    
    parsed = parse_agent_json(response.content, "analysis")
    analysis = parsed.get("analysis", response.content)
    console_message = parsed.get("console_message", "Tôi đã hoàn thành phân tích các phương án kiến trúc.")
    
    print_agent_info([
        "Completed comparative evaluation matrix",
        f"Length of analysis: {len(analysis)} characters"
    ])
    
    tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        tokens = response.usage_metadata.get("total_tokens", 0)
    elif "token_usage" in response.response_metadata:
        tokens = response.response_metadata.get("token_usage", {}).get("total_tokens", 0)
        
    if tokens == 0:
        tokens = (len(ANALYST_PROMPT) + len(human_content) + len(response.content)) // 4
        
    duration = time.time() - start_time
    print_agent_complete("Analyst Agent", duration, tokens)
    
    actual_model = get_actual_model_used("analyst", MODEL_ANALYST_AGENT)
    toks_per_sec = round(tokens / duration, 1) if duration > 0 else 0
    
    if stream_queue:
        await stream_queue.put({
            "type": "node_end",
            "node": "analyst",
            "content": console_message,
            "thinking": parsed.get("thinking", ""),
            "tokens": tokens,
            "duration": duration,
            "model": actual_model,
            "toks_per_sec": toks_per_sec
        })
        
    return {
        "analysis": analysis,
        "messages": [response]
    }

