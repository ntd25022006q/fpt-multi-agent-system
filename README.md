<h1 align="center">Hệ thống phân tích chiến lược kiến trúc và tự động hóa báo cáo doanh nghiệp dựa trên Multi-Agent</h1>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/LangGraph-orchestrator-121212" alt="LangGraph">
  <img src="https://img.shields.io/badge/ChromaDB-vector%20db-orange" alt="ChromaDB">
</p>

<p align="center">
  Giải pháp tự động hóa tư vấn công nghệ thông tin và chuyển đổi số cho doanh nghiệp sử dụng kiến trúc đa tác nhân (Multi-Agent) thông minh kết hợp cơ chế truy xuất tri thức lai (Hybrid RAG) và định tuyến động. Dự án giải quyết bài toán tối ưu hóa quy trình tiền khả thi (Pre-sales), phá vỡ các rào cản thông tin nội bộ và tự động hóa việc biên soạn báo cáo kỹ thuật chuẩn chỉnh.
</p>

---

<h2 align="center">Kiến trúc hệ thống và luồng điều phối đa tác nhân</h2>

<p align="center">
  Hệ thống được thiết kế theo mô hình phân tách độc lập giữa dịch vụ máy chủ Backend (FastAPI xử lý đồ thị AI) và giao diện người dùng Frontend (Dashboard hiển thị trực quan). Mọi luồng tính toán đều được điều khiển bởi đồ thị trạng thái tuần tự LangGraph, cho phép quản lý trạng thái phiên làm việc (Stateful Session) thông qua cấu trúc dữ liệu chung <code>ResearchState</code>.
</p>

### 1. Cơ chế định tuyến động (Dynamic Routing)
Tùy thuộc vào câu hỏi đầu vào của người dùng, bộ định tuyến có điều kiện (Conditional Router) sẽ tự động phân tích độ phức tạp để phân nhánh xử lý:
- Nhánh từ chối: Chặn ngay lập tức tại tác nhân lọc ngữ cảnh nếu câu hỏi không thuộc phạm vi công nghệ hoặc vận hành doanh nghiệp.
- Nhánh Hỏi - Đáp đơn giản (Q&A Flow): Bỏ qua các bước phân tích sâu và đi thẳng từ Tác nhân Nghiên cứu đến Tác nhân Biên soạn báo cáo nhằm rút ngắn thời gian xử lý và tiết kiệm chi phí vận hành API.
- Nhánh phân tích chiến lược (Strategic Flow): Kích hoạt tuần tự toàn bộ 6 tác nhân AI để tiến hành so sánh đối chiếu kiến trúc, đánh giá rủi ro an ninh mạng và lập lộ trình triển khai chi tiết kèm KPI.

### 2. Vai trò của các tác nhân chuyên biệt trong quy trình tư vấn
- Tác nhân Lọc ngữ cảnh (Guardrail Agent): Đảm nhận vai trò chốt chặn bảo mật, xác thực ngữ cảnh câu hỏi đầu vào, lập luận và phân loại tính hợp lệ.
- Tác nhân Nghiên cứu (Researcher Agent): Thực hiện truy vấn hệ thống tri thức, tổng hợp tài liệu thực tế và các nghiên cứu điển hình từ cơ sở dữ liệu.
- Tác nhân Phân tích (Analyst Agent): Phân tích ưu và nhược điểm của các giải pháp công nghệ, xây dựng ma trận đánh đổi đa chiều.
- Tác nhân Đánh giá rủi ro (Risk Assessor Agent): Nhận diện rủi ro kỹ thuật, rủi ro vận hành và thiết lập ma trận phân loại mức độ rủi ro tương ứng.
- Tác nhân Đề xuất lộ trình (Recommender Agent): Hoạch định kế hoạch triển khai chi tiết qua từng giai đoạn và xác định các chỉ số KPI đo lường hiệu quả.
- Tác nhân Biên soạn báo cáo (Reporter Agent): Tổng hợp dữ liệu từ các tác nhân trước để biên soạn báo cáo hoàn chỉnh dưới định dạng Markdown và kết xuất sơ đồ kiến trúc hệ thống tự động.

---

<h2 align="center">Sơ đồ cơ chế kỹ thuật cốt lõi</h2>

### 1. Cơ chế truy xuất tri thức lai (Hybrid RAG)
<p align="center">
  Nhằm khắc phục hiện tượng ảo tưởng của mô hình ngôn ngữ lớn (LLM Hallucination), hệ thống sử dụng cơ chế tìm kiếm tri thức lai kết hợp hai phương pháp tìm kiếm:
