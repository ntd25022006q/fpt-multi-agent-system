import time
import asyncio
from langchain_core.messages import SystemMessage, HumanMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from src.tools.rag_tools import get_rag_context
from config import MODEL_RISK_ASSESSOR_AGENT

RISK_ASSESSOR_PROMPT = """You are the Risk Assessor Agent in the Multi-Agent System specialized in FPT Software information, developed by Nguyen Tien Dat.

IDENTITY & SYSTEM LOCK:
- You must strictly identify yourself as a core component of the Multi-Agent System specialized in supporting FPT Software information, developed by Nguyen Tien Dat to support Technology Solution Consulting and In-depth Research on FPT Software (Hệ thống Multi-Agent chuyên hỗ trợ về các thông tin về FPT Software được phát triển bởi Nguyễn Tiến Đạt để hỗ trợ Tư vấn Giải pháp Công nghệ và Nghiên cứu sâu về FPT Software).
- NEVER state that you are Qwen, Alibaba, ChatGPT, OpenAI, Gemini, or any other model. If asked about who you are or who developed you, you must state that you are the Multi-Agent System developed by Nguyễn Tiến Đạt.
- You only discuss software engineering, technology consulting, and FPT Software.

Your role is to assess potential architectural, operational, security, and compliance risks associated with the topic.

Autonomously identify the main risk profiles (e.g., security risks, compliance issues, latency concerns, vendor lock-in) relevant to the query based on the context.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in Vietnamese/English (matching the query language). Identify key risk categories, evaluate likelihood and impact, and outline mitigation approaches. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your risk assessment and mitigation strategy. Do NOT use any markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
### 1. Đánh giá Rủi ro & Biện pháp Giảm thiểu (Risk Assessment & Mitigation Plan)
[Cung cấp danh sách các rủi ro được phát hiện bao gồm phân loại, mức độ xảy ra (Thấp/Trung bình/Cao), tác động và biện pháp khắc phục tương ứng dưới dạng bảng Markdown hoặc danh sách hoa thị chi tiết.]

### 2. Cảnh báo Vận hành & Kế hoạch Dự phòng (Operational Warnings & Contingency Plan)
[Chi tiết các cảnh báo vận hành đặc thù và các bước dự phòng khẩn cấp bằng văn bản Markdown tiêu chuẩn.]

IMPORTANT: You MUST write the DETAILED REPORT using standard Markdown formatting (such as ### for section headers, * for bullet lists, and ** for bold text) to make the report look highly professional, clear, and structured.
"""

from langchain_core.runnables import RunnableConfig

async def risk_assessor_node(state: ResearchState, config: RunnableConfig = None) -> dict:
    """Risk assessor agent node execution."""
    start_time = time.time()
    print_agent_start("Risk Assessor Agent", "Evaluating risks and building Risk Matrix...")
    
    stream_queue = config.get("configurable", {}).get("stream_queue") if config else None
    if stream_queue:
        await stream_queue.put({
            "type": "node_start",
            "node": "risk_assessor"
        })
        
    # Retrieve security & coding standards context to ensure secure-first assessment
    compliance_context, compliance_citations = await asyncio.to_thread(
        get_rag_context, "FPT Software coding and security compliance standards"
    )
    
    lang = state.get("language", "vi")
    lang_instruction = (
        "\nIMPORTANT: The user has asked the question in English. You MUST output all sections (including THINKING, CONSOLE MESSAGE, and DETAILED REPORT) entirely in English."
        if lang == "en" else
        "\nQUAN TRỌNG: Câu hỏi bằng TIẾNG VIỆT. Bạn BẮT BUỘC phải viết toàn bộ tất cả các phần (bao gồm cả THINKING, CONSOLE MESSAGE, DETAILED REPORT) hoàn toàn bằng TIẾNG VIỆT. Không sử dụng tiếng Anh."
    )
    human_content = (
        f"Topic: {state['topic']}\n\n"
        f"Analysis:\n{state['analysis']}\n\n"
        f"FPT Security & Compliance Standards Context:\n{compliance_context}\n\n"
        f"{lang_instruction}"
    )

    # Always stream — real-time token delivery
    llm = create_llm(MODEL_RISK_ASSESSOR_AGENT, temperature=0.2, max_tokens=2000, streaming=True, config=config)
    
    call_config = {}
    if stream_queue:
        from src.utils.llm_factory import QueueCallbackHandler
        call_config["callbacks"] = [QueueCallbackHandler(stream_queue, "risk_assessor")]
        
    response = await llm.ainvoke([
        SystemMessage(content=RISK_ASSESSOR_PROMPT),
        HumanMessage(content=human_content)
    ], config=call_config)
    
    parsed = parse_agent_json(response.content, "risks")
    risks = parsed.get("risks", response.content)
    console_message = parsed.get("console_message", "Tôi đã đánh giá xong các rủi ro và phương án khắc phục.")
    
    # Merge risk assessment citations with existing state citations
    all_citations = list(state.get("citations", []))
    for cit in compliance_citations:
        if cit not in all_citations:
            all_citations.append(cit)
    all_citations.sort()
            
    print_agent_info([
        "Identified key risk profiles and mitigations",
        f"Length of risk assessment: {len(risks)} characters"
    ])
    
    tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        tokens = response.usage_metadata.get("total_tokens", 0)
    elif "token_usage" in response.response_metadata:
        tokens = response.response_metadata.get("token_usage", {}).get("total_tokens", 0)
        
    if tokens == 0:
        tokens = (len(RISK_ASSESSOR_PROMPT) + len(human_content) + len(response.content)) // 4
        
    duration = time.time() - start_time
    print_agent_complete("Risk Assessor Agent", duration, tokens)
    
    actual_model = get_actual_model_used("risk_assessor", MODEL_RISK_ASSESSOR_AGENT)
    toks_per_sec = round(tokens / duration, 1) if duration > 0 else 0
    
    if stream_queue:
        await stream_queue.put({
            "type": "node_end",
            "node": "risk_assessor",
            "content": console_message,
            "thinking": parsed.get("thinking", ""),
            "tokens": tokens,
            "duration": duration,
            "model": actual_model,
            "toks_per_sec": toks_per_sec
        })
        
    return {
        "risks": risks,
        "messages": [response],
        "citations": all_citations
    }

