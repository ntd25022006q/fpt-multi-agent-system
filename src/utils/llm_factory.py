from langchain_openai import ChatOpenAI
from config import OLLAMA_API_KEY, OLLAMA_BASE_URL

import asyncio
from langchain_core.callbacks import AsyncCallbackHandler

# Thread-local or simple dict to track the actual model used per node during a run
_actual_model_used: dict = {}

class QueueCallbackHandler(AsyncCallbackHandler):
    """Callback handler that pushes LLM tokens onto an asyncio.Queue in real-time
    and records the actual model name when generation starts."""
    def __init__(self, queue: asyncio.Queue, node_name: str):
        self.queue = queue
        self.node_name = node_name

    async def on_llm_start(self, serialized, prompts, **kwargs) -> None:
        """Record the actual model name at generation start."""
        try:
            model_name = serialized.get("kwargs", {}).get("model_name") or serialized.get("name", "unknown")
            _actual_model_used[self.node_name] = model_name
        except Exception:
            pass

    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        await self.queue.put({
            "type": "token",
            "node": self.node_name,
            "token": token
        })
import time
import urllib.request
import json
import threading

# Dynamic model health & latency cache
_model_latencies: dict = {}
_latency_checker_started = False
_latency_lock = threading.Lock()

def check_model_latencies_sync():
    """Verify availability and latency of Ollama models to build an optimized fallback list."""
    global _model_latencies
    models_to_check = ["gemma3:12b", "ministral-3:8b", "qwen3-coder-next", "gemma3:27b"]
    new_latencies = {}
    
    for model in models_to_check:
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {OLLAMA_API_KEY}",
                "Content-Type": "application/json"
            },
            data=data,
            method="POST"
        )
        
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=3.0) as response:
                response.read()
                latency = time.time() - t0
                new_latencies[model] = latency
        except Exception:
            new_latencies[model] = 999.0  # Offline / Unhealthy penalty
            
    with _latency_lock:
        _model_latencies = new_latencies

def start_latency_checker():
    """Start background daemon thread to periodically update model latencies."""
    global _latency_checker_started
    with _latency_lock:
        if _latency_checker_started:
            return
        _latency_checker_started = True
        
    def worker():
        # Quick initial check
        try:
            check_model_latencies_sync()
        except Exception:
            pass
        while True:
            time.sleep(300)  # Re-check every 5 minutes
            try:
                check_model_latencies_sync()
            except Exception:
                pass
                
    t = threading.Thread(target=worker, daemon=True)
    t.start()

def create_llm(model: str, temperature: float = 0.2, max_tokens: int = 2000, streaming: bool = False):
    """Create a ChatOpenAI wrapper instance pointing to the Ollama Cloud API,
    equipped with fallbacks from the best free Ollama Cloud models sorted by latency.
    """
    # Start latency checker in background
    try:
        start_latency_checker()
    except Exception:
        pass

    latencies = _model_latencies
    if not latencies:
        # Default order if cache is not populated yet
        sorted_models = ["gemma3:12b", "ministral-3:8b", "qwen3-coder-next", "gemma3:27b"]
    else:
        # Sort based on latency (lowest/healthiest first)
        sorted_models = sorted(
            ["gemma3:12b", "ministral-3:8b", "qwen3-coder-next", "gemma3:27b"],
            key=lambda m: latencies.get(m, 1.0)
        )

    # Determine primary model and fallback candidates
    primary_latency = latencies.get(model, 1.0)
    
    # If the requested primary model is healthy (latency < 10s), try it first
    if primary_latency < 10.0:
        primary_model = model
        fallback_candidates = [m for m in sorted_models if m != model]
    else:
        # If primary model is offline/unhealthy, bypass it and try the healthiest model first
        primary_model = sorted_models[0]
        fallback_candidates = [m for m in sorted_models if m != primary_model] + [model]

    primary_llm = ChatOpenAI(
        model=primary_model,
        api_key=OLLAMA_API_KEY,
        base_url=OLLAMA_BASE_URL,
        temperature=temperature,
        timeout=15,          # 15s timeout
        max_retries=0,       # Fail over instantly
        max_tokens=max_tokens,
        streaming=streaming
    )
    
    fallbacks = []
    for fallback_model in fallback_candidates:
        # Skip models that are known to be down (latency >= 999s) to avoid unnecessary timeouts
        if latencies.get(fallback_model, 1.0) >= 999.0:
            continue
        fallbacks.append(
            ChatOpenAI(
                model=fallback_model,
                api_key=OLLAMA_API_KEY,
                base_url=OLLAMA_BASE_URL,
                temperature=temperature,
                timeout=10,          # 10s timeout
                max_retries=0,
                max_tokens=max_tokens,
                streaming=streaming
            )
        )
        
    return primary_llm.with_fallbacks(fallbacks=fallbacks)

def get_actual_model_used(node_name: str, default_model: str) -> str:
    """Return the actual model name recorded for a node (set by QueueCallbackHandler)."""
    return _actual_model_used.get(node_name, default_model)


import json
import re

