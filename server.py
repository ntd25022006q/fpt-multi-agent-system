"""
FPT Software — AI-First Research & Detailed Report Dashboard
FastAPI backend: SSE pipeline streaming + file downloads + localtunnel bypass
"""
import json
import os
import sys
import time
import asyncio
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse, Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.graph import app as graph_app
from config import WORKSPACE_DIR, OUTPUT_DIR, RUNNING_DIR

# ── Encoding ──────────────────────────────────────────────────────────────────
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="FPT Software AI-First Research & Detailed Report Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(WORKSPACE_DIR) / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Mount static assets under /assets (CSS, JS, fonts etc.)
# We do NOT mount at "/" to avoid swallowing /api/* routes
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")


# ── Bypass header helper ──────────────────────────────────────────────────────
BYPASS_HEADERS = {
    "Bypass-Tunnel-Reminder": "true",
    "ngrok-skip-browser-warning": "true",
    "X-Accel-Buffering": "no",
}


# ── Middleware: inject bypass headers on every response ───────────────────────
@app.middleware("http")
async def add_bypass_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in BYPASS_HEADERS.items():
        response.headers[k] = v
    return response


@app.on_event("startup")
async def startup_event():
    # Pre-initialize RAG cached documents in memory
    from src.tools.rag_tools import get_all_docs
    print("⌛ Pre-initializing RAG documents in memory...")
    try:
        await asyncio.to_thread(get_all_docs)
        print("✅ RAG documents cached in memory and ready!")
    except Exception as e:
        print(f"⚠️ Failed to pre-initialize RAG documents: {e}")


# ─────────────────────────────────────────────────────────────────────────────
#  STATIC FILE ROUTES  (explicit, so /api/* is never shadowed)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_index():
    """Serve index.html at the root."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>index.html not found</h1>", status_code=404)


@app.get("/style.css", include_in_schema=False)
async def serve_css():
    return FileResponse(str(STATIC_DIR / "style.css"), media_type="text/css")


@app.get("/app.js", include_in_schema=False)
async def serve_js():
    return FileResponse(str(STATIC_DIR / "app.js"), media_type="application/javascript")


@app.get("/favicon.png", include_in_schema=False)
async def serve_favicon_png():
    return FileResponse(str(STATIC_DIR / "favicon.png"), media_type="image/png")


@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon_ico():
    return FileResponse(str(STATIC_DIR / "favicon.png"), media_type="image/png")


# ─────────────────────────────────────────────────────────────────────────────
#  API ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/diagnose")
def diagnose():
    import os
    from config import WORKSPACE_DIR, CHROMA_DB_DIR
    local_model_path = os.path.join(WORKSPACE_DIR, "data", "models", "all-MiniLM-L6-v2")
    exists = os.path.exists(local_model_path)
    files = os.listdir(local_model_path) if exists else []
    
    chroma_exists = os.path.exists(CHROMA_DB_DIR)
    chroma_files = os.listdir(CHROMA_DB_DIR) if chroma_exists else []
    
    from src.utils.llm_factory import _model_latencies
    
    return {
        "workspace": WORKSPACE_DIR,
        "local_model_path": local_model_path,
        "model_exists": exists,
        "model_files": files,
        "chroma_db_dir": CHROMA_DB_DIR,
        "chroma_exists": chroma_exists,
        "chroma_files": chroma_files,
        "model_latencies": _model_latencies
    }

@app.get("/api/report")
def get_report(response: Response):
    """Return the latest generated report, diagram, and explanation as JSON."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    report_path = Path(OUTPUT_DIR) / "research_report.md"
    diagram_path = Path(OUTPUT_DIR) / "diagram.mermaid"
    explanation_path = Path(OUTPUT_DIR) / "diagram_explanation.txt"
    
    report = report_path.read_text(encoding="utf-8") if report_path.exists() else "# Báo cáo chưa được tạo"
    diagram = diagram_path.read_text(encoding="utf-8") if diagram_path.exists() else ""
    explanation = explanation_path.read_text(encoding="utf-8") if explanation_path.exists() else ""
    
    return {
        "report": report,
        "diagram": diagram,
        "explanation": explanation
    }





@app.get("/api/download-csv")
def download_csv():
    path = Path(OUTPUT_DIR) / "fpt_consulting_data.csv"
    if path.exists():
        return FileResponse(str(path), media_type="text/csv",
                            filename="fpt_consulting_data.csv")
    return {"error": "CSV not generated yet — run the pipeline first."}


@app.get("/api/download-markdown")
def download_markdown():
    path = Path(OUTPUT_DIR) / "research_report.md"
    if path.exists():
        return FileResponse(
            str(path),
            media_type="text/markdown",
            filename=f"FPT_BaoCao_ChiTiet.md",
            headers={**BYPASS_HEADERS}
        )
    return {"error": "Report not generated yet — run the pipeline first."}


