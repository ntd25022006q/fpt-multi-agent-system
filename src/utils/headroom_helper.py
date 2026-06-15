import re
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# Configure logging
logger = logging.getLogger("HeadroomHelper")

# Attempt to import headroom-ai
try:
    from headroom import compress as headroom_compress
    HAS_HEADROOM = True
    logger.info("Successfully loaded headroom library.")
except ImportError:
    HAS_HEADROOM = False
    logger.info("headroom library not found. Falling back to local compression heuristics.")

def to_dict(msg):
    """Convert LangChain message objects to standardized dictionary format."""
    if isinstance(msg, SystemMessage):
        return {"role": "system", "content": msg.content}
    elif isinstance(msg, HumanMessage):
        return {"role": "user", "content": msg.content}
    elif isinstance(msg, AIMessage):
        return {"role": "assistant", "content": msg.content}
    elif isinstance(msg, dict):
        return msg
    elif hasattr(msg, "role") and hasattr(msg, "content"):
        return {"role": msg.role, "content": msg.content}
    else:
        return {"role": "user", "content": str(msg)}

def to_langchain(msg_dict, original_msg=None):
    """Convert standardized dictionary format back to LangChain message objects."""
    role = msg_dict.get("role")
    content = msg_dict.get("content")
    if role == "system":
        return SystemMessage(content=content)
    elif role == "user":
        return HumanMessage(content=content)
    elif role == "assistant":
        return AIMessage(content=content)
    else:
        if original_msg:
            return original_msg.__class__(content=content)
        return HumanMessage(content=content)

def local_compress_content(content: str) -> str:
    """Apply custom local compression to reduce token size while retaining meaning."""
    if not content or not isinstance(content, str):
        return content

    # 1. Whitespace & Newline collapse (saves ~10% of tokens on average)
    content = re.sub(r'[ \t]+', ' ', content)
    content = re.sub(r'\n{3,}', '\n\n', content)

    # 2. RAG Citation and noise reduction (remove academic paper brackets like [Author et al., 2025])
    content = re.sub(r'\[[A-Za-z\s\.\,\-\&]+et\s+al\.,\s*\d{4}\]', '', content)
    content = re.sub(r'\[\s*\d{4}\s*\]', '', content)  # e.g. [2025]

    # 3. Compact JSON-like lists/data within messages to remove formatting padding
    def compact_json(match):
        try:
            val = json.loads(match.group(0))
            return json.dumps(val, separators=(',', ':'))
        except Exception:
            return match.group(0)

    content = re.sub(r'\{[^{}]+\}', compact_json, content)

    # 4. Remove duplicate paragraphs/chunks (duplicate RAG text)
    paragraphs = content.split('\n\n')
    seen = set()
    unique_paragraphs = []
    for p in paragraphs:
        p_clean = p.strip().lower()
        # Simple semantic/exact deduplication: if long and not seen, keep it
        if len(p_clean) < 40:
            unique_paragraphs.append(p)
        elif p_clean not in seen:
            seen.add(p_clean)
            unique_paragraphs.append(p)

    return '\n\n'.join(unique_paragraphs)

def compress_messages(messages, model: str = None) -> list:
    """Compress a list of messages using headroom (if installed) or our local rules to save tokens."""
    if not messages:
        return messages

    # Try native headroom if available
    if HAS_HEADROOM:
        try:
            # Convert LangChain message objects to dict format for headroom
            dict_msgs = [to_dict(m) for m in messages]
            # Compress using headroom
            compressed_result = headroom_compress(dict_msgs, model=model)
            compressed_dicts = compressed_result.messages
            
            # Map back to original LangChain message types
            result = []
            for i, c_dict in enumerate(compressed_dicts):
                orig = messages[i] if i < len(messages) else None
                result.append(to_langchain(c_dict, orig))
            
            # Log savings info
            logger.info(
                f"Headroom Native: Compressed payload. Tokens before: {compressed_result.tokens_before}, "
                f"after: {compressed_result.tokens_after}, saved: {compressed_result.tokens_saved} "
                f"({compressed_result.compression_ratio*100:.1f}% savings)."
            )
            return result
        except Exception as e:
            logger.warning(f"Error calling native headroom.compress: {e}. Falling back to local compression.")

    # Fallback / Local heuristic compression
    result = []
    for msg in messages:
        if isinstance(msg, (SystemMessage, HumanMessage, AIMessage)):
            new_content = local_compress_content(msg.content)
            result.append(msg.__class__(content=new_content))
        elif isinstance(msg, dict) and "content" in msg:
            new_dict = msg.copy()
            new_dict["content"] = local_compress_content(msg["content"])
            result.append(new_dict)
        else:
            result.append(msg)

    # Log savings info for local compression
    orig_len = sum(len(to_dict(m).get("content", "")) for m in messages)
    comp_len = sum(len(to_dict(m).get("content", "")) for m in result)
    logger.info(f"Headroom Local: Compressed payload from {orig_len} to {comp_len} chars.")
    return result
