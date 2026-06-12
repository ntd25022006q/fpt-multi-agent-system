import time
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from src.state import ResearchState
from src.utils.llm_factory import create_llm, parse_agent_json, get_actual_model_used
from src.utils.display import print_agent_start, print_agent_info, print_agent_complete
from config import MODEL_REPORTER_AGENT

REPORTER_PROMPT_EN = """You are the Reporter Agent in FPT Software's AI-First Research & Consulting suite.
Your role is to compile the final consulting report by aggregating the outputs from the Researcher, Analyst, Risk Assessor, and Recommender agents.
The report MUST strictly answer the detailed consulting questions, using academic and professional language, and must NOT contain any peripheral details (like Agent parameters or Azure + AI Factory system architectures).

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in English. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your final report compilation here. Do NOT use markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
# FPT Software AI-First Research & Detailed Report — Strategic Research Report

## 1. Introduction
[Provide a clear, coherent, and visually appealing introduction broken down into subsections with bullet points using Markdown:
* Strategic Context & Objectives (what triggered this study, e.g. Core Banking modernization)
* Core Technology Requirements (why the change is necessary)
* Scope & Assessment Methodology (brief overview of the multi-agent synthesis process)]

## 2. Detailed Analysis
[Provide a highly detailed body section divided into structured subsections with point-by-point details using Markdown:
* Subsection 1: Theoretical Foundation & Architectural Baseline (definitions, advantages, and disadvantages as concise points)
* Subsection 2: Alternatives & Trade-off Assessment (options analysis, structural trade-offs, and operational fit summarized in bulleted points)
* Subsection 3: Risk Evaluation & Cybersecurity Compliance (FPT Secure-First standards, identified vulnerabilities, compliance factors, and mitigation steps)
* Subsection 4: Strategic Roadmap & Execution KPIs (multi-phase deployment phases, specific tasks, timelines, and metric KPIs with owners)]

## 3. Recommendations & Conclusion
[Provide a clear, synthesized conclusion structured in Markdown bullet points:
* Summary of Research Findings (core lessons from the analysis)
* Synthesis of Architectural Recommendations
* Concluding Message: End with a single concluding sentence that accurately reflects the core issue of the transition (e.g., balancing architectural modularity against operational complexity) without using any equal signs, markdown formatting, or bullet points.]

=== MERMAID DIAGRAM ===
```mermaid
[Draw a vertical, layered Mermaid diagram (flowchart TD) representing the target architecture flow, using double quotes for nodes with spaces/special characters, and no HTML tags]
```

=== DIAGRAM EXPLANATION ===
[Write a highly sophisticated, academic, and detailed explanation of the diagram workflow and system architecture in English]

CRITICAL MERMAID SYNTAX RULES:
1. You MUST wrap all Mermaid node labels containing special characters (such as slashes `/`, parentheses `()`, brackets `[]`, hyphens `-`, spaces, or colons `:`) in double quotes. Example: id["Label (Extra Info)"]
2. Do not use HTML tags like <br> or <br/> inside nodes or labels. Use plain text or \n for newlines inside quoted labels.
3. Keep the diagram layout simple, vertical (flowchart TD), and clean.

IMPORTANT: Write the DETAILED REPORT entirely in standard Markdown (using #, ## for headers, * for bullet lists, and ** for bold text). Do NOT use continuous equal signs (like '===') or markdown table dividers inside your response content.
IMPORTANT: The report MUST be written entirely in English.
"""