def parse_agent_json(content: str, fallback_key: str) -> dict:
    """Parse output from agents using a robust delimiter-based check, extracting thinking logs,
    console messages, detailed reports, and diagrams."""
    content = content.strip()
    
    # Delimiters
    think_marker = "=== THINKING ==="
    console_marker = "=== CONSOLE MESSAGE ==="
    report_marker = "=== DETAILED REPORT ==="
    
    mermaid_markers = ["=== MERMAID DIAGRAM ===", "=== SƠ ĐỒ MERMAID ===", "=== BIỂU ĐỒ MERMAID ==="]
    explanation_markers = ["=== DIAGRAM EXPLANATION ===", "=== GIẢI THÍCH CHI TIẾT SƠ ĐỒ ===", "=== GIẢI THÍCH SƠ ĐỒ ===", "=== GIẢI THÍCH ==="]
    
    thinking = ""
    console_message = ""
    detailed_report = ""
    mermaid_diagram = ""
    diagram_explanation = ""
    
    # 1. Delimiter-based parsing
    if think_marker in content or console_marker in content or report_marker in content:
        temp = content
        
        # Extract Diagram Explanation
        for exp_marker in explanation_markers:
            if exp_marker in temp:
                parts = temp.split(exp_marker)
                diagram_explanation = parts[1].strip()
                temp = parts[0].strip()
                break
            
        # Extract Mermaid Diagram
        for mer_marker in mermaid_markers:
            if mer_marker in temp:
                parts = temp.split(mer_marker)
                mermaid_diagram = parts[1].strip()
                temp = parts[0].strip()
                break
            
        # Extract Detailed Report
        if report_marker in temp:
            parts = temp.split(report_marker)
            detailed_report = parts[1].strip()
            temp = parts[0].strip()
            
        # Extract Console Message and Thinking
        if console_marker in temp:
            parts = temp.split(console_marker)
            console_message = parts[1].strip()
            if think_marker in parts[0]:
                thinking = parts[0].replace(think_marker, "").strip()
        else:
            if think_marker in temp:
                parts = temp.split(think_marker)
                thinking = parts[1].strip()
            else:
                console_message = temp
                
        # Clean up leading/trailing quotes on console message
        if console_message.startswith('"') and console_message.endswith('"'):
            console_message = console_message[1:-1].strip()
            
        report_data = detailed_report if detailed_report else content
        
        # Strip any sequence of equal signs (like === or ====) to satisfy the constraint of avoiding the "====" symbol.
        report_data = re.sub(r'={2,}', '', report_data).replace("***", "")
        console_message = re.sub(r'={2,}', '', console_message).replace("***", "").replace("**", "")
        thinking = re.sub(r'={2,}', '', thinking).replace("***", "").replace("**", "")
        diagram_explanation = re.sub(r'={2,}', '', diagram_explanation).replace("***", "").replace("**", "")
        
        return {
            fallback_key: report_data,
            "console_message": console_message if console_message else f"Tôi đã hoàn thành việc xử lý thông tin cho phần {fallback_key}.",
            "thinking": thinking,
            "mermaid_diagram": mermaid_diagram,
            "diagram_explanation": diagram_explanation
        }
            
    # 2. JSON-based parsing (fallback)
    json_content = content
    if json_content.startswith("```json"):
        json_content = json_content[7:]
    elif json_content.startswith("```"):
        json_content = json_content[3:]
    if json_content.endswith("```"):
        json_content = json_content[:-3]
    json_content = json_content.strip()
    
    try:
        start_idx = json_content.find('{')
        end_idx = json_content.rfind('}')
        if start_idx != -1 and end_idx != -1:
            json_str = json_content[start_idx:end_idx+1]
        else:
            json_str = json_content
            
        data = json.loads(json_str)
        if fallback_key in data and "console_message" in data:
            return {
                fallback_key: re.sub(r'={2,}', '', data[fallback_key]).replace("***", ""),
                "console_message": re.sub(r'={2,}', '', data["console_message"]).replace("***", "").replace("**", ""),
                "thinking": re.sub(r'={2,}', '', data.get("thinking", "")).replace("***", "").replace("**", ""),
                "mermaid_diagram": data.get("mermaid_diagram", ""),
                "diagram_explanation": re.sub(r'={2,}', '', data.get("diagram_explanation", "")).replace("***", "").replace("**", "")
            }
    except Exception:
        # Secondary JSON recovery by escaping newlines
        try:
            escaped = re.sub(r'(?<!\\)\n', r'\\n', json_content)
            start_idx = escaped.find('{')
            end_idx = escaped.rfind('}')
            if start_idx != -1 and end_idx != -1:
                data = json.loads(escaped[start_idx:end_idx+1])
                if fallback_key in data and "console_message" in data:
                    return {
                        fallback_key: re.sub(r'={2,}', '', data[fallback_key]).replace("***", ""),
                        "console_message": re.sub(r'={2,}', '', data["console_message"]).replace("***", "").replace("**", ""),
                        "thinking": re.sub(r'={2,}', '', data.get("thinking", "")).replace("***", "").replace("**", ""),
                        "mermaid_diagram": data.get("mermaid_diagram", ""),
                        "diagram_explanation": re.sub(r'={2,}', '', data.get("diagram_explanation", "")).replace("***", "").replace("**", "")
                    }
        except Exception:
            pass
            
    # 3. Raw Text fallback
    return {
        fallback_key: re.sub(r'={2,}', '', content).replace("***", ""),
        "console_message": f"Tôi đã hoàn thành việc xử lý thông tin cho phần {fallback_key}.".replace("**", ""),
        "thinking": "",
        "mermaid_diagram": "",
        "diagram_explanation": ""
    }
