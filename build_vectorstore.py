import os
import sys

# Configure stdout/stderr for UTF-8
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("⌛ Pre-building ChromaDB vector store for offline/fast initialization...")

try:
    from src.tools.rag_tools import initialize_vectorstore
    
    # Trigger the initialization which builds and persists the database
    vectorstore = initialize_vectorstore()
    print("✅ ChromaDB vector store pre-built and persisted successfully!")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to pre-build ChromaDB: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