REPORTER_PROMPT_VI = """Bạn là Tác nhân Báo cáo (Reporter Agent) trong bộ giải pháp Nghiên cứu & Báo cáo Chi tiết AI-First của FPT Software.
Vai trò của bạn là biên soạn báo cáo chi tiết cuối cùng bằng cách tổng hợp kết quả từ các tác nhân Nghiên cứu, Phân tích, Đánh giá Rủi ro và Đề xuất.
Báo cáo PHẢI trả lời chính xác, đầy đủ câu hỏi tư vấn, sử dụng ngôn ngữ học thuật, chuyên nghiệp của một chuyên gia tư vấn cao cấp và KHÔNG chứa các chi tiết bên lề (như cấu hình Agent hay thông số hệ thống).

Bạn PHẢI phản hồi theo định dạng cấu trúc sau (sử dụng chính xác các thẻ đánh dấu):

=== THINKING ===
[Viết quy trình tư duy từng bước của bạn bằng tiếng Việt. Phần này sẽ được thu gọn trong giao diện người dùng.]

=== CONSOLE MESSAGE ===
[Viết một bản tóm tắt ngắn gọn, chuyên nghiệp bằng văn bản thuần túy (không sử dụng ký tự markdown như *, #, -, và không có bảng biểu) về việc tổng hợp báo cáo và thiết lập kiến trúc hệ thống.]

=== DETAILED REPORT ===
# FPT Software AI-First Research & Detailed Report — Báo Cáo Nghiên Cứu Chiến Lược

## 1. Giới thiệu chung
[Cung cấp phần giới thiệu rõ ràng, mạch lạc và chuyên nghiệp được chia thành các phần nhỏ, súc tích bằng Markdown. Tổng hợp các ý chính sau:
* Bối cảnh Chiến lược & Mục tiêu (lý do thực hiện nghiên cứu, ví dụ: hiện đại hóa Core Banking)
* Yêu cầu Công nghệ Cốt lõi (tại sao sự thay đổi này là cần thiết)
* Phạm vi & Phương pháp Đánh giá (tổng quan ngắn gọn về quá trình tổng hợp của hệ thống Multi-Agent)]

## 2. Nội dung phân tích chi tiết
[Cung cấp nội dung chi tiết được chia thành các phân hệ có cấu trúc rõ ràng với các điểm phân tích sâu sắc bằng Markdown:
* Phân hệ 1: Cơ sở Lý thuyết & Kiến trúc Nền tảng (định nghĩa, ưu điểm và nhược điểm được trình bày dưới dạng danh sách phân điểm)
* Phân hệ 2: Các Phương án thay thế & Đánh giá Đánh đổi (phân tích các phương án kỹ thuật, đánh đổi kiến trúc và sự phù hợp vận hành)
* Phân hệ 3: Đánh giá Rủi ro & Tuân thủ An ninh mạng (áp dụng tiêu chuẩn FPT Secure-First, nhận diện lỗ hổng, các yếu tố tuân thủ và giải pháp giảm thiểu)
* Phân hệ 4: Lộ trình Chiến lược & Chỉ số KPI Thực thi (lộ trình triển khai nhiều giai đoạn, nhiệm vụ cụ thể, mốc thời gian và các KPI đo lường hiệu quả kèm theo bộ phận chịu trách nhiệm)]

## 3. Khuyến nghị & Kết luận
[Cung cấp kết luận rõ ràng, mang tính tổng hợp cao dưới dạng danh sách điểm Markdown:
* Tóm tắt Kết quả Nghiên cứu (các bài học cốt lõi rút ra từ phân tích)
* Tổng hợp Khuyến nghị Kiến trúc (phương án lựa chọn tối ưu)
* Thông điệp Kết luận: Kết thúc bằng một câu kết luận duy nhất phản ánh chính xác vấn đề cốt lõi của sự chuyển đổi (ví dụ: cân bằng giữa tính mô-đun của kiến trúc và độ phức tạp vận hành), không sử dụng ký tự gạch ngang, dấu bằng hay ký hiệu đầu dòng.]

=== MERMAID DIAGRAM ===
```mermaid
[Vẽ sơ đồ Mermaid dạng đứng (flowchart TD), phân lớp rõ ràng thể hiện luồng kiến trúc mục tiêu, sử dụng dấu nháy kép cho các nhãn nút chứa ký tự đặc biệt hoặc khoảng trắng, và KHÔNG sử dụng thẻ HTML như <br> hay <br/> inside nodes]
```

=== DIAGRAM EXPLANATION ===
[Viết lời giải thích chi tiết, học thuật và chuyên sâu bằng tiếng Việt về luồng vận hành của sơ đồ và kiến trúc hệ thống]

QUY TẮC CÚ PHÁP MERMAID QUAN TRỌNG:
1. Bạn PHẢI bọc tất cả các nhãn nút Mermaid chứa ký tự đặc biệt (như gạch chéo `/`, dấu ngoặc đơn `()`, dấu ngoặc vuông `[]`, gạch ngang `-`, khoảng trắng, hoặc dấu hai chấm `:`) trong dấu nháy kép. Ví dụ: id["Label (Extra Info)"]
2. Không sử dụng các thẻ HTML như <br> hoặc <br/> trong các nút hoặc nhãn. Sử dụng plain text hoặc \n cho xuống dòng trong dấu nháy kép.
3. Giữ bố cục sơ đồ đơn giản, theo chiều dọc (flowchart TD) và sạch các nút.

QUAN TRỌNG: Viết DETAILED REPORT hoàn toàn bằng định dạng Markdown tiêu chuẩn (sử dụng #, ## cho tiêu đề, * cho danh sách liệt kê, và ** cho chữ in đậm). KHÔNG sử dụng các hàng dấu bằng liên tục (như '===') hoặc dải phân cách bảng Markdown bên trong nội dung báo cáo.
QUAN TRỌNG: Báo cáo PHẢI được viết hoàn toàn bằng tiếng Việt chuẩn xác, học thuật. Không pha trộn tiếng Anh trong các tiêu đề phần và nội dung.
"""