</p>

```mermaid
graph TD
    Query([Câu hỏi đầu vào]) --> Embedding[Trích xuất Vector Embedding]
    Embedding --> DenseSearch[(ChromaDB Dense Search)]
    Query --> SparseSearch[Rank-BM25 Sparse Search]
    DenseSearch --> RRF[Bộ lọc xếp hạng Reciprocal Rank Fusion - RRF]
    SparseSearch --> RRF
    RRF --> TopContext[Ngữ cảnh tối ưu nhất]
    TopContext --> Researcher[Tác nhân Nghiên cứu]
```

### 2. Luồng streaming dữ liệu thời gian thực (FastAPI SSE)
<p align="center">
  Hệ thống sử dụng giao thức Server-Sent Events để truyền tải trực tiếp kết quả suy luận của từng Agent dưới dạng luồng dữ liệu thời gian thực về Frontend:
</p>

```mermaid
graph LR
    Frontend([Giao diện Client]) -- GET /api/stream --> Server[FastAPI SSE Server]
    Server --> LangGraph[Tiến trình LangGraph]
    LangGraph -- Tạo Token --> SSEChannel[Kênh truyền Stream]
    SSEChannel -- SSE Event (text/event-stream) --> Frontend
    Frontend -- Hiển thị Real-time --> Console[Console Dashboard]
```

### 3. Cơ chế dự phòng mô hình tự động (Fast Fallback)
<p align="center">
  Cấu hình kết nối mô hình được tích hợp cơ chế dự phòng nhanh để đảm bảo độ tin cậy và sẵn sàng cao của hệ thống:
</p>

```mermaid
graph TD
    Node([Bắt đầu Node]) --> Primary[Mô hình chính: gemma3:27b]
    Primary --> TimeoutCheck{Thời gian chờ > 15s?}
    TimeoutCheck -- Không / Lỗi --> Fallback1[Mô hình dự phòng 1: gemma3:12b]
    TimeoutCheck -- Thành công --> Success([Hoàn thành và lưu trạng thái])
    Fallback1 --> TimeoutCheck1{Thời gian chờ > 10s?}
    TimeoutCheck1 -- Không / Lỗi --> Fallback2[Mô hình dự phòng 2: ministral-3:8b]
    TimeoutCheck1 -- Thành công --> Success
    Fallback2 --> Success
```

---

<h2 align="center">Hướng dẫn cài đặt và vận hành dành cho nhà phát triển</h2>

### 1. Thiết lập môi trường ảo và cài đặt thư viện
```bash
# Tạo môi trường ảo và kích hoạt trên Windows
python -m venv .venv
.venv\Scripts\activate

# Tạo môi trường ảo và kích hoạt trên Linux / macOS
python -m venv .venv
source .venv/bin/activate

# Cài đặt các thư viện phụ thuộc
pip install -r requirements.txt
```

### 2. Cấu hình biến môi trường
Tạo một tệp tin đặt tên là `.env` tại thư mục gốc của dự án với cấu trúc như sau:
```env
OLLAMA_API_KEY=thong_tin_api_key_cua_ban
OLLAMA_BASE_URL=https://ollama.com/v1
```
*(Tệp tin `.env` đã được cấu hình trong `.gitignore` để tránh đẩy lên các hệ thống quản lý mã nguồn công khai, giúp bảo vệ khóa truy cập).*

### 3. Khởi chạy máy chủ API
Khởi chạy dịch vụ backend FastAPI lắng nghe tại cổng `8000`:
```bash
python main.py --server
```

### 4. Chạy kiểm thử tự động (RAG Testing)
Hệ thống tích hợp sẵn kịch bản kiểm thử tự động giúp kiểm tra độ chính xác của cơ chế RAG lai (Hybrid RAG) và kết nối ChromaDB:
```bash
.venv\Scripts\python.exe tests/test_rag.py
```

### 5. Hướng dẫn triển khai đám mây (Vercel & Render)
Để hệ thống hoạt động 24/7 độc lập và gọi trực tiếp tới API Ollama mà không phụ thuộc vào máy tính cá nhân của bạn:

