import time
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from src.tools.rag_tools import get_rag_context
from config import MODEL_RISK_ASSESSOR_AGENT

RISK_ASSESSOR_PROMPT = """You are the Risk Assessor Agent in FPT Software's AI-First Research & Consulting suite.
Your role is to assess potential architectural, operational, security, and compliance risks associated with the topic.

Autonomously identify the main risk profiles (e.g., security risks, compliance issues, latency concerns, vendor lock-in) relevant to the query based on the context.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in Vietnamese/English (matching the query language). Identify key risk categories, evaluate likelihood and impact, and outline mitigation approaches. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your risk assessment and mitigation strategy. Do NOT use any markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
Risk Assessment & Mitigation Plan:

[Provide the list of identified risks, their categories, likelihood (Low/Med/High), impact (Low/Med/High), and specific mitigation strategies in plain text. Present this as clear paragraphs or plain text lists. Do NOT use markdown tables (no pipes |, dashes, or colons for tables).]

Operational Warnings & Contingency Plan:
[Detail the contingency steps or warnings specific to this topic in plain text.]

IMPORTANT: You MUST write the DETAILED REPORT entirely as plain text. Do NOT use any markdown formatting (no hashtags like # or ###, no bold asterisks **, no bullet points with - or *, no markdown links).
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
    compliance_context, compliance_citations = get_rag_context("FPT Software coding and security compliance standards")
    
    lang = state.get("language", "vi")
    lang_instruction = (
        "\nIMPORTANT: The user has asked the question in English. You MUST output both the CONSOLE MESSAGE and the DETAILED REPORT entirely in English."
        if lang == "en" else
        "\nIMPORTANT: The user has asked the question in Vietnamese. You MUST output both the CONSOLE MESSAGE and the DETAILED REPORT entirely in Vietnamese."
    )
    human_content = (
        f"Topic: {state['topic']}\n\n"
        f"Analysis:\n{state['analysis']}\n\n"
        f"FPT Security & Compliance Standards Context:\n{compliance_context}\n\n"
        f"{lang_instruction}"
    )

    # Always stream — real-time token delivery
    llm = create_llm(MODEL_RISK_ASSESSOR_AGENT, temperature=0.2, max_tokens=2000, streaming=True)
    
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
        tokens = response.response_metadata["token_usage"].get("total_tokens", 0)
        
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

