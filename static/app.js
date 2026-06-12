document.addEventListener('DOMContentLoaded', () => {

    // ── UI Elements ──────────────────────────────────────────────────────────
    const topicInput       = document.getElementById('topic-input');
    const runBtn           = document.getElementById('run-btn');
    const downloadGroup    = document.getElementById('download-group');
    const downloadPdfBtn   = document.getElementById('download-pdf-btn');
    const downloadDocxBtn  = document.getElementById('download-docx-btn');
    const downloadDiagBtn  = document.getElementById('download-diagram-btn');
    const downloadMdBtn    = document.getElementById('download-md-btn');

    const statTime         = document.getElementById('stat-time');
    const statTokens       = document.getElementById('stat-tokens');
    const statAgents       = document.getElementById('stat-agents');
    const statStatus       = document.getElementById('stat-status');

    const consoleOutput    = document.getElementById('console-output');
    const activeAgentBadge = document.getElementById('active-agent-badge');

    const reportView       = document.getElementById('report-view');
    const mermaidOutput    = document.getElementById('mermaid-render-output');
    const rawMarkdownText  = document.getElementById('raw-markdown-text');
    const copyBtn          = document.getElementById('copy-btn');

    const tabBtns  = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Zoom & scale elements
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const zoomLevelEl = document.getElementById('zoom-level');

    // Stop & Upload elements
    const stopBtn = document.getElementById('stop-btn');
    const chatUploadBtn = document.getElementById('chat-upload-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    const chatUploadStatusText = document.getElementById('chat-upload-status-text');

    const serverSettingsBtn = document.getElementById('server-settings-btn');
    const serverSettingsGroup = document.getElementById('server-settings-group');
    const serverUrlInput = document.getElementById('server-url-input');

    if (serverUrlInput) {
        serverUrlInput.value = localStorage.getItem('fpt_server_url') || 'https://fpt-multi-agent-system.onrender.com';
        serverUrlInput.addEventListener('input', () => {
            localStorage.setItem('fpt_server_url', serverUrlInput.value.trim());
            checkServerConnection();
        });
    }

    if (serverSettingsBtn && serverSettingsGroup) {
        serverSettingsBtn.addEventListener('click', () => {
            const isHidden = serverSettingsGroup.style.display === 'none';
            serverSettingsGroup.style.display = isHidden ? 'block' : 'none';
            serverSettingsBtn.style.color = isHidden ? 'var(--fpt-orange)' : '';
        });
    }

    function getApiPrefix() {
        if (!serverUrlInput) return 'https://fpt-multi-agent-system.onrender.com';
        let val = serverUrlInput.value.trim();
        if (!val) {
            val = 'https://fpt-multi-agent-system.onrender.com';
        }
        if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
            val = 'http://' + val;
        }
        if (val && val.endsWith('/')) {
            val = val.slice(0, -1);
        }
        return val;
    }

    function checkServerConnection() {
        const dot = document.getElementById('connection-status-dot');
        const text = document.getElementById('server-connection-text');
        if (!dot) return;

        const url = getApiPrefix() + '/api/report';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        fetch(url, { method: 'GET', signal: controller.signal })
            .then(res => {
                clearTimeout(timeoutId);
                dot.style.backgroundColor = '#10b981';
                dot.style.boxShadow = '0 0 8px #10b981';
                dot.title = 'Máy chủ đang hoạt động (Online)';
                if (text) {
                    text.textContent = 'Kết nối tốt (Online)';
                    text.style.color = '#10b981';
                }
            })
            .catch(err => {
                clearTimeout(timeoutId);
                dot.style.backgroundColor = '#ef4444';
                dot.style.boxShadow = '0 0 8px #ef4444';
                dot.title = 'Không thể kết nối máy chủ (Offline)';
                if (text) {
                    text.textContent = 'Ngoại tuyến (Offline)';
                    text.style.color = '#ef4444';
                }
            });
    }

    let currentZoom = 100;
    let uploadedDiagramDataUrl = null;

    let eventSource   = null;
    let runStartTime  = null;
    let timerInterval = null;

    // Typewriter queue
    let printQueue = [];
    let isPrinting = false;

    // Holds the latest raw markdown content
    let currentMarkdown = '';

    let hasAnalystRun = false;
    let currentDiagramCode = '';
    let hideAnalysisLogText = localStorage.getItem('fpt_hide_analysis_log_text') === 'true';

    // ── Tab Switching ────────────────────────────────────────────────────────
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    if (copyBtn && rawMarkdownText) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(rawMarkdownText.value)
                .then(() => {
                    const orig = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đã sao chép!';
                    copyBtn.style.color = '#16a069';
                    setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.style.color = ''; }, 2000);
                })
                .catch(err => console.error('Clipboard error:', err));
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  DOWNLOAD FUNCTIONS
    // ════════════════════════════════════════════════════════════════════════

    // ── Helper: Build clean print-ready HTML ─────────────────────────────────
    function buildPrintHTML(bodyContent, topic) {
        const dateStr = new Date().toLocaleDateString('vi-VN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Báo Cáo Chi Tiết — FPT Software</title>
<style>
@page { size: A4; margin: 20mm 18mm 24mm 18mm; }
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1a202c;line-height:1.7;}
.hdr{border-bottom:3px solid #0054a6;padding-bottom:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;}
.hdr .co{font-size:14pt;font-weight:800;color:#0054a6;}
.hdr .dp{font-size:9pt;color:#6b7a90;margin-top:2px;}
.hdr .mt{text-align:right;font-size:9pt;color:#6b7a90;line-height:1.5;}
h1{font-size:17pt;font-weight:800;color:#0f172a;border-bottom:2px solid #0054a6;padding-bottom:5px;margin:16px 0 10px;page-break-after:avoid;}
h2{font-size:12.5pt;font-weight:700;color:#0054a6;margin:16px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:2px;page-break-after:avoid;}
h3{font-size:10.5pt;font-weight:700;color:#1e3a5f;margin:12px 0 4px;page-break-after:avoid;}
p{margin-bottom:7px;color:#2d3748;}
ul,ol{margin:4px 0 8px 18px;color:#2d3748;}
li{margin-bottom:2px;}
table{width:100%;border-collapse:collapse;margin:10px 0 14px;font-size:9pt;page-break-inside:avoid;}
thead th{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;border:1px solid #1e3a5f;}
tbody td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top;}
tbody tr:nth-child(even) td{background:#f8fafc;}
code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:3px;padding:1px 4px;font-family:'Courier New',monospace;font-size:8pt;color:#1e3a5f;}
pre{background:#0f172a;border-radius:4px;padding:10px 12px;margin:8px 0;page-break-inside:avoid;}
pre code{background:none;border:none;color:#e2e8f0;font-size:7.5pt;padding:0;}
a{color:#0054a6;}
hr{border:none;border-top:1px solid #e2e8f0;margin:14px 0;}
blockquote{border-left:3px solid #0054a6;padding:4px 10px;margin:8px 0;background:#eff6ff;font-style:italic;color:#334155;}
em{font-style:italic;}strong{font-weight:700;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}h1,h2,h3{page-break-after:avoid;}table,pre{page-break-inside:avoid;}}
</style>
</head>
<body>
<div class="hdr">
  <div><div class="co">FPT Software</div><div class="dp">Phòng Nghiên Cứu &amp; Tư Vấn Chiến Lược AI-First</div></div>
  <div class="mt">Ngày xuất: ${dateStr}<br>Chủ đề: ${topic || 'Báo cáo chi tiết chiến lược'}<br>Hệ thống: Multi-Agent</div>
</div>
${bodyContent}
</body>
</html>`;
    }

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', async () => {
            if (!currentMarkdown || currentMarkdown.includes('not generated yet')) {
                alert('Chưa có báo cáo. Vui lòng chạy quy trình trước!'); return;
            }

            const origHTML = downloadPdfBtn.innerHTML;
            downloadPdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo PDF…';
            downloadPdfBtn.disabled = true;

            try {
                // Render markdown to a hidden div for capture
                const printDiv = document.createElement('div');
                printDiv.style.cssText = `
                    position:fixed; top:0; left:0; width:794px; background:#fff; color:#1a202c;
                    font-family:'Segoe UI',Arial,sans-serif; font-size:13px; line-height:1.65;
                    padding:40px 48px; z-index:-9999; opacity:0; pointer-events:none;
                `;

                // Apply same print styles inline
                const styleEl = document.createElement('style');
                styleEl.textContent = `
                    #__pdf_div__ h1{font-size:20px;font-weight:800;color:#0f172a;border-bottom:2px solid #0054a6;padding-bottom:6px;margin:16px 0 10px;}
                    #__pdf_div__ h2{font-size:15px;font-weight:700;color:#0054a6;margin:14px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:2px;}
                    #__pdf_div__ h3{font-size:13px;font-weight:700;color:#1e3a5f;margin:12px 0 5px;}
                    #__pdf_div__ p{margin-bottom:7px;color:#2d3748;}
                    #__pdf_div__ ul,#__pdf_div__ ol{margin:4px 0 8px 18px;color:#2d3748;}
                    #__pdf_div__ table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;}
                    #__pdf_div__ thead th{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;border:1px solid #1e3a5f;}
                    #__pdf_div__ tbody td{border:1px solid #cbd5e1;padding:5px 8px;}
                    #__pdf_div__ tbody tr:nth-child(even) td{background:#f8fafc;}
                    #__pdf_div__ code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:2px;padding:0 3px;font-family:monospace;font-size:10px;}
                    #__pdf_div__ pre{background:#0f172a;border-radius:4px;padding:10px;margin:8px 0;}
                    #__pdf_div__ pre code{background:none;border:none;color:#e2e8f0;font-size:10px;padding:0;}
                    #__pdf_div__ hr{border:none;border-top:1px solid #e2e8f0;margin:12px 0;}
                    #__pdf_div__ blockquote{border-left:3px solid #0054a6;padding:4px 10px;background:#eff6ff;font-style:italic;}
                    #__pdf_div__ a{color:#0054a6;}
                    #__pdf_div__ strong{font-weight:700;}
                `;
                document.head.appendChild(styleEl);
                printDiv.id = '__pdf_div__';

                // Header
                const dateStr = new Date().toLocaleDateString('vi-VN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
                const topic   = topicInput.value.trim() || 'Báo cáo chi tiết chiến lược';
                
                let reportContentHTML = reportView.innerHTML;
                if (uploadedDiagramDataUrl) {
                    reportContentHTML += `
                    <div style="page-break-before: always; text-align: center; margin-top: 30px;">
                        <h2 style="color: #0054a6; font-size: 14pt; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 15px;">SƠ ĐỒ KIẾN TRÚC HỆ THỐNG</h2>
                        <p style="text-align: center;"><img src="${uploadedDiagramDataUrl}" style="max-width: 100%; max-height: 400px; border-radius: 6px;"></p>
                    </div>`;
                }

                printDiv.innerHTML = `
                    <div style="border-bottom:3px solid #0054a6;padding-bottom:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;">
                      <div>
                        <div style="font-size:16px;font-weight:800;color:#0054a6;">FPT Software</div>
                        <div style="font-size:11px;color:#6b7a90;margin-top:2px;">Phòng Nghiên Cứu &amp; Báo Cáo Chi Tiết AI-First</div>
                      </div>
                      <div style="text-align:right;font-size:11px;color:#6b7a90;line-height:1.5;">
                        ${dateStr}<br>Chủ đề: ${topic.substring(0, 60)}${topic.length > 60 ? '…' : ''}
                      </div>
                    </div>
                    ${reportContentHTML}
                `;
                document.body.appendChild(printDiv);

                // Use html2canvas to capture
                const canvas = await html2canvas(printDiv, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    windowWidth: 794,
                    logging: false
                });

                document.body.removeChild(printDiv);
                document.head.removeChild(styleEl);

                // Build jsPDF A4 document
                const { jsPDF } = window.jspdf;
                const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();
                const imgW  = pageW;
                const imgH  = (canvas.height * imgW) / canvas.width;

                // Split into pages
                let yPosition = 0;
                const pageImgH = pageH;

                while (yPosition < imgH) {
                    if (yPosition > 0) pdf.addPage();
                    pdf.addImage(
                        canvas.toDataURL('image/jpeg', 0.95),
                        'JPEG',
                        0, -yPosition, imgW, imgH,
                        '', 'FAST'
                    );
                    yPosition += pageImgH;
                }

                const fileName = `FPT_BaoCao_ChiTiet_${new Date().toISOString().slice(0,10)}.pdf`;
                pdf.save(fileName);

            } catch (err) {
                console.error('PDF generation error:', err);
                alert(`Lỗi tạo PDF: ${err.message}\n\nThử lại hoặc dùng nút Tải DOCX thay thế.`);
            } finally {
                downloadPdfBtn.innerHTML = origHTML;
                downloadPdfBtn.disabled = false;
            }
        });
    }

    // ── 2. DOCX Download (using html-docx-js) ────────────────────────────────
    downloadDocxBtn.addEventListener('click', () => {
        if (!currentMarkdown || currentMarkdown.includes('not generated yet')) {
            alert('Chưa có báo cáo. Vui lòng chạy quy trình trước!'); return;
        }

        const origHTML = downloadDocxBtn.innerHTML;
        downloadDocxBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo DOCX…';
        downloadDocxBtn.disabled = true;

        try {
            const topic = topicInput.value.trim() || 'Báo cáo chi tiết chiến lược';
            
            let reportHTML = reportView.innerHTML;
            if (uploadedDiagramDataUrl) {
                reportHTML += `
                <div style="page-break-before: always; text-align: center; margin-top: 30px;">
                    <h2 style="color: #0054a6; font-size: 14pt; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 15px;">SƠ ĐỒ KIẾN TRÚC HỆ THỐNG</h2>
                    <p style="text-align: center;"><img src="${uploadedDiagramDataUrl}" style="max-width: 100%; max-height: 400px; border-radius: 6px;"></p>
                </div>`;
            }
            
            const fullHTML = buildPrintHTML(reportHTML, topic);

            // html-docx-js converts HTML string → DOCX blob
            const docxBlob = window.htmlDocx.asBlob(fullHTML, {
                orientation: 'portrait',
                margins: { top: 720, right: 720, bottom: 1440, left: 720 }
            });

            const url = URL.createObjectURL(docxBlob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = `FPT_BaoCao_ChiTiet_${new Date().toISOString().slice(0,10)}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);

        } catch (err) {
            console.error('DOCX error:', err);
            alert(`Lỗi tạo DOCX: ${err.message}`);
        } finally {
            downloadDocxBtn.innerHTML = origHTML;
            downloadDocxBtn.disabled = false;
        }
    });

    // ── 3. Diagram Download (PNG via Canvas) ──────────────────────────────────
    downloadDiagBtn.addEventListener('click', async () => {
        if (uploadedDiagramDataUrl) {
            const a = document.createElement('a');
            a.href = uploadedDiagramDataUrl;
            a.download = `FPT_SoDo_KienTruc_${new Date().toISOString().slice(0,10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }

        const svgEl = document.querySelector('#mermaid-render-output svg');
        if (!svgEl) {
            alert('Sơ đồ chưa được vẽ. Vui lòng chạy quy trình và xem tab Sơ Đồ trước!');
            return;
        }

        const origHTML = downloadDiagBtn.innerHTML;
        downloadDiagBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo PNG…';
        downloadDiagBtn.disabled = true;

        try {
            // Serialize SVG
            const cloned = svgEl.cloneNode(true);
            cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

            // Get explicit size
            const bbox = svgEl.getBoundingClientRect();
            const w = Math.max(bbox.width, 800);
            const h = Math.max(bbox.height, 400);
            cloned.setAttribute('width',  w);
            cloned.setAttribute('height', h);
            if (!cloned.getAttribute('viewBox')) {
                cloned.setAttribute('viewBox', `0 0 ${w} ${h}`);
            }

            const svgStr = new XMLSerializer().serializeToString(cloned);
            const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl  = URL.createObjectURL(svgBlob);

            const downloadSvgFallback = () => {
                try {
                    URL.revokeObjectURL(svgUrl);
                    const fallbackBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                    const fallbackUrl = URL.createObjectURL(fallbackBlob);
                    const a = document.createElement('a');
                    a.href     = fallbackUrl;
                    a.download = `FPT_SoDo_QuiTrinh_${new Date().toISOString().slice(0,10)}.svg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(fallbackUrl), 10000);
                } catch (fallbackErr) {
                    console.error('SVG fallback download failed:', fallbackErr);
                    alert(`Không thể tải sơ đồ: ${fallbackErr.message}`);
                }
                downloadDiagBtn.innerHTML = origHTML;
                downloadDiagBtn.disabled = false;
            };

            // Draw onto canvas for PNG conversion
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas  = document.createElement('canvas');
                    const scale   = 2; // Retina quality
                    canvas.width  = w * scale;
                    canvas.height = h * scale;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error("Could not get 2D context");
                    ctx.scale(scale, scale);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(svgUrl);

                    canvas.toBlob(blob => {
                        try {
                            if (!blob) throw new Error("Blob creation failed");
                            const pngUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href     = pngUrl;
                            a.download = `FPT_SoDo_QuiTrinh_${new Date().toISOString().slice(0,10)}.png`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(pngUrl), 10000);
                        } catch (toBlobErr) {
                            console.error('toBlob failed, running SVG fallback:', toBlobErr);
                            downloadSvgFallback();
                        } finally {
                            downloadDiagBtn.innerHTML = origHTML;
                            downloadDiagBtn.disabled = false;
                        }
                    }, 'image/png');
                } catch (onloadErr) {
                    console.error('img.onload canvas error, running SVG fallback:', onloadErr);
                    downloadSvgFallback();
                }
            };
            img.onerror = () => {
                console.warn('img.onerror loaded, running SVG fallback');
                downloadSvgFallback();
            };
            img.src = svgUrl;

        } catch (err) {
            console.error('Diagram download error:', err);
            alert(`Lỗi tải sơ đồ: ${err.message}`);
            downloadDiagBtn.innerHTML = origHTML;
            downloadDiagBtn.disabled = false;
        }
    });

    // ── 4. Markdown Download (.md) via server API ─────────────────────────────
    if (downloadMdBtn) {
        downloadMdBtn.addEventListener('click', () => {
            if (!currentMarkdown || currentMarkdown.includes('not generated yet')) {
                alert('Chưa có báo cáo. Vui lòng chạy quy trình trước!'); return;
            }

            // Download directly from server endpoint (most reliable for UTF-8)
            const a = document.createElement('a');
            a.href     = getApiPrefix() + '/api/download-markdown';
            a.download = `FPT_BaoCao_ChiTiet_${new Date().toISOString().slice(0,10)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PANEL HIGHLIGHT HELPER
    // ════════════════════════════════════════════════════════════════════════
    function highlightPanel(panelKey) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active-section'));
        const consultPanel = document.querySelector('.sidebar-left .panel:first-child');
        const metricsPanel = document.querySelector('.metrics-panel');
        const graphPanel   = document.querySelector('.graph-panel');
        const consolePanel = document.querySelector('.console-panel');
        const tabsPanel    = document.querySelector('.tabs-panel');

        if (panelKey === 'start') {
            consultPanel?.classList.add('active-section');
            metricsPanel?.classList.add('active-section');
        } else if (panelKey === 'guardrail' || panelKey === 'running') {
            consolePanel?.classList.add('active-section');
            graphPanel?.classList.add('active-section');
        } else if (panelKey === 'complete') {
            tabsPanel?.classList.add('active-section');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  UNCREATED PLACEHOLDER CARDS & HISTORY HELPERS
    // ════════════════════════════════════════════════════════════════════════
    const showUncreatedReportCard = () => {
        reportView.className = 'markdown-report';
        reportView.style.border = '1px solid #e2e8f0';
        reportView.style.borderRadius = '8px';
        reportView.style.background = '#ffffff';
        reportView.style.padding = '30px 35px';
        reportView.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02)';
        reportView.style.maxWidth = '850px';
        reportView.style.margin = '5px auto';
        reportView.innerHTML = `
            <h1 style="font-size: 18px; font-weight: 800; border-bottom: 2px solid var(--fpt-blue); padding-bottom: 8px; color: var(--fpt-blue); text-transform: uppercase; text-align: center; letter-spacing: 0.5px; margin: 0;">BÁO CÁO CHƯA ĐƯỢC TẠO</h1>
        `;
    };

    const showUncreatedDiagramCard = () => {
        const toolbar = document.querySelector('.diagram-toolbar');
        if (toolbar) toolbar.style.display = 'none';
        const exp = document.getElementById('mermaid-explanation-container');
        if (exp) exp.style.display = 'none';

        mermaidOutput.className = 'markdown-report';
        mermaidOutput.style.border = '1px solid #e2e8f0';
        mermaidOutput.style.borderRadius = '8px';
        mermaidOutput.style.background = '#ffffff';
        mermaidOutput.style.padding = '30px 35px';
        mermaidOutput.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02)';
        mermaidOutput.style.maxWidth = '850px';
        mermaidOutput.style.margin = '5px auto';
        mermaidOutput.style.minHeight = 'unset';
        mermaidOutput.style.maxHeight = 'unset';
        mermaidOutput.style.display = 'block';
        mermaidOutput.style.position = 'relative';

        mermaidOutput.innerHTML = `
            <h1 style="font-size: 18px; font-weight: 800; border-bottom: 2px solid var(--fpt-blue); padding-bottom: 8px; color: var(--fpt-blue); text-transform: uppercase; text-align: center; letter-spacing: 0.5px; margin: 0;">SƠ ĐỒ CHƯA ĐƯỢC TẠO</h1>
        `;
    };

    function parseDurationText(text) {
        if (!text) return 0;
        const clean = text.trim().toLowerCase();
        const val = parseFloat(clean);
        if (isNaN(val)) return 0;
        if (clean.endsWith('ms')) return val / 1000;
        return val;
    }

    function saveActiveSearchState(status) {
        const topic = topicInput.value.trim();
        if (!topic) {
            localStorage.removeItem('fpt_active_search');
            return;
        }

        const stats = {
            time: statTime.textContent,
            tokens: statTokens.textContent,
            agents: statAgents.textContent,
            status: statStatus.textContent,
            agent_tokens: {},
            agent_durations: {},
            agent_models: {},
            agent_toks_per_sec: {}
        };

        const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
        agentKeys.forEach(k => {
            const badge = document.getElementById(`metrics-${k}`);
            if (badge) {
                const text = badge.textContent;
                const hasDot = text.includes('·');
                if (hasDot) {
                    const parts = text.split('·').map(p => p.trim());
                    stats.agent_models[k] = badge.title || parts[0] || '';
                    stats.agent_durations[k] = parseDurationText(parts[1]);
                    stats.agent_toks_per_sec[k] = parseFloat(parts[2]) || 0;
                    stats.agent_tokens[k] = parseInt((parts[3] || '').replace(/[^0-9]/g, ''), 10) || 0;
                } else {
                    const parts = text.split('|');
                    stats.agent_durations[k] = parseDurationText(parts[0]);
                    stats.agent_tokens[k] = parseInt((parts[1] || '').replace(/[^0-9]/g, ''), 10) || 0;
                    stats.agent_models[k] = badge.title || '';
                    stats.agent_toks_per_sec[k] = 0;
                }
            }
        });

        let activeNode = null;
        for (const k of agentKeys) {
            const nodeId = agentMappings[k]?.nodeId;
            if (nodeId && document.getElementById(nodeId)?.classList.contains('active')) {
                activeNode = k;
                break;
            }
        }

        const activeSearch = {
            topic,
            status: status || 'running',
            stats,
            hasAnalystRun,
            logs: consoleOutput.innerHTML,
            activeNode,
            timestamp: Date.now()
        };

        localStorage.setItem('fpt_active_search', JSON.stringify(activeSearch));
    }

    // ════════════════════════════════════════════════════════════════════════
    //  RESET UI
    // ════════════════════════════════════════════════════════════════════════
    function resetUI() {
        statTime.textContent   = '0.000s';
        statTokens.textContent = '0';
        statAgents.textContent = '0 / 6';
        statStatus.textContent = 'Đang chạy…';
        statStatus.style.color = 'var(--fpt-orange)';

        if (downloadGroup) downloadGroup.style.display = 'none';

        document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.graph-edges line').forEach(l => l.classList.remove('active'));

        consoleOutput.innerHTML = '';
        activeAgentBadge.textContent = 'Chờ';
        activeAgentBadge.className   = 'agent-badge inactive';

        showUncreatedReportCard();
        showUncreatedDiagramCard();
        if (rawMarkdownText) rawMarkdownText.value = 'Báo cáo chưa được tạo';
        currentMarkdown = '';

        printQueue = [];
        isPrinting = false;

        uploadedDiagramDataUrl = null;
        if (chatUploadStatusText) {
            chatUploadStatusText.textContent = '';
            chatUploadStatusText.style.display = 'none';
            chatUploadBtn.style.background = '';
            chatUploadBtn.style.borderColor = '';
            chatUploadBtn.style.color = '';
        }
        if (chatFileInput) {
            chatFileInput.value = '';
        }

        hasAnalystRun = false;
        document.querySelectorAll('.graph-node').forEach(n => {
            n.classList.remove('active');
            n.classList.remove('node-hidden');
        });
        document.querySelectorAll('.graph-edges line').forEach(l => {
            l.classList.remove('active');
            l.classList.remove('edge-hidden');
        });
        const directEdge = document.getElementById('edge-researcher-reporter');
        if (directEdge) {
            directEdge.style.display = 'none';
        }
        const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
        agentKeys.forEach(k => {
            const badge = document.getElementById(`metrics-${k}`);
            if (badge) badge.textContent = '0.000s | 0 tk';
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  AGENT MAPPINGS
    // ════════════════════════════════════════════════════════════════════════
    const agentMappings = {
        guardrail:    { nodeId: 'node-guardrail',    edgeId: null,                         badgeClass: 'active-guardrail',    name: 'Agent Cảnh Giới' },
        researcher:   { nodeId: 'node-researcher',   edgeId: 'edge-guardrail-researcher',  badgeClass: 'active-researcher',   name: 'Agent Nghiên Cứu' },
        analyst:      { nodeId: 'node-analyst',      edgeId: 'edge-researcher-analyst',    badgeClass: 'active-analyst',      name: 'Agent Phân Tích' },
        risk_assessor:{ nodeId: 'node-risk_assessor',edgeId: 'edge-analyst-risk_assessor', badgeClass: 'active-risk_assessor',name: 'Agent Đánh Giá Rủi Ro' },
        recommender:  { nodeId: 'node-recommender',  edgeId: 'edge-risk_assessor-recommender', badgeClass: 'active-recommender', name: 'Agent Đề Xuất' },
        reporter:     { nodeId: 'node-reporter',     edgeId: 'edge-recommender-reporter',  badgeClass: 'active-reporter',     name: 'Agent Báo Cáo' }
    };

    // ── Highlight Active Node ─────────────────────────────────────────────────
    function highlightNode(nodeKey) {
        const mapping = agentMappings[nodeKey];
        if (!mapping) return;

        if (nodeKey === 'analyst') {
            hasAnalystRun = true;
        }

        document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('active'));
        document.getElementById(mapping.nodeId)?.classList.add('active');

        let edgeId = mapping.edgeId;
        if (nodeKey === 'reporter') {
            if (!hasAnalystRun) {
                // QA Flow: Direct transition from researcher to reporter
                edgeId = 'edge-researcher-reporter';
                
                // Hide intermediate nodes and their edges
                document.getElementById('node-analyst')?.classList.add('node-hidden');
                document.getElementById('node-risk_assessor')?.classList.add('node-hidden');
                document.getElementById('node-recommender')?.classList.add('node-hidden');
                
                document.getElementById('edge-researcher-analyst')?.classList.add('edge-hidden');
                document.getElementById('edge-analyst-risk_assessor')?.classList.add('edge-hidden');
                document.getElementById('edge-risk_assessor-recommender')?.classList.add('edge-hidden');
                document.getElementById('edge-recommender-reporter')?.classList.add('edge-hidden');
                
                // Show and active direct edge
                const directEdge = document.getElementById('edge-researcher-reporter');
                if (directEdge) {
                    directEdge.style.display = 'block';
                    directEdge.classList.add('active');
                }
            } else {
                // Consulting Flow
                edgeId = 'edge-recommender-reporter';
            }
        }

        if (edgeId) {
            document.getElementById(edgeId)?.classList.add('active');
        }

        activeAgentBadge.textContent = mapping.name;
        activeAgentBadge.className   = `agent-badge ${mapping.badgeClass}`;
        highlightPanel(nodeKey === 'guardrail' ? 'guardrail' : 'running');

        // Adjust agents count dynamically based on the active flow (simple vs complex)
        const idx = Object.keys(agentMappings).indexOf(nodeKey) + 1;
        if (nodeKey === 'reporter' && !hasAnalystRun) {
            statAgents.textContent = `3 / 3`; // Simple problem has 3 active agents: guardrail, researcher, reporter
        } else {
            statAgents.textContent = `${idx} / 6`;
        }
    }

    // ── Typewriter Effect ────────────────────────────────────────────────────
    function typeText(element, text, speed = 4) {
        return new Promise(resolve => {
            let i = 0;
            const timer = setInterval(() => {
                if (i < text.length) {
                    element.textContent += text[i++];
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                } else {
                    clearInterval(timer);
                    resolve();
                }
            }, speed);
        });
    }

    // ── Print Queue ──────────────────────────────────────────────────────────
    async function processQueue() {
        if (printQueue.length === 0) { isPrinting = false; return; }
        isPrinting = true;
        const item = printQueue.shift();

        // Completion marker
        if (item.type === 'completion') {
            clearInterval(timerInterval);
            highlightPanel('complete');

            if (item.stats) {
                statTime.textContent   = formatTimeString(item.stats.time);
                statTokens.textContent = item.stats.tokens;

                if (item.stats.irrelevant) {
                    statAgents.textContent = '1 / 6';
                    statStatus.textContent = 'Bị Từ Chối ❌';
                    statStatus.style.color = '#ef4444';
                } else {
                    // Show correct agent count based on flow (qa=3, consulting=6)
                    const agentCount = item.stats.agents || 6;
                    statAgents.textContent = `${agentCount} / ${agentCount === 3 ? 3 : 6}`;
                    statStatus.textContent = 'Hoàn Thành ✅';
                    statStatus.style.color = '#16a069';
                    if (downloadGroup) downloadGroup.style.display = 'flex';
                }

                // Update each agent badge with model, ms, tok/s, tokens
                if (item.stats.agent_tokens) {
                    const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
                    agentKeys.forEach(k => {
                        const badge = document.getElementById(`metrics-${k}`);
                        if (badge) {
                            const durVal = item.stats.agent_durations && item.stats.agent_durations[k] ? item.stats.agent_durations[k] : 0;
                            const durText = `${durVal.toFixed(3)}s`;
                            const tk = item.stats.agent_tokens[k] ? item.stats.agent_tokens[k].toLocaleString() : '0';
                            const tps = item.stats.agent_toks_per_sec && item.stats.agent_toks_per_sec[k] ? item.stats.agent_toks_per_sec[k].toFixed(1) : '0.0';
                            const mdl = item.stats.agent_models && item.stats.agent_models[k] ? item.stats.agent_models[k].split('/').pop() : '';
                            badge.textContent = mdl ? `${mdl} · ${durText} · ${tps} tk/s · ${tk} tk` : `${durText} · ${tk} tk`;
                            badge.title = (item.stats.agent_models && item.stats.agent_models[k]) || '';
                        }
                    });
                }
            }

            runBtn.disabled  = false;
            runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
            fetchReport();
            isPrinting = false;
            return;
        }

        const nk = item.node;

        // Remove start placeholder if it exists
        const placeholder = document.getElementById(`start-placeholder-${nk}`);
        if (placeholder) {
            placeholder.remove();
        }

        // Agent output — colored header + typewriter body
        highlightNode(item.node);

        // Update metrics badge for this node in real-time sync with log printing!
        const badge = document.getElementById(`metrics-${item.node}`);
        if (badge) {
            const durVal = item.duration ? item.duration : 0;
            const durText = `${durVal.toFixed(3)}s`;
            const tk = item.tokens ? item.tokens.toLocaleString() : '0';
            const tps = item.toks_per_sec ? item.toks_per_sec.toFixed(1) : '0.0';
            const mdl = item.model ? item.model.split('/').pop() : '';
            badge.textContent = mdl ? `${mdl} · ${durText} · ${tps} tk/s · ${tk} tk` : `${durText} · ${tk} tk`;
            badge.title = item.model || '';
        }

        let titleColor = '#94a3b8';
        if      (nk === 'guardrail')    titleColor = 'var(--accent-guardrail)';
        else if (nk === 'researcher')   titleColor = 'var(--accent-researcher)';
        else if (nk === 'analyst')      titleColor = 'var(--accent-analyst)';
        else if (nk === 'risk_assessor') titleColor = 'var(--accent-risk)';
        else if (nk === 'recommender')  titleColor = 'var(--accent-recommender)';
        else if (nk === 'reporter')     titleColor = 'var(--accent-reporter)';

        const logHeader = document.createElement('div');
        logHeader.className = 'console-log';
        const agentName = agentMappings[nk]?.name ?? nk.toUpperCase();
        logHeader.innerHTML = `<span style="color:${titleColor};font-weight:bold;">[${agentName}]</span><span class="analysis-log-suffix"> nhật ký phân tích:</span>`;
        consoleOutput.appendChild(logHeader);

        // Add collapsible thinking block if thinking is available
        if (item.thinking) {
            const thinkingContainer = document.createElement('details');
            thinkingContainer.className = 'console-log thinking-details';
            thinkingContainer.style.cssText = `margin-left: 12px; margin-bottom: 8px; border-left: 2px dashed ${titleColor}; padding-left: 10px; color: #8a9ca8; font-style: italic; font-size: 11.5px;`;
            thinkingContainer.open = true; // default to open for clear intuition
            
            const summary = document.createElement('summary');
            summary.style.cssText = 'cursor: pointer; font-weight: 600; outline: none; margin-bottom: 4px; user-select: none; color: #a0aec0;';
            summary.innerHTML = '<i class="fa-solid fa-brain"></i> Quá trình suy nghĩ (Thinking Process)';
            thinkingContainer.appendChild(summary);
            
            const thinkingContent = document.createElement('div');
            thinkingContent.style.cssText = 'white-space: pre-line; line-height: 1.5; padding: 4px 0;';
            thinkingContent.textContent = item.thinking;
            thinkingContainer.appendChild(thinkingContent);
            consoleOutput.appendChild(thinkingContainer);
        }

        const logBody = document.createElement('div');
        logBody.className  = 'console-log';
        logBody.style.cssText = `color:#b0bec8;padding-left:12px;border-left:2px solid ${titleColor};margin-bottom:12px;line-height:1.55;`;
        consoleOutput.appendChild(logBody);

        await typeText(logBody, item.content || 'Không có thông tin ghi nhận.', 4);
        saveActiveSearchState('running');
        processQueue();
    }

    function printAgentStartInLog(nodeKey) {
        const mapping = agentMappings[nodeKey];
        if (!mapping) return;
        
        let titleColor = '#94a3b8';
        const nk = nodeKey;
        if      (nk === 'guardrail')    titleColor = 'var(--accent-guardrail)';
        else if (nk === 'researcher')   titleColor = 'var(--accent-researcher)';
        else if (nk === 'analyst')      titleColor = 'var(--accent-analyst)';
        else if (nk === 'risk_assessor') titleColor = 'var(--accent-risk)';
        else if (nk === 'recommender')  titleColor = 'var(--accent-recommender)';
        else if (nk === 'reporter')     titleColor = 'var(--accent-reporter)';

        // If placeholder already exists, don't duplicate
        if (document.getElementById(`start-placeholder-${nk}`)) return;

        const startLog = document.createElement('div');
        startLog.className = 'console-log agent-start-placeholder';
        startLog.id = `start-placeholder-${nk}`;
        const agentName = mapping.name ?? nk.toUpperCase();
        startLog.innerHTML = `<span style="color:${titleColor};font-weight:bold;">[${agentName}]</span><span style="color: #a0aec0; font-style: italic;"> đang phân tích yêu cầu... <i class="fa-solid fa-spinner fa-spin"></i></span>`;
        consoleOutput.appendChild(startLog);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        
        statStatus.textContent = `${agentName} đang xử lý…`;
        statStatus.style.color = 'var(--fpt-orange)';
    }

    function queuePrint(node, content, duration, tokens, thinking) {
        printQueue.push({ node, content, duration, tokens, thinking });
        if (!isPrinting) processQueue();
    }

    // ── Mermaid Diagram ──────────────────────────────────────────────────────
    async function renderMermaidDiagram(markdownOrCode) {
        if (!mermaidOutput) return;
        let code = (markdownOrCode || '').trim();
        
        let hasMermaidBlock = false;
        if (code.includes('```mermaid')) {
            const regex = /```mermaid\s*([\s\S]*?)\s*```/;
            const match = code.match(regex);
            code = (match && match[1]) ? match[1].trim() : '';
            hasMermaidBlock = true;
        }

        currentDiagramCode = code;
        uploadedDiagramDataUrl = null;

        // If it doesn't have a ```mermaid block, check if it's a raw diagram
        if (!hasMermaidBlock) {
            const trimmed = code.toLowerCase();
            const mermaidKeywords = ['graph', 'flowchart', 'sequencediagram', 'gantt', 'classdiagram', 'statediagram', 'erdiagram', 'journey', 'pie', 'gitgraph'];
            const isRawDiagram = mermaidKeywords.some(kw => trimmed.startsWith(kw));
            if (!isRawDiagram) {
                showUncreatedDiagramCard();
                return;
            }
        }

        // Extra check for known placeholders or missing report indicators
        if (!code || code.length < 10 || 
            code.includes('chưa được tạo') || 
            code.includes('not created') || 
            code.includes('no report generated') || 
            code.includes('not generated yet')) {
            showUncreatedDiagramCard();
            return;
        }

        const uniqueId = 'mermaid-' + Math.random().toString(36).substring(2, 9);
        try {
            // Restore toolbar and original styling for diagram rendering
            const toolbar = document.querySelector('.diagram-toolbar');
            if (toolbar) toolbar.style.display = 'flex';

            mermaidOutput.className = 'mermaid-diagram-output';
            mermaidOutput.style.border = '1px solid var(--panel-border)';
            mermaidOutput.style.borderRadius = '6px';
            mermaidOutput.style.background = '#ffffff';
            mermaidOutput.style.padding = '10px';
            mermaidOutput.style.boxShadow = 'none';
            mermaidOutput.style.maxWidth = 'none';
            mermaidOutput.style.margin = '0';
            mermaidOutput.style.minHeight = '250px';
            mermaidOutput.style.maxHeight = '450px';
            mermaidOutput.style.display = 'flex';

            mermaidOutput.innerHTML = '<p class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Đang vẽ sơ đồ quy trình…</p>';
            
            // Clear any stale SVG elements
            mermaidOutput.querySelectorAll('svg').forEach(el => el.remove());
            
            // Set initial zoom level
            currentZoom = 100;
            if (zoomLevelEl) zoomLevelEl.textContent = '100%';

            const { svg } = await mermaid.render(uniqueId, code);
            mermaidOutput.innerHTML = svg;
            
            // Adjust SVG styles for scaling
            const renderedSvg = document.getElementById(uniqueId);
            if (renderedSvg) {
                renderedSvg.style.transition = 'transform 0.15s ease-out';
                renderedSvg.style.maxWidth = 'none';
                renderedSvg.style.height = 'auto';
            }
        } catch (err) {
            console.error('Mermaid error:', err);
            let displayErr = `Lỗi biên dịch sơ đồ: ${err.message}`;
            if (err.message.includes('No diagram type detected') || 
                err.message.includes('No diagram type') || 
                code.includes('Report not created') || 
                code.includes('Báo cáo chưa được tạo') || 
                code.includes('No report generated') ||
                code.includes('not generated yet')) {
                showUncreatedDiagramCard();
            } else {
                mermaidOutput.innerHTML = `<p class="placeholder-text" style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> ${displayErr}</p>`;
            }
            // Cleanup
            mermaidOutput.querySelectorAll('svg').forEach(el => el.remove());
            const staleTemp = document.getElementById(uniqueId);
            if (staleTemp) staleTemp.remove();
        }
    }

    // ── Run Pipeline ─────────────────────────────────────────────────────────
    function handleSseMessage(data) {
        if (data.error) {
            clearInterval(timerInterval);
            statStatus.textContent = 'Thất Bại';
            statStatus.style.color = '#ef4444';
            runBtn.disabled  = false;
            runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
            if (stopBtn) stopBtn.style.display = 'none';

            let cleanErr = data.error.split('\n')[0];
            const logDiv = document.createElement('div');
            logDiv.className   = 'console-log';
            logDiv.style.color = '#ef4444';
            logDiv.innerHTML = `<span style="font-weight:bold;">[Lỗi Hệ Thống]</span> Tiến trình gặp sự cố: <strong>${cleanErr}</strong>. Vui lòng kiểm tra lại cấu hình hoặc API Key.`;
            consoleOutput.appendChild(logDiv);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
            localStorage.removeItem('fpt_active_search');
            return;
        }

        if (data.done) {
            printQueue.push({ type: 'completion', stats: data.stats });
            if (!isPrinting) processQueue();
            if (stopBtn) stopBtn.style.display = 'none';
            localStorage.removeItem('fpt_active_search');
            return;
        }

        if (data.type === 'node_start') {
            highlightNode(data.node);
            printAgentStartInLog(data.node);
            saveActiveSearchState('running');
        }

        if (data.type === 'node_end' && data.content) {
            queuePrint(data.node, data.content, data.duration, data.tokens, data.thinking);
            saveActiveSearchState('running');
        }
    }

    runBtn.addEventListener('click', () => {
        const topic = topicInput.value.trim();
        if (!topic) { alert('Vui lòng nhập câu hỏi hoặc chủ đề nghiên cứu trước khi kích hoạt!'); return; }

        if (window.activeFetchAbortController) {
            window.activeFetchAbortController.abort();
            window.activeFetchAbortController = null;
        }

        resetUI();
        runBtn.disabled  = true;
        runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chạy…';
        if (stopBtn) stopBtn.style.display = 'block';
        highlightPanel('start');

        runStartTime  = Date.now();
        saveActiveSearchState('running');
        let lastSaveTime = Date.now();
        timerInterval = setInterval(() => {
            const now = Date.now();
            statTime.textContent = `${((now - runStartTime) / 1000).toFixed(3)}s`;
            if (now - lastSaveTime >= 1000) {
                saveActiveSearchState('running');
                lastSaveTime = now;
            }
        }, 50);

        const abortController = new AbortController();
        window.activeFetchAbortController = abortController;

        fetch(getApiPrefix() + `/api/run?topic=${encodeURIComponent(topic)}`, {
            signal: abortController.signal,
            headers: {
                'Accept': 'text/event-stream'
            }
        })
        .then(async response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep partial line in buffer
                
                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine.startsWith('data:')) continue;
                    
                    const eventDataStr = cleanLine.substring(5).trim();
                    if (!eventDataStr) continue;
                    
                    let data;
                    try {
                        data = JSON.parse(eventDataStr);
                    } catch (e) {
                        console.error('SSE JSON parse error:', e);
                        continue;
                    }
                    
                    handleSseMessage(data);
                }
            }
            
            if (buffer.trim().startsWith('data:')) {
                const cleanLine = buffer.trim();
                const eventDataStr = cleanLine.substring(5).trim();
                if (eventDataStr) {
                    try {
                        const data = JSON.parse(eventDataStr);
                        handleSseMessage(data);
                    } catch (e) {}
                }
            }
        })
        .catch(err => {
            if (err.name === 'AbortError') {
                return; // User cancelled
            }
            console.error('Fetch SSE error:', err);
            if (statStatus.textContent !== 'Hoàn Thành ✅' && statStatus.textContent !== 'Bị Từ Chối ❌' && statStatus.textContent !== 'Đã tạm dừng') {
                clearInterval(timerInterval);
                statStatus.textContent = 'Lỗi Kết Nối';
                statStatus.style.color = '#ef4444';
                runBtn.disabled  = false;
                runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
                if (stopBtn) stopBtn.style.display = 'none';

                if (consoleOutput) {
                    const logDiv = document.createElement('div');
                    logDiv.className   = 'console-log';
                    logDiv.style.color = '#ef4444';
                    logDiv.style.marginTop = '10px';
                    logDiv.style.padding = '10px';
                    logDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                    logDiv.style.borderLeft = '4px solid #ef4444';
                    logDiv.style.borderRadius = '4px';
                    logDiv.innerHTML = `<span style="font-weight:bold;"><i class="fa-solid fa-circle-exclamation"></i> [LỖI KẾT NỐI MÁY CHỦ]</span> Không thể kết nối tới API tại <strong>${getApiPrefix()}</strong>.<br><br>` +
                                       `<strong>Hướng dẫn khắc phục sự cố:</strong><br>` +
                                       `• <strong>Đối với máy chủ cục bộ:</strong> Đảm bảo backend đang hoạt động (nhấp đúp tệp <strong>server.exe</strong> hoặc chạy lệnh <strong>python main.py --server</strong>) và lắng nghe trên cổng 8000.<br>` +
                                       `• <strong>Đối với máy chủ VPS/Từ xa:</strong> Kiểm tra lại địa chỉ cấu hình máy chủ trong bảng Cài đặt (nhấp biểu tượng <strong>bánh răng</strong> ở góc trên bên phải bảng yêu cầu) và đảm bảo máy chủ VPS của bạn đã bật CORS cho phép origin Vercel.<br>` +
                                       `• <strong>Vấn đề HTTPS / Mixed Content:</strong> Nếu truy cập Vercel qua HTTPS, trình duyệt sẽ chặn kết nối HTTP không bảo mật (Mixed Content). Hãy sử dụng địa chỉ HTTPS (qua VPS bảo mật, ngrok, hoặc localtunnel) để kết nối thành công.`;
                    consoleOutput.appendChild(logDiv);
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }
            }
        });
    });

    // ── Fetch & Render Final Report ───────────────────────────────────────────
    function fetchReport() {
        uploadedDiagramDataUrl = null;
        fetch(getApiPrefix() + '/api/report?t=' + Date.now())
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (data.report) {
                    currentMarkdown       = data.report;
                    if (rawMarkdownText) rawMarkdownText.value = data.report;
                    
                    reportView.style.cssText = '';
                    if (data.report.includes('Báo cáo chưa được tạo') || data.report.includes('Report not created') || data.report.includes('not generated yet')) {
                        showUncreatedReportCard();
                    } else {
                        reportView.innerHTML  = marked.parse(data.report);
                    }
                    
                    if (data.diagram) {
                        renderMermaidDiagram(data.diagram);
                    } else {
                        renderMermaidDiagram(data.report);
                    }

                    // Render diagram explanation
                    const expContainer = document.getElementById('mermaid-explanation-container');
                    const expContent = document.getElementById('mermaid-explanation-content');
                    if (expContainer && expContent && data.explanation) {
                        expContent.innerHTML = marked.parse(data.explanation);
                        expContainer.style.display = 'block';
                    } else if (expContainer) {
                        expContainer.style.display = 'none';
                    }

                    if (!data.report.includes('Request Rejected') &&
                        !data.report.includes('not generated yet') &&
                        !data.report.includes('Báo cáo chưa được tạo') &&
                        !data.report.includes('Report not created')) {
                        if (downloadGroup) downloadGroup.style.display = 'flex';
                    } else {
                        if (downloadGroup) downloadGroup.style.display = 'none';
                    }
                }
            })
            .catch(err => {
                console.error('Fetch report error:', err);
                showUncreatedReportCard();
                showUncreatedDiagramCard();
            });
    }

    // ── Diagram Zoom & Toggle Event Listeners ─────────────────────────────────
    function applyZoom() {
        const svgEl = mermaidOutput.querySelector('svg');
        if (svgEl) {
            svgEl.style.transform = `scale(${currentZoom / 100})`;
            svgEl.style.transformOrigin = 'center top';
        }
        if (zoomLevelEl) {
            zoomLevelEl.textContent = `${currentZoom}%`;
        }
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (currentZoom < 250) {
                currentZoom += 15;
                applyZoom();
            }
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (currentZoom > 40) {
                currentZoom -= 15;
                applyZoom();
            }
        });
    }

    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            currentZoom = 100;
            applyZoom();
        });
    }



    // ── Stop Button Click Handler ──────────────────────────────────────────
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            
            // Restore buttons
            runBtn.disabled  = false;
            runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
            stopBtn.style.display = 'none';
            
            statStatus.textContent = 'Đã tạm dừng';
            statStatus.style.color = 'var(--text-muted)';
            
            const abortLog = document.createElement('div');
            abortLog.className = 'console-log';
            abortLog.style.color = 'var(--fpt-orange)';
            abortLog.innerHTML = `<span style="font-weight:bold;">[Hệ Thống]</span> Tiến trình đã tạm dừng theo yêu cầu của người dùng. Bạn có thể tải lên tệp hoặc bắt đầu câu hỏi mới.`;
            consoleOutput.appendChild(abortLog);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
            localStorage.removeItem('fpt_active_search');
        });
    }

    // ── Chat File Upload Handler ──────────────────────────────────────────
    if (chatUploadBtn && chatFileInput) {
        chatUploadBtn.addEventListener('click', () => chatFileInput.click());
        
        chatFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const fileName = file.name;
            const fileExt = fileName.split('.').pop().toLowerCase();
            const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'svg'].includes(fileExt);
            
            if (isImage) {
                // Limit image size to 2.5MB
                if (file.size > 2.5 * 1024 * 1024) {
                    alert('Tệp hình ảnh quá lớn! Giới hạn tối đa là 2.5MB.');
                    chatFileInput.value = '';
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (evt) => {
                    uploadedDiagramDataUrl = evt.target.result;
                    
                    // Silent file upload (do not show attachment badge or filename)
                    
                    // Render custom image in diagram tab
                    if (mermaidOutput) {
                        currentZoom = 100;
                        if (zoomLevelEl) zoomLevelEl.textContent = '100%';
                        
                        mermaidOutput.innerHTML = `
                            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 15px;">
                                <div style="font-size: 11px; font-weight: 700; color: var(--fpt-blue); background: #eff6ff; padding: 6px 12px; border-radius: 4px; border: 1px solid #bfdbfe; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-circle-info"></i> Sơ đồ do người dùng tải lên
                                </div>
                                <img src="${uploadedDiagramDataUrl}" style="max-width: 100%; max-height: 400px; border: 1px solid var(--panel-border); border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.06); object-fit: contain;">
                            </div>
                        `;
                    }
                    
                    // Switch to diagram tab to show the upload
                    const diagramTabBtn = document.getElementById('tab-btn-diagram');
                    if (diagramTabBtn) diagramTabBtn.click();
                    
                    // Add system log entry
                    const log = document.createElement('div');
                    log.className = 'console-log';
                    log.innerHTML = `<span style="color: var(--accent-recommender); font-weight: bold;">[Hệ Thống]</span> Đã nhận diện hình ảnh sơ đồ kiến trúc: <strong>${fileName}</strong>.`;
                    consoleOutput.appendChild(log);
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                };
                reader.readAsDataURL(file);
            } else if (['md', 'txt'].includes(fileExt)) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = evt.target.result;
                    currentMarkdown = content;
                    if (rawMarkdownText) rawMarkdownText.value = content;
                    
                    // Render detailed report
                    if (reportView) {
                        reportView.innerHTML = marked.parse(content);
                    }
                    
                    // Silent file upload (do not show attachment badge or filename)
                    
                    // Switch to report tab
                    const reportTabBtn = document.getElementById('tab-btn-report');
                    if (reportTabBtn) reportTabBtn.click();
                    
                    // Try extracting and rendering Mermaid flowchart
                    renderMermaidDiagram(content);
                    
                    // Enable download options
                    if (downloadGroup) downloadGroup.style.display = 'flex';
                    
                    // Add system log entry
                    const log = document.createElement('div');
                    log.className = 'console-log';
                    log.innerHTML = `<span style="color: var(--accent-recommender); font-weight: bold;">[Hệ Thống]</span> Đã tải lên tài liệu báo cáo: <strong>${fileName}</strong>.`;
                    consoleOutput.appendChild(log);
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                };
                reader.readAsText(file);
            } else {
                alert('Định dạng tệp không được hỗ trợ! Vui lòng chọn tệp hình ảnh (.png, .jpg, .svg) hoặc văn bản (.md, .txt).');
                chatFileInput.value = '';
            }
        });
    }



    // Helper to format any time string or number to seconds with milliseconds precision
    function formatTimeString(timeStr) {
        if (!timeStr) return '0.000s';
        if (typeof timeStr === 'string' && timeStr.endsWith('ms')) {
            const val = parseFloat(timeStr);
            return `${(val / 1000).toFixed(3)}s`;
        }
        if (typeof timeStr === 'string' && timeStr.endsWith('s')) {
            const val = parseFloat(timeStr);
            return `${val.toFixed(3)}s`;
        }
        const val = parseFloat(timeStr);
        if (isNaN(val)) return timeStr;
        if (val > 100) return `${(val / 1000).toFixed(3)}s`;
        return `${val.toFixed(3)}s`;
    }

    // New Chat Action: resets everything to initial empty state
    function startNewChat() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        topicInput.value = '';
        statTime.textContent   = '0.000s';
        statTokens.textContent = '0';
        statAgents.textContent = '0 / 6';
        statStatus.textContent = 'Sẵn sàng';
        statStatus.style.color = 'var(--text-secondary)';

        if (downloadGroup) downloadGroup.style.display = 'none';

        document.querySelectorAll('.graph-node').forEach(n => {
            n.classList.remove('active');
            n.classList.remove('node-hidden');
        });
        document.querySelectorAll('.graph-edges line').forEach(l => {
            l.classList.remove('active');
            l.classList.remove('edge-hidden');
        });
        const directEdge = document.getElementById('edge-researcher-reporter');
        if (directEdge) {
            directEdge.style.display = 'none';
        }
        const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
        agentKeys.forEach(k => {
            const badge = document.getElementById(`metrics-${k}`);
            if (badge) badge.textContent = '0.000s | 0 tk';
        });

        consoleOutput.innerHTML = `
            <div class="console-welcome">
                <p class="welcome-title"><i class="fa-solid fa-network-wired"></i> Hệ Thống Báo Cáo Chi Tiết Tri Thức Doanh Nghiệp — FPT Software</p>
                <p>Sáu tác nhân chuyên biệt phối hợp xử lý yêu cầu theo chuỗi, từ xác thực đầu vào đến biên soạn báo cáo học thuật hoàn chỉnh:</p>
                <div class="welcome-grid">
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-filter"></i> Lọc Ngữ Cảnh</h4>
                        <p>Xác thực tính liên quan của yêu cầu, phân loại loại truy vấn và định tuyến luồng xử lý phù hợp.</p>
                    </div>
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-magnifying-glass"></i> Nghiên Cứu</h4>
                        <p>Truy xuất tri thức từ kho dữ liệu FPT qua cơ chế Hybrid Search kết hợp Chroma &amp; BM25.</p>
                    </div>
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-chart-simple"></i> Phân Tích</h4>
                        <p>Xây dựng ma trận so sánh đa chiều, đánh giá các phương án kiến trúc và lợi thế cạnh tranh.</p>
                    </div>
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-triangle-exclamation"></i> Kiểm Soát Rủi Ro</h4>
                        <p>Nhận diện rủi ro kỹ thuật &amp; vận hành, đề xuất biện pháp kiểm soát theo chuẩn FPT Secure-First.</p>
                    </div>
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-lightbulb"></i> Đề Xuất Chiến Lược</h4>
                        <p>Thiết lập lộ trình triển khai đa giai đoạn và hệ thống KPI đo lường hiệu quả thực thi.</p>
                    </div>
                    <div class="welcome-card">
                        <h4><i class="fa-solid fa-file-lines"></i> Biên Soạn Báo Cáo</h4>
                        <p>Tổng hợp toàn bộ đầu ra, biên soạn báo cáo học thuật và trực quan hóa kiến trúc qua sơ đồ Mermaid.</p>
                    </div>
                </div>
            </div>
        `;
        activeAgentBadge.textContent = 'Chờ lệnh';
        activeAgentBadge.className   = 'agent-badge inactive';

        showUncreatedReportCard();
        showUncreatedDiagramCard();
        if (rawMarkdownText) rawMarkdownText.value = 'Báo cáo chưa được tạo';
        currentMarkdown = '';

        printQueue = [];
        isPrinting = false;

        uploadedDiagramDataUrl = null;
        if (chatFileInput) {
            chatFileInput.value = '';
        }

        hasAnalystRun = false;
        runBtn.disabled  = false;
        runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
        if (stopBtn) stopBtn.style.display = 'none';

        localStorage.removeItem('fpt_active_search');
    }

    // New Chat "+" icon button
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', startNewChat);
    }

    // Check if there was an active search when reloading
    const activeSearchStored = localStorage.getItem('fpt_active_search');
    let hasRestoredActiveSearch = false;
    
    if (activeSearchStored) {
        try {
            const activeSearch = JSON.parse(activeSearchStored);
            // Re-connect and resume if the search was running within the last 2 minutes
            if (activeSearch && activeSearch.status === 'running' && (Date.now() - activeSearch.timestamp < 120000)) {
                hasRestoredActiveSearch = true;
                
                if (topicInput) topicInput.value = activeSearch.topic;
                
                statTime.textContent = formatTimeString(activeSearch.stats.time);
                statTokens.textContent = activeSearch.stats.tokens;
                statAgents.textContent = activeSearch.stats.agents;
                statStatus.textContent = 'Đang chạy…';
                statStatus.style.color = 'var(--fpt-orange)';

                if (consoleOutput) {
                    consoleOutput.innerHTML = activeSearch.logs;
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }

                hasAnalystRun = activeSearch.hasAnalystRun;

                const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
                agentKeys.forEach(k => {
                    const badge = document.getElementById(`metrics-${k}`);
                    if (badge && activeSearch.stats.agent_tokens) {
                        const durVal = activeSearch.stats.agent_durations && activeSearch.stats.agent_durations[k] ? activeSearch.stats.agent_durations[k] : 0;
                        const durText = `${durVal.toFixed(3)}s`;
                        const tk = activeSearch.stats.agent_tokens[k] ? activeSearch.stats.agent_tokens[k].toLocaleString() : '0';
                        const tps = activeSearch.stats.agent_toks_per_sec && activeSearch.stats.agent_toks_per_sec[k] ? activeSearch.stats.agent_toks_per_sec[k].toFixed(1) : '0.0';
                        const mdl = activeSearch.stats.agent_models && activeSearch.stats.agent_models[k] ? activeSearch.stats.agent_models[k].split('/').pop() : '';
                        badge.textContent = mdl ? `${mdl} · ${durText} · ${tps} tk/s · ${tk} tk` : `${durText} · ${tk} tk`;
                        badge.title = (activeSearch.stats.agent_models && activeSearch.stats.agent_models[k]) || '';
                    }
                });

                if (activeSearch.activeNode) {
                    highlightNode(activeSearch.activeNode);
                }

                showUncreatedReportCard();
                showUncreatedDiagramCard();

                runBtn.disabled  = true;
                runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chạy…';
                if (stopBtn) stopBtn.style.display = 'block';
                highlightPanel('running');

                let elapsedMs = 0;
                const timeText = activeSearch.stats.time || '';
                if (timeText.endsWith('ms')) {
                    elapsedMs = parseFloat(timeText) || 0;
                } else {
                    elapsedMs = (parseFloat(timeText) || 0) * 1000;
                }
                runStartTime = Date.now() - elapsedMs;
                let lastSaveTime = Date.now();
                timerInterval = setInterval(() => {
                    const now = Date.now();
                    statTime.textContent = `${((now - runStartTime) / 1000).toFixed(3)}s`;
                    if (now - lastSaveTime >= 1000) {
                        saveActiveSearchState('running');
                        lastSaveTime = now;
                    }
                }, 50);

                const reconnectLog = document.createElement('div');
                reconnectLog.className = 'console-log';
                reconnectLog.style.color = 'var(--fpt-orange)';
                reconnectLog.innerHTML = `<br><span style="font-weight:bold;">[Hệ Thống]</span> Đang khôi phục tiến trình phân tích cho: <strong>${activeSearch.topic}</strong>...`;
                consoleOutput.appendChild(reconnectLog);
                consoleOutput.scrollTop = consoleOutput.scrollHeight;

                const abortController = new AbortController();
                window.activeFetchAbortController = abortController;

                fetch(getApiPrefix() + `/api/run?topic=${encodeURIComponent(activeSearch.topic)}`, {
                    signal: abortController.signal,
                    headers: {
                        'Accept': 'text/event-stream'
                    }
                })
                .then(async response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let buffer = '';
                    
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop();
                        
                        for (const line of lines) {
                            const cleanLine = line.trim();
                            if (!cleanLine.startsWith('data:')) continue;
                            
                            const eventDataStr = cleanLine.substring(5).trim();
                            if (!eventDataStr) continue;
                            
                            let data;
                            try {
                                data = JSON.parse(eventDataStr);
                            } catch (e) {
                                console.error('SSE JSON parse error:', e);
                                continue;
                            }
                            
                            handleSseMessage(data);
                        }
                    }
                })
                .catch(err => {
                    if (err.name === 'AbortError') {
                        return; // User cancelled
                    }
                    console.error('Fetch SSE error:', err);
                    if (statStatus.textContent !== 'Hoàn Thành ✅' && statStatus.textContent !== 'Bị Từ Chối ❌' && statStatus.textContent !== 'Đã tạm dừng') {
                        clearInterval(timerInterval);
                        statStatus.textContent = 'Lỗi Kết Nối';
                        statStatus.style.color = '#ef4444';
                        runBtn.disabled  = false;
                        runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
                        if (stopBtn) stopBtn.style.display = 'none';

                        if (consoleOutput) {
                            const logDiv = document.createElement('div');
                            logDiv.className   = 'console-log';
                            logDiv.style.color = '#ef4444';
                            logDiv.style.marginTop = '10px';
                            logDiv.style.padding = '10px';
                            logDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                            logDiv.style.borderLeft = '4px solid #ef4444';
                            logDiv.style.borderRadius = '4px';
                            logDiv.innerHTML = `<span style="font-weight:bold;"><i class="fa-solid fa-circle-exclamation"></i> [LỖI KẾT NỐI MÁY CHỦ]</span> Không thể kết nối tới API tại <strong>${getApiPrefix()}</strong>.<br><br>` +
                                               `<strong>Hướng dẫn khắc phục sự cố:</strong><br>` +
                                               `• <strong>Đối với máy chủ cục bộ:</strong> Đảm bảo backend đang hoạt động (nhấp đúp tệp <strong>server.exe</strong> hoặc chạy lệnh <strong>python main.py --server</strong>) và lắng nghe trên cổng 8000.<br>` +
                                               `• <strong>Đối với máy chủ VPS/Từ xa:</strong> Kiểm tra lại địa chỉ cấu hình máy chủ trong bảng Cài đặt (nhấp biểu tượng <strong>bánh răng</strong> ở góc trên bên phải bảng yêu cầu) và đảm bảo máy chủ VPS của bạn đã bật CORS cho phép origin Vercel.<br>` +
                                               `• <strong>Vấn đề HTTPS / Mixed Content:</strong> Nếu truy cập Vercel qua HTTPS, trình duyệt sẽ chặn kết nối HTTP không bảo mật (Mixed Content). Hãy sử dụng địa chỉ HTTPS (qua VPS bảo mật, ngrok, hoặc localtunnel) để kết nối thành công.`;
                            consoleOutput.appendChild(logDiv);
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Error restoring active search:', e);
        }
    }

    function initializeOrSyncWithServer() {
        fetch(getApiPrefix() + '/api/report?t=' + Date.now())
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (data.report && 
                    !data.report.includes('Báo cáo chưa được tạo') && 
                    !data.report.includes('Report not created') && 
                    !data.report.includes('not generated yet') &&
                    !data.report.includes('Request Rejected')) {
                    
                    let topic = 'Phân tích hệ thống';
                    const match = data.report.match(/^#\s+(.+)$/m);
                    if (match && match[1]) {
                        topic = match[1].trim();
                    }

                    currentMarkdown = data.report;
                    if (rawMarkdownText) rawMarkdownText.value = data.report;
                    
                    reportView.style.cssText = '';
                    reportView.innerHTML = marked.parse(data.report);

                    uploadedDiagramDataUrl = null;
                    if (data.diagram) {
                        renderMermaidDiagram(data.diagram);
                    } else {
                        renderMermaidDiagram(data.report);
                    }

                    const expContainer = document.getElementById('mermaid-explanation-container');
                    const expContent = document.getElementById('mermaid-explanation-content');
                    if (expContainer && expContent && data.explanation) {
                        expContent.innerHTML = marked.parse(data.explanation);
                        expContainer.style.display = 'block';
                    } else if (expContainer) {
                        expContainer.style.display = 'none';
                    }

                    if (downloadGroup) downloadGroup.style.display = 'flex';
                } else {
                    showUncreatedReportCard();
                    showUncreatedDiagramCard();
                }
            })
            .catch(err => {
                console.error('Initial sync error:', err);
                showUncreatedReportCard();
                showUncreatedDiagramCard();
            });
    }

    if (consoleOutput && hideAnalysisLogText) {
        consoleOutput.classList.add('hide-analysis-suffix');
    }

    // Kiểm tra kết nối máy chủ ban đầu và thiết lập định kỳ mỗi 15 giây
    checkServerConnection();
    setInterval(checkServerConnection, 15000);

    if (!hasRestoredActiveSearch) {
        initializeOrSyncWithServer();
    }
});