#### A. Triển khai Frontend lên Vercel
1. Đăng nhập [Vercel](https://vercel.com) bằng tài khoản GitHub của bạn.
2. Tạo dự án mới, chọn repo `fpt-multi-agent-system`.
3. Chỉ định thư mục chạy chính (Root Directory) là thư mục `static/` của dự án.
4. Nhấn **Deploy** để nhận đường link giao diện HTTPS miễn phí.

#### B. Triển khai Backend lên Render
1. Tạo một **Web Service** mới trên [Render](https://render.com) liên kết với repo GitHub của bạn.
2. Cấu hình các thông số môi trường chuẩn xác:
   - **Language:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
3. Thêm 2 biến môi trường tại mục **Environment Variables** để cấu hình API Key:
   - `OLLAMA_API_KEY`: *Khóa API của bạn*.
   - `OLLAMA_BASE_URL`: *Đường dẫn API Ollama của bạn* (mặc định: `https://ollama.com/v1`).
4. Chờ Render khởi chạy xong, copy địa chỉ HTTPS được cấp, mở trang giao diện Vercel, chọn biểu tượng **Cài đặt (bánh răng)** ở góc trên bên phải bảng yêu cầu và dán địa chỉ vào để hoàn tất kết nối.

---


<h2 align="center">Quy trình xử lý thực tế qua các ảnh chụp màn hình</h2>

### Ảnh 1: Giao diện lọc nội dung và từ chối câu hỏi ngoài phạm vi
<p align="center">
  Màn hình ghi nhận hành vi của hệ thống khi lọc ngữ cảnh và từ chối các câu hỏi nằm ngoài phạm vi chuyên môn được quy định. Tác nhân Lọc ngữ cảnh xác định truy vấn không hợp lệ và đi thẳng tới kết thúc đồ thị (END Node) để bảo vệ tài nguyên.
</p>
<p align="center">
  <img src="docs/images/screenshot1.jpg" alt="Chặn câu hỏi ngoài phạm vi" width="85%">
</p>

### Ảnh 2 và Ảnh 3: Luồng xử lý rút gọn cho câu hỏi đơn giản
<p align="center">
  Minh họa cơ chế định tuyến động tự động đi luồng ngắn (3 tác nhân bao gồm Guardrail, Researcher và Reporter) đối với các câu hỏi Hỏi - Đáp cơ bản, bỏ qua các bước đánh giá chuyên sâu để tối ưu hóa hiệu năng phản hồi.
</p>
<p align="center">
  <img src="docs/images/screenshot2.jpg" alt="Bắt đầu xử lý câu hỏi dễ" width="85%">
</p>
<p align="center">
  <img src="docs/images/screenshot3.jpg" alt="Hoàn thành báo cáo câu hỏi dễ" width="85%">
</p>

### Ảnh 4 và Ảnh 5: Quy trình phân tích toàn diện cho câu hỏi khó
<p align="center">
  Thể hiện quy trình hoạt động toàn phần đi qua cả 6 tác nhân chuyên biệt. Luồng xử lý thu thập dữ liệu chuyên sâu, tiến hành phân tích so sánh giải pháp, đánh giá ma trận rủi ro hệ thống và xây dựng lộ trình thực thi để giải quyết các bài toán chiến lược phức tạp.
</p>
<p align="center">
  <img src="docs/images/screenshot4.jpg" alt="Khởi chạy luồng phân tích sâu" width="85%">
</p>
<p align="center">
  <img src="docs/images/screenshot5.jpg" alt="Tổng hợp thông tin chiến lược" width="85%">
</p>

### Ảnh 6: Giao diện trực quan hóa báo cáo chiến lược chi tiết
<p align="center">
  Màn hình hiển thị kết quả sau khi hoàn thiện và xuất bản báo cáo chiến lược chi tiết trực tiếp trên Dashboard. Báo cáo được biên soạn dưới dạng tài liệu Markdown chuẩn chỉnh, loại bỏ hoàn toàn các ký tự kỹ thuật thừa giúp hiển thị trực quan và dễ đọc.
</p>
<p align="center">
  <img src="docs/images/screenshot6.jpg" alt="Kết quả báo cáo chi tiết" width="85%">
</p>

### Ảnh 7: Bản vẽ sơ đồ kiến trúc hệ thống Microservices
<p align="center">
  Màn hình hiển thị kết quả sau khi hoàn thiện và kết xuất sơ đồ kiến trúc hệ thống trực tiếp trên Dashboard. Sơ đồ vẽ chi tiết giải pháp chuyển đổi lên mô hình Microservices bao gồm API Gateway, cơ chế xác thực phân quyền, các phân hệ dịch vụ độc lập, cơ sở dữ liệu phân tán PostgreSQL, ClickHouse Data Warehouse, Istio Service Mesh, hệ thống giám sát và tích hợp an ninh bảo mật.
</p>
<p align="center">
  <img src="docs/images/screenshot7.jpg" alt="Bản vẽ sơ đồ kiến trúc hệ thống Microservices" width="85%">
</p>