REPORTER_QA_PROMPT_EN = """You are the Reporter Agent in FPT Software's AI-First Research & Consulting suite.
Your role is to compile the final Q&A report by aggregating the research data and facts provided by the Researcher agent.
The report MUST strictly answer the detailed questions, using academic and professional language.

You MUST respond using the following structured format (use the exact markers):

=== THINKING ===
[Write your step-by-step thinking process in English. This section will be collapsible in the UI.]

=== CONSOLE MESSAGE ===
[Write a clean, professional, plain-text summary of your answers here. Do NOT use markdown characters like asterisks, bullet points, or hashtags. Keep it as friendly plain text paragraphs.]

=== DETAILED REPORT ===
# FPT Software AI-First Research & Detailed Report — Q&A Research Report

## 1. Introduction
[Provide a clear, coherent, and visually appealing introduction broken down into subsections with bullet points using Markdown:
* Technical Context & Scope (introducing the question and core context)
* Compatibility with FPT Software Systems & Standards]

## 2. Detailed Analysis
[Provide a highly detailed body section divided into structured subsections with point-by-point details using Markdown:
* Subsection 1: Conceptual & Architectural Analysis (detailed explanations as concise points)
* Subsection 2: Technical Workflows & Implementation Details (operational logic, system integration, or sample code blocks if applicable)]

## 3. Recommendations & Conclusion
[Provide a clear, synthesized conclusion structured in Markdown bullet points:
* Core Conclusion & Strategic Recommendations
* Concluding Message: End with a single concluding sentence that accurately reflects the core issue of the question without using any equal signs, markdown formatting, or bullet points.]

=== MERMAID DIAGRAM ===
```mermaid
[Draw a vertical, layered Mermaid diagram (flowchart TD) representing the workflow/logic, using double quotes for nodes with spaces/special characters, and no HTML tags]
```

=== DIAGRAM EXPLANATION ===
[Write a highly sophisticated, academic, and detailed explanation of the diagram workflow/logic in English]

CRITICAL MERMAID SYNTAX RULES:
1. You MUST wrap all Mermaid node labels containing special characters (such as slashes `/`, parentheses `()`, brackets `[]`, hyphens `-`, spaces, or colons `:`) in double quotes. Example: id["Label (Extra Info)"]
2. Do not use HTML tags like <br> or <br/> inside nodes or labels. Use plain text or \n for newlines inside quoted labels.
3. Keep the diagram layout simple, vertical (flowchart TD), and clean.

IMPORTANT: Write the DETAILED REPORT entirely in standard Markdown (using #, ## for headers, * for bullet lists, and ** for bold text). Do NOT use continuous equal signs (like '===') or markdown table dividers inside your response content.
IMPORTANT: The report MUST be written entirely in English.
"""

