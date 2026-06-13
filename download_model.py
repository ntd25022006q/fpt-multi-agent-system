import sys

# Configure encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("⌛ No-op placeholder: Model downloading skipped (package-free RAG).")
sys.exit(0)
