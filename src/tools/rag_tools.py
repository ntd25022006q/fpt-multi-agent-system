import os
import math
import re
from langchain_core.documents import Document
from rich.console import Console
from config import RAW_DATA_DIR, CHROMA_DB_DIR, WORKSPACE_DIR

console = Console()

_embeddings = None
_vectorstore = None
_all_docs = None

class CustomBM25:
    """A lightweight, self-contained implementation of BM25 for ranking documents."""
    
    def __init__(self, documents: list[Document]):
        """Initialize BM25 with a list of Document objects.
        
        Args:
            documents: List of LangChain Document objects to index.
        """
        self.documents = documents
        self.k1 = 1.5
        self.b = 0.75
        
        self.corpus_size = len(documents)
        self.doc_tokens = [self._tokenize(doc.page_content) for doc in documents]
        self.doc_lengths = [len(tokens) for tokens in self.doc_tokens]
        self.avg_doc_length = sum(self.doc_lengths) / max(self.corpus_size, 1)
        
        # Calculate document frequency for each term
        self.doc_freqs = {}
        for tokens in self.doc_tokens:
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.doc_freqs[token] = self.doc_freqs.get(token, 0) + 1
                
        # Calculate Inverse Document Frequency (IDF) for each term
        self.idfs = {}
        for token, freq in self.doc_freqs.items():
            self.idfs[token] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def _tokenize(self, text: str) -> list[str]:
        """Tokenize text into lowercase words.
        
        Args:
            text: Raw input text.
            
        Returns:
            List of clean lowercase tokens.
        """
        text = text.lower()
        # Capture alphanumeric characters and Vietnamese diacritics
        return re.findall(r'[a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+', text)

    def get_scores(self, query_tokens: list[str]) -> list[float]:
        """Calculate BM25 scores for all indexed documents.
        
        Args:
            query_tokens: List of query tokens.
            
        Returns:
            List of scores matching document indexes.
        """
        scores = []
        for i in range(self.corpus_size):
            score = 0.0
            doc_len = self.doc_lengths[i]
            tokens_dict = {}
            for token in self.doc_tokens[i]:
                tokens_dict[token] = tokens_dict.get(token, 0) + 1
                
            for token in query_tokens:
                if token in tokens_dict:
                    idf = self.idfs.get(token, 0.0)
                    tf = tokens_dict[token]
                    numerator = tf * (self.k1 + 1)
                    denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_length))
                    score += idf * (numerator / denominator)
            scores.append(score)
        return scores

    def search(self, query: str, k: int = 5) -> list[tuple[Document, float]]:
        """Search index and return top k documents with their relevance scores.
        
        Args:
            query: User search query.
            k: Number of documents to retrieve.
            
        Returns:
            List of tuples (Document, score) sorted by score.
        """
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return [(doc, 0.0) for doc in self.documents[:k]]
            
        scores = self.get_scores(query_tokens)
        doc_scores = list(zip(self.documents, scores))
        doc_scores.sort(key=lambda x: x[1], reverse=True)
        return doc_scores[:k]



def get_all_docs() -> list[Document]:
    """Load markdown and text files from RAW_DATA_DIR directly and chunk them in memory."""
    global _all_docs
    if _all_docs is not None:
        return _all_docs
    
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    _all_docs = []
    if not os.path.exists(RAW_DATA_DIR):
        return []
        
    raw_docs = []
    for filename in os.listdir(RAW_DATA_DIR):
        if filename.endswith(".md") or filename.endswith(".txt"):
            filepath = os.path.join(RAW_DATA_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                raw_docs.append(Document(page_content=content, metadata={"source": filepath}))
            except Exception:
                pass
                
    if not raw_docs:
        return []
        
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " "]
    )
    _all_docs = splitter.split_documents(raw_docs)
    return _all_docs

def retrieve_hybrid(query: str, k: int = 5) -> list[Document]:
    """Retrieve top k documents using lightweight, in-memory BM25 search."""
    docs = get_all_docs()
    if not docs:
        return []
    bm25 = CustomBM25(docs)
    bm25_results_with_scores = bm25.search(query, k=k)
    return [doc for doc, score in bm25_results_with_scores]

def expand_query(topic: str) -> list[str]:
    """Generate search variations using a lightweight model call to improve recall.
    
    Args:
        topic: User research topic.
        
    Returns:
        List of query variations.
    """
    try:
        from src.utils.llm_factory import create_llm
        from langchain_core.messages import SystemMessage, HumanMessage
        
        # Use the lightweight ministral-3:8b model for query expansion
        llm = create_llm("ministral-3:8b", temperature=0.1, max_tokens=150)
        prompt = (
            "You are an information retrieval expert. Given a user's consulting query, "
            "generate 2 additional search query variations (for a vector search system) "
            "to retrieve the most relevant background documents. "
            "Format the output as a simple list with one query per line. Do not write any other explanations or list numbering."
        )
        res = llm.invoke([
            SystemMessage(content=prompt),
            HumanMessage(content=f"Consulting Query: {topic}")
        ])
        queries = [topic]
        for line in res.content.strip().split("\n"):
            line_cleaned = re.sub(r'^\d+[\.\-]\s*', '', line.strip()).strip()
            # Remove quotes if the LLM outputted them
            if line_cleaned.startswith('"') and line_cleaned.endswith('"'):
                line_cleaned = line_cleaned[1:-1].strip()
            if line_cleaned:
                queries.append(line_cleaned)
        return list(set(queries))
    except Exception as e:
        console.print(f"[red]   ⚠️ Query expansion failed: {str(e)}. Using raw topic.")
        return [topic]

def get_rag_context(topic: str, query_type: str = "consulting") -> tuple[str, list[str]]:
    """Retrieve hybrid results, deduplicate context and extract citations.
    
    Args:
        topic: User topic.
        query_type: Type of query ('qa' or 'consulting').
        
    Returns:
        Tuple containing combined context string and list of document citations.
    """
    console.print(f"[cyan]   🔍 Running fast RAG Search on topic: '{topic}' (Type: {query_type})...[/]")
    # Bypass query expansion entirely for instant retrieval
    queries = [topic]
    
    all_retrieved = []
    for q in queries:
        docs = retrieve_hybrid(q, k=5)  # Retrieve top 5 per query variation for richer context
        all_retrieved.extend(docs)
        
    # Deduplicate retrieved documents based on page content
    seen_content = set()
    unique_docs = []
    citations = []
    
    for doc in all_retrieved:
        content = doc.page_content.strip()
        if content not in seen_content:
            seen_content.add(content)
            unique_docs.append(doc)
            
            # Get relative path from RAW_DATA_DIR to preserve subdirectory structure for citations
            source_path = doc.metadata.get("source", "unknown_source.md")
            try:
                rel_path = os.path.relpath(source_path, RAW_DATA_DIR).replace("\\", "/")
            except Exception:
                rel_path = os.path.basename(source_path)
            if rel_path not in citations:
                citations.append(rel_path)
                
    # Sort citations alphabetically
    citations.sort()
    
    # Merge context into a single string
    formatted_context = ""
    for idx, doc in enumerate(unique_docs, start=1):
        formatted_context += f"\n--- [Tài liệu {idx}] ---\n{doc.page_content}\n"
        
    console.print(f"   ✅ Retrieved {len(unique_docs)} chunks from {len(citations)} source documents.")
    
    return formatted_context.strip(), citations
