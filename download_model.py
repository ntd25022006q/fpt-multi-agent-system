import os
import sys

# Configure encoding
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("⌛ Pre-downloading sentence-transformers/all-MiniLM-L6-v2 model for offline use...")

try:
    from sentence_transformers import SentenceTransformer
    
    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    target_dir = os.path.join("data", "models", "all-MiniLM-L6-v2")
    
    print(f"Downloading {model_name}...")
    model = SentenceTransformer(model_name)
    
    print(f"Saving model to local path: {target_dir}...")
    os.makedirs(target_dir, exist_ok=True)
    model.save(target_dir)
    
    print("✅ Model pre-downloaded and saved successfully!")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to download model: {e}")
    sys.exit(1)