@app.get("/api/run")
async def run_agents(topic: str):
    """LangGraph multi-agent pipeline via Server-Sent Events."""

    async def event_generator():
        initial_state = {
            "topic": topic,
            "research_data": "",
            "analysis": "",
            "risks": "",
            "recommendations": "",
            "report": "",
            "messages": [],
            "irrelevant": False,
            "csv_data": "",
            "retrieved_context": "",
            "citations": [],
            "query_type": "consulting",
            "language": "vi",
        }

        stream_queue = asyncio.Queue()

        async def run_graph_task():
            try:
                # Clean up old reports and diagrams from previous runs
                for filename in ["research_report.md", "diagram.mermaid", "diagram_explanation.txt", "fpt_consulting_data.csv"]:
                    filepath = Path(OUTPUT_DIR) / filename
                    if filepath.exists():
                        try:
                            filepath.unlink()
                        except Exception:
                            pass

                # Run the graph app
                final_state = await graph_app.ainvoke(
                    initial_state,
                    config={
                        "configurable": {
                            "stream_queue": stream_queue
                        }
                    }
                )
                await stream_queue.put({
                    "type": "graph_complete",
                    "final_state": final_state
                })
            except Exception as exc:
                import traceback
                await stream_queue.put({
                    "type": "error",
                    "error": str(exc) + "\n" + traceback.format_exc()
                })
            finally:
                await stream_queue.put({
                    "type": "done_sentinel"
                })

        # Start execution in the background
        asyncio.create_task(run_graph_task())

        start_time = time.time()
        agent_tokens = {
            "guardrail": 0,
            "researcher": 0,
            "analyst": 0,
            "risk_assessor": 0,
            "recommender": 0,
            "reporter": 0
        }
        agent_models = {
            "guardrail": "",
            "researcher": "",
            "analyst": "",
            "risk_assessor": "",
            "recommender": "",
            "reporter": ""
        }
        agent_toks_per_sec = {
            "guardrail": 0.0,
            "researcher": 0.0,
            "analyst": 0.0,
            "risk_assessor": 0.0,
            "recommender": 0.0,
            "reporter": 0.0
        }
        agent_durations = {
            "guardrail": 0.0,
            "researcher": 0.0,
            "analyst": 0.0,
            "risk_assessor": 0.0,
            "recommender": 0.0,
            "reporter": 0.0
        }

        try:
            while True:
                event = await stream_queue.get()
                if event.get("type") == "done_sentinel":
                    break
                elif event.get("type") == "error":
                    yield f"data: {json.dumps({'error': event['error']}, ensure_ascii=False)}\n\n"
                    break
                elif event.get("type") == "graph_complete":
                    final_state = event["final_state"]
                    elapsed = time.time() - start_time
                    
                    total_tokens = sum(agent_tokens.values())
                    agents_count = 1 if final_state.get("irrelevant") else (3 if final_state.get("query_type") == "qa" else 6)
                    
                    # Save clean report without metrics suffix as requested
                    final_report = final_state.get("report", "# No report generated").replace("***", "")
                    Path(OUTPUT_DIR).mkdir(exist_ok=True)
                    (Path(OUTPUT_DIR) / "research_report.md").write_text(final_report, encoding="utf-8")
                    
                    # Read diagram and explanation if they exist to pass directly in SSE done event
                    diagram_path = Path(OUTPUT_DIR) / "diagram.mermaid"
                    explanation_path = Path(OUTPUT_DIR) / "diagram_explanation.txt"
                    diagram = diagram_path.read_text(encoding="utf-8") if diagram_path.exists() else ""
                    explanation = explanation_path.read_text(encoding="utf-8") if explanation_path.exists() else ""
                    
                    # Yield completion with stats, report, diagram, explanation and individual token/model/speed counts
                    yield f"data: {json.dumps({'done': True, 'report': final_report, 'diagram': diagram, 'explanation': explanation, 'stats': {'time': f'{elapsed:.3f}s', 'tokens': f'{total_tokens:,}', 'agents': agents_count, 'irrelevant': final_state.get('irrelevant', False), 'agent_tokens': agent_tokens, 'agent_models': agent_models, 'agent_toks_per_sec': agent_toks_per_sec, 'agent_durations': agent_durations}}, ensure_ascii=False)}\n\n"
                elif event.get("type") == "node_end":
                    node_name = event.get("node")
                    tokens = event.get("tokens", 0)
                    if node_name in agent_tokens:
                        agent_tokens[node_name] = tokens
                    if node_name in agent_models and event.get("model"):
                        agent_models[node_name] = event.get("model", "")
                    if node_name in agent_toks_per_sec:
                        agent_toks_per_sec[node_name] = event.get("toks_per_sec", 0.0)
                    if node_name in agent_durations:
                        agent_durations[node_name] = event.get("duration", 0.0)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                else:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    
        except Exception as exc:
            import traceback
            yield f"data: {json.dumps({'error': str(exc) + chr(10) + traceback.format_exc()})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={**BYPASS_HEADERS, "Cache-Control": "no-cache, no-transform"},
    )

# ─────────────────────────────────────────────────────────────────────────────

#  ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