REPORTER_QA_PROMPT_VI = """Bạn là Tác nhân Báo cáo (Reporter Agent) trong bộ giải pháp Nghiên cứu & Báo cáo Chi tiết AI-First của FPT Software.
Vai trò của bạn là biên soạn báo cáo Q&A chi tiết bằng cách tổng hợp dữ liệu nghiên cứu và thực tế từ tác nhân Nghiên cứu.
Báo cáo PHẢI trả lời chính xác, đầy đủ câu hỏi tư vấn, sử dụng ngôn ngữ học thuật, chuyên nghiệp của một chuyên gia tư vấn cao cấp.

Bạn PHẢI phản hồi theo định dạng cấu trúc sau (sử dụng chính xác các thẻ đánh dấu):

=== THINKING ===
[Viết quy trình tư duy từng bước của bạn bằng tiếng Việt. Phần này sẽ được thu gọn trong giao diện người dùng.]

=== CONSOLE MESSAGE ===
[Viết một bản tóm tắt ngắn gọn, chuyên nghiệp bằng văn bản thuần túy (không sử dụng ký tự markdown như *, #, -, và không có bảng biểu) về câu trả lời đã tổng hợp.]

=== DETAILED REPORT ===
# FPT Software AI-First Research & Detailed Report — Báo Cáo Nghiên Cứu Q&A

## 1. Giới thiệu chung
[Cung cấp phần giới thiệu rõ ràng, mạch lạc và chuyên nghiệp được chia thành các phần nhỏ, súc tích bằng Markdown. Tổng hợp các ý chính sau:
* Bối cảnh Kỹ thuật & Phạm vi (giới thiệu câu hỏi và bối cảnh cốt lõi)
* Tính tương thích với Hệ thống & Tiêu chuẩn của FPT Software]

## 2. Nội dung phân tích chi tiết
[Cung cấp nội dung chi tiết được chia thành các phân hệ có cấu trúc rõ ràng với các điểm phân tích sâu sắc bằng Markdown:
* Phân hệ 1: Khái niệm & Phân tích Kiến trúc (giải thích chi tiết dưới dạng danh sách phân điểm)
* Phân hệ 2: Luồng Kỹ thuật & Chi tiết Triển khai (logic vận hành, tích hợp hệ thống, hoặc các khối mã mẫu nếu có)]

## 3. Khuyến nghị & Kết luận
[Cung cấp kết luận rõ ràng, mang tính tổng hợp cao dưới dạng danh sách điểm Markdown:
* Kết luận & Khuyến nghị Cốt lõi
* Thông điệp Kết luận: Kết thúc bằng một câu kết luận duy nhất phản ánh chính xác vấn đề cốt lõi của câu hỏi, không sử dụng ký tự gạch ngang, dấu bằng hay ký hiệu đầu dòng.]

=== MERMAID DIAGRAM ===
```mermaid
[Vẽ sơ đồ Mermaid dạng đứng (flowchart TD), thể hiện trực quan logic hoặc luồng quy trình của câu trả lời, sử dụng dấu nháy kép cho các nhãn nút chứa ký tự đặc biệt hoặc khoảng trắng, và KHÔNG sử dụng thẻ HTML như <br> hay <br/> inside nodes]
```

=== DIAGRAM EXPLANATION ===
[Viết lời giải thích chi tiết, học thuật và chuyên sâu bằng tiếng Việt về sơ đồ Mermaid đã vẽ]

QUY TẮC CÚ PHÁP MERMAID QUAN TRỌNG:
1. Bạn PHẢI bọc tất cả các nhãn nút Mermaid chứa ký tự đặc biệt (như gạch chéo `/`, dấu ngoặc đơn `()`, dấu ngoặc vuông `[]`, gạch ngang `-`, khoảng trắng, hoặc dấu hai chấm `:`) trong dấu nháy kép. Ví dụ: id["Label (Extra Info)"]
2. Không sử dụng các thẻ HTML như <br> hoặc <br/> trong các nút hoặc nhãn. Sử dụng plain text hoặc \n cho xuống dòng trong dấu nháy kép.
3. Giữ bố cục sơ đồ đơn giản, theo chiều dọc (flowchart TD) và sạch sẽ.

QUAN TRỌNG: Viết DETAILED REPORT hoàn toàn bằng định dạng Markdown tiêu chuẩn (sử dụng #, ## cho tiêu đề, * cho danh sách liệt kê, và ** cho chữ in đậm). KHÔNG sử dụng các hàng dấu bằng liên tục (như '===') hoặc dải phân cách bảng Markdown bên trong nội dung báo cáo.
QUAN TRỌNG: Báo cáo PHẢI được viết hoàn toàn bằng tiếng Việt chuẩn xác, học thuật. Không pha trộn tiếng Anh trong các tiêu đề phần và nội dung.
"""

