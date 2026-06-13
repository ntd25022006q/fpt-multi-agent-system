import sys

# Configure encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("⌛ No-op placeholder: ChromaDB vector store pre-building skipped (in-memory BM25).")
sys.exit(0)
