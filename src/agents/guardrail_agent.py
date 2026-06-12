import time
import json
from langchain_core.messages import SystemMessage, HumanMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from config import MODEL_RESEARCHER_AGENT

GUARDRAIL_PROMPT = """You are the Guardrail Agent in FPT Software's AI-First Research & Consulting suite.
Your role is to check if the incoming topic/question is relevant to:
1. Software architecture & engineering (e.g., microservices, cloud migrations, database choices).
2. Enterprise technology strategy, digital transformation, or IT operations.
3. FPT Software's business, research projects (e.g., AgileCoder, HyperAgent, CodeWiki), research labs (e.g., AI Research Lab, FPT AI Residency), financial metrics, or initiatives.
4. General technical consulting or software engineering questions.

Guidance for query_type:
- Use "qa" if the user is asking a direct question seeking facts or information about FPT Software itself, its corporate performance, its specific research initiatives, or a direct technical question.
- Use "consulting" if the user is asking for architectural analysis, technology comparisons, roadmap planning, or system-wide risk assessments.

Guidance for language:
- Use "vi" if the query is in Vietnamese.
- Use "en" if the query is in English (default) or other languages.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in Vietnamese/English (matching the query language). Analyze the query, check if it fits the corporate consulting or QA scope, and justify the classification of query_type and language. This will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your relevance check in Vietnamese/English. Explain if the request is approved and forwarded, or rejected. Do NOT use any markdown characters.]

=== DETAILED REPORT ===
If the query is RELEVANT, output ONLY a raw JSON object in this format:
{
  "relevant": true,
  "query_type": "consulting" or "qa",
  "language": "vi" or "en",
  "reason": "Detailed explanation of why this topic is relevant"
}

If the query is IRRELEVANT, output a formal rejection report in plain text format (in Vietnamese/English matching the query language) explaining why the request was rejected and outlining FPT Software's consulting scope. Do NOT use any markdown characters.
"""

from langchain_core.runnables import RunnableConfig

async def guardrail_node(state: ResearchState, config: RunnableConfig = None) -> dict:
    """Guardrail agent node execution."""
    start_time = time.time()
    print_agent_start("Guardrail Agent", f"Checking query relevance for: '{state['topic']}'")
    
    stream_queue = config.get("configurable", {}).get("stream_queue") if config else None
    if stream_queue:
        await stream_queue.put({
            "type": "node_start",
            "node": "guardrail"
        })
        
    # Always stream — keeps TCP alive and delivers tokens in real-time
    from config import MODEL_GUARDRAIL_AGENT
    llm = create_llm(MODEL_GUARDRAIL_AGENT, temperature=0.0, max_tokens=600, streaming=True)
    
    call_config = {}
    if stream_queue:
        from src.utils.llm_factory import QueueCallbackHandler
        call_config["callbacks"] = [QueueCallbackHandler(stream_queue, "guardrail")]
        
    response = await llm.ainvoke([
        SystemMessage(content=GUARDRAIL_PROMPT),
        HumanMessage(content=f"User Query: {state['topic']}")
    ], config=call_config)
    
    parsed = parse_agent_json(response.content, "report")
    detailed_data = parsed.get("report", "").strip()
    
    irrelevant = True
    query_type = "consulting"
    language = "vi"
    reason = "Failed to parse guardrail response."
    
    try:
        data = json.loads(detailed_data)
        irrelevant = not data.get("relevant", False)
        query_type = data.get("query_type", "consulting")
        language = "vi" # Force language to always be Vietnamese as requested by the user
        reason = data.get("reason", "No reason provided.")
    except Exception:
        # Check if relevant was outputted somewhere
        if '"relevant": true' in response.content.lower() or '"relevant":true' in response.content.lower():
            irrelevant = False
            query_type = "consulting"
            language = "vi" # Force language to always be Vietnamese as requested by the user
            reason = "Fallback JSON check approved the query."
        else:
            irrelevant = True
            language = "vi"
            reason = "Yêu cầu nằm ngoài phạm vi hỗ trợ."
            
    if not irrelevant:
        print_agent_info([f"Query relevance: APPROVED ✅ (Type: {query_type.upper()}, Language: {language.upper()})"])
    else:
        print_agent_info([f"Query relevance: REJECTED ❌", f"Reason: {reason}"])
        
    tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        tokens = response.usage_metadata.get("total_tokens", 0)
    elif "token_usage" in response.response_metadata:
        tokens = response.response_metadata["token_usage"].get("total_tokens", 0)
        
    if tokens == 0:
        tokens = (len(GUARDRAIL_PROMPT) + len(state['topic']) + len(response.content)) // 4
        
    console_message = parsed.get("console_message", "")
    if irrelevant:
        if not console_message or "xác thực yêu cầu thành công" in console_message:
            console_message = reason
        # Append routing explanation when intelligent mode automatically switches without using any agent
        if language == "vi":
            console_message += "\n\n[Định tuyến Thông minh] Hệ thống đã tự động chuyển đổi luồng xử lý: Yêu cầu không thuộc phạm vi hỗ trợ nên toàn bộ các tác nhân nghiên cứu tiếp theo không được sử dụng. Cơ chế này giúp tối ưu hóa hiệu suất hệ thống bằng cách dừng xử lý ngay lập tức tại Lọc Ngữ Cảnh để tránh lãng phí tài nguyên."
        else:
            console_message += "\n\n[Smart Routing] The system automatically switched the execution flow: The query is out of scope, so all subsequent research agents are not used. This mechanism optimizes system performance by terminating execution immediately at the Guardrail Agent to prevent resource waste."
    else:
        if not console_message:
            console_message = "Tôi đã xác thực yêu cầu thành công."
        
    duration = time.time() - start_time
    print_agent_complete("Guardrail Agent", duration, tokens)
    
    actual_model = get_actual_model_used("guardrail", MODEL_GUARDRAIL_AGENT)
    toks_per_sec = round(tokens / duration, 1) if duration > 0 else 0
    
    if stream_queue:
        await stream_queue.put({
            "type": "node_end",
            "node": "guardrail",
            "content": console_message,
            "thinking": parsed.get("thinking", ""),
            "tokens": tokens,
            "duration": duration,
            "model": actual_model,
            "toks_per_sec": toks_per_sec
        })
        
    if irrelevant:
        return {
            "irrelevant": True,
            "query_type": "consulting",
            "language": "vi",
            "report": "# Báo cáo chưa được tạo",
            "messages": [response]
        }
        
    return {
        "irrelevant": False,
        "query_type": query_type,
        "language": language,
        "messages": [response]
    }