from langchain_core.runnables import RunnableConfig

async def reporter_node(state: ResearchState, config: RunnableConfig = None) -> dict:
    """Reporter agent node execution."""
    start_time = time.time()
    print_agent_start("Reporter Agent", "Aggregating findings and compiling visual report...")
    
    stream_queue = config.get("configurable", {}).get("stream_queue") if config else None
    if stream_queue:
        await stream_queue.put({
            "type": "node_start",
            "node": "reporter"
        })

    # Always use streaming=True to prevent HTTP read timeout on long generation.
    # Streaming keeps the TCP connection alive by sending tokens incrementally.
    llm = create_llm(MODEL_REPORTER_AGENT, temperature=0.2, max_tokens=2500, streaming=True)
    
    query_type = state.get("query_type", "consulting")
    lang = state.get("language", "vi")
    lang_instruction = (
        "\nIMPORTANT: The user has asked the question in English. You MUST output all sections (THINKING, CONSOLE MESSAGE, DETAILED REPORT, MERMAID DIAGRAM, DIAGRAM EXPLANATION) entirely in English."
        if lang == "en" else
        "\nIMPORTANT: The user has asked the question in Vietnamese. You MUST output all sections (THINKING, CONSOLE MESSAGE, DETAILED REPORT, MERMAID DIAGRAM, DIAGRAM EXPLANATION) entirely in Vietnamese."
    )
    if query_type == "qa":
        prompt = REPORTER_QA_PROMPT_EN if lang == "en" else REPORTER_QA_PROMPT_VI
        human_content = (
            f"Topic: {state['topic']}\n\n"
            f"Research Data:\n{state['research_data']}\n\n"
            f"Sources Consulted:\n" + ", ".join(state.get("citations", [])) + "\n\n" +
            f"{lang_instruction}"
        )
    else:
        prompt = REPORTER_PROMPT_EN if lang == "en" else REPORTER_PROMPT_VI
        human_content = (
            f"Topic: {state['topic']}\n\n"
            f"Research:\n{state['research_data']}\n\n"
            f"Analysis:\n{state['analysis']}\n\n"
            f"Risks:\n{state['risks']}\n\n"
            f"Recommendations:\n{state['recommendations']}\n\n"
            f"Sources Consulted:\n" + ", ".join(state.get("citations", [])) + "\n\n" +
            f"{lang_instruction}"
        )
    
    call_config = {}
    if stream_queue:
        from src.utils.llm_factory import QueueCallbackHandler
        call_config["callbacks"] = [QueueCallbackHandler(stream_queue, "reporter")]

    # Retry up to 2 times on timeout; log each failure to stream_queue
    last_exc = None
    response = None
    for attempt in range(3):
        try:
            response = await llm.ainvoke([
                SystemMessage(content=prompt),
                HumanMessage(content=human_content)
            ], config=call_config)
            break
        except Exception as exc:
            last_exc = exc
            err_str = str(exc)
            # Log API/timeout failures to the stream so the user sees them in the Processing Log
            err_msg = f"[Reporter] Lần thử {attempt+1}/3 gặp lỗi: {err_str.split(chr(10))[0]}"
            print(err_msg)
            if stream_queue:
                await stream_queue.put({
                    "type": "node_end",
                    "node": "reporter",
                    "content": err_msg,
                    "tokens": 0,
                    "duration": time.time() - start_time,
                    "model": "error",
                    "toks_per_sec": 0
                })
            if "timeout" in err_str.lower() or "timed out" in err_str.lower() or "connection" in err_str.lower():
                import asyncio
                wait = 5 * (attempt + 1)
                print(f"[Reporter] Đang chờ {wait}s trước khi thử lại...")
                await asyncio.sleep(wait)
            else:
                break  # Non-retryable error: stop immediately
    
    if response is None:
        # All attempts failed: return graceful error report rather than crashing
        err_report = (
            f"# Lỗi Xử Lý Agentorter\n\n"
            f"Không thể tạo báo cáo do lỗi API: {str(last_exc).split(chr(10))[0]}\n\n"
            f"Vui lòng kiểm tra kết nối internet và API key, sau đó thử lại."
        )
        import os
        from config import OUTPUT_DIR
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        with open(os.path.join(OUTPUT_DIR, "research_report.md"), "w", encoding="utf-8") as f:
            f.write(err_report)
        return {
            "report": err_report,
            "messages": []
        }
    
    parsed = parse_agent_json(response.content, "report")
    report = parsed.get("report", response.content)
    
    # Robustly strip any "Sources & Reference Documents" or "Nguồn tài liệu tham khảo" section if generated by the LLM
    import re
    pattern = r"\n\s*##\s*\d*\.?\s*(Sources\s*&\s*Reference\s*Documents|Nguồn\s*tài\s*liệu\s*tham\s*khảo|Tài\s*liệu\s*tham\s*khảo|Nguồn\s*tham\s*khảo|References|Sources).*$"
    report = re.sub(pattern, "", report, flags=re.IGNORECASE | re.DOTALL)
    
    mermaid_diagram = parsed.get("mermaid_diagram", "")
    diagram_explanation = parsed.get("diagram_explanation", "")
    
    # Programmatically append clean local links for each citation (hidden as requested)
    # citations = state.get("citations", [])
    # if citations:
    #     citations_md = "\n\n## 6. Sources & Reference Documents\n" if query_type == "consulting" else "\n\n## 4. Sources & Reference Documents\n"
    #     for cit in citations:
    #         citations_md += f"*   [{cit}](file:///c:/Users/tswat/Downloads/multi%20agent/data/raw/{cit})\n"
    #     report = report + citations_md

        
    # Write the diagram and diagram explanation directly to disk
    import os
    from config import OUTPUT_DIR
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if mermaid_diagram:
        with open(os.path.join(OUTPUT_DIR, "diagram.mermaid"), "w", encoding="utf-8") as f:
            f.write(mermaid_diagram)
    if diagram_explanation:
        with open(os.path.join(OUTPUT_DIR, "diagram_explanation.txt"), "w", encoding="utf-8") as f:
            f.write(diagram_explanation)
            
    print_agent_info([
        "Compiled report and generated Mermaid workflow diagram",
        f"Length of final report: {len(report)} characters",
        f"Saved diagram and explanation to {OUTPUT_DIR}"
    ])
    
    tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        tokens = response.usage_metadata.get("total_tokens", 0)
    elif "token_usage" in response.response_metadata:
        tokens = response.response_metadata["token_usage"].get("total_tokens", 0)
        
    if tokens == 0:
        tokens = (len(prompt) + len(human_content) + len(response.content)) // 4
        
    duration = time.time() - start_time
    print_agent_complete("Reporter Agent", duration, tokens)
    
    actual_model = get_actual_model_used("reporter", MODEL_REPORTER_AGENT)
    toks_per_sec = round(tokens / duration, 1) if duration > 0 else 0
    
    console_message = parsed.get("console_message", "Tôi đã tổng hợp xong báo cáo chi tiết chiến lược.")
    
    if stream_queue:
        await stream_queue.put({
            "type": "node_end",
            "node": "reporter",
            "content": console_message,
            "thinking": parsed.get("thinking", ""),
            "tokens": tokens,
            "duration": duration,
            "model": actual_model,
            "toks_per_sec": toks_per_sec
        })
        
    return {
        "report": report,
        "messages": [response]
    }

