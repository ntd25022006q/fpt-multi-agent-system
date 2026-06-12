import os
import sys

# Configure encoding
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("⌛ Pre-downloading BAAI/bge-small-en-v1.5 model via FastEmbed for offline use...")

try:
    # Set the cache path inside the workspace so it is bundled
    from config import WORKSPACE_DIR
    cache_dir = os.path.join(WORKSPACE_DIR, "data", "models", "fastembed_cache")
    os.environ["FASTEMBED_CACHE_PATH"] = cache_dir
    
    from fastembed import TextEmbedding
    
    print(f"Downloading and caching BAAI/bge-small-en-v1.5 to local path: {cache_dir}...")
    model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    
    print("✅ Model pre-downloaded and cached successfully in project directory!")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to download model: {e}")
    sys.exit(1)
