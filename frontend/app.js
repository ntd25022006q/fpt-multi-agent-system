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
        let defaultUrl = 'https://fpt-multi-agent-system.onrender.com';
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '0.0.0.0' || window.location.port !== '') {
            defaultUrl = window.location.origin;
        }
        serverUrlInput.value = localStorage.getItem('fpt_server_url') || defaultUrl;
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

    // Active real-time stream state
    let activeStream = {
        node: null,
        rawText: '',
        thinkingText: '',
        contentText: '',
        section: 'none',
        logHeaderEl: null,
        thinkingDetailsEl: null,
        thinkingContentEl: null,
        logBodyEl: null
    };

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
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            if (!currentMarkdown || currentMarkdown.includes('not generated yet') || currentMarkdown.includes('Báo cáo chưa được tạo')) {
                alert('Chưa có báo cáo. Vui lòng chạy quy trình trước!');
                return;
            }

            const origHTML = downloadPdfBtn.innerHTML;
            downloadPdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo PDF…';
            downloadPdfBtn.disabled = true;

            const tempDiv = document.createElement('div');
            tempDiv.className = 'academic-pdf-export';
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            tempDiv.style.width = '720px'; // 720px width yields perfect page aspect ratio for A4
            document.body.appendChild(tempDiv);

            try {
                const topic = topicInput.value.trim() || 'Báo cáo chi tiết chiến lược';
                const dateStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                
                // Get the report content
                let reportContentHTML = reportView.innerHTML;
                
                // Embed user uploaded diagram if present
                let uploadHTML = '';
                if (uploadedDiagramDataUrl) {
                    uploadHTML = `
                    <h2>SƠ ĐỒ KIẾN TRÚC HỆ THỐNG (ẢNH TẢI LÊN)</h2>
                    <div class="pdf-mermaid-svg" style="text-align: center;">
                        <img src="${uploadedDiagramDataUrl}" style="max-width: 100%; max-height: 400px; border-radius: 6px; display: inline-block;">
                    </div>`;
                }
                
                // Embed automatically generated Mermaid SVG diagram if present
                let diagramHTML = '';
                const renderedSvg = document.querySelector('#mermaid-render-output svg');
                if (renderedSvg) {
                    const clonedSvg = renderedSvg.cloneNode(true);
                    clonedSvg.removeAttribute('id');
                    clonedSvg.style.transform = 'none';
                    clonedSvg.style.transformOrigin = 'unset';
                    clonedSvg.style.transition = 'none';
                    clonedSvg.style.maxWidth = '100%';
                    clonedSvg.style.height = 'auto';
                    clonedSvg.style.display = 'block';
                    clonedSvg.style.margin = '20px auto';
                    
                    // Extract native viewBox dimensions
                    let w = 800;
                    let h = 600;
                    const viewBoxAttr = renderedSvg.getAttribute('viewBox');
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.split(/[\s,]+/);
                        if (parts.length === 4) {
                            w = parseFloat(parts[2]) || 800;
                            h = parseFloat(parts[3]) || 600;
                        }
                    }
                    clonedSvg.setAttribute('width', w);
                    clonedSvg.setAttribute('height', h);
                    
                    const svgHtml = clonedSvg.outerHTML;
                    diagramHTML = `
                    <h2>SƠ ĐỒ LUỒNG KIẾN TRÚC HỆ THỐNG</h2>
                    <div class="pdf-mermaid-svg">
                        ${svgHtml}
                    </div>`;
                }
                
                // Embed explanation text if present
                let explanationHTML = '';
                const expContent = document.getElementById('mermaid-explanation-content');
                if (expContent && expContent.innerHTML && expContent.innerHTML.trim() !== '') {
                    explanationHTML = `
                    <h2>GIẢI THÍCH CHI TIẾT SƠ ĐỒ</h2>
                    <div class="pdf-explanation">
                        ${expContent.innerHTML}
                    </div>`;
                }

                tempDiv.innerHTML = `
                    <div class="pdf-header">
                        <div>
                            <div class="pdf-header-title">FPT Software</div>
                            <div style="font-size: 8pt; color: #4b5563; margin-top: 2px;">Hệ Thống Báo Cáo Tri Thức Doanh Nghiệp Multi-Agent</div>
                        </div>
                        <div class="pdf-header-meta">
                            ${dateStr}
                        </div>
                    </div>
                    <h1 class="pdf-title">${topic}</h1>
                    <div style="text-align: center; font-size: 10pt; color: #4b5563; margin-bottom: 30px; line-height: 1.5;">
                        <strong>Đơn vị thực hiện:</strong> Hệ thống Multi-Agent FPT Software<br>
                        <strong>Phát triển bởi:</strong> Nguyễn Tiến Đạt<br>
                        <strong>Mô tả:</strong> Báo cáo nghiên cứu tích hợp sâu, tổng hợp từ 6 Tác nhân AI
                    </div>
                    <div class="pdf-content">
                        ${reportContentHTML}
                        ${uploadHTML}
                        ${diagramHTML}
                        ${explanationHTML}
                    </div>
                `;

                // Re-run LaTeX auto-render in the temp div to ensure math renders inside PDF
                if (window.renderMathInElement) {
                    window.renderMathInElement(tempDiv, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false }
                        ],
                        throwOnError: false
                    });
                }

                const opt = {
                    margin:       [15, 15, 15, 15],
                    filename:     `FPT_BaoCao_ChiTiet_${new Date().toISOString().slice(0,10)}.pdf`,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { 
                        scale: 2, 
                        useCORS: true, 
                        logging: false,
                        letterRendering: true
                    },
                    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                html2pdf().set(opt).from(tempDiv).save().then(() => {
                    document.body.removeChild(tempDiv);
                    downloadPdfBtn.innerHTML = origHTML;
                    downloadPdfBtn.disabled = false;
                }).catch(pdfErr => {
                    console.error('html2pdf save error:', pdfErr);
                    alert(`Lỗi tạo PDF: ${pdfErr.message}`);
                    document.body.removeChild(tempDiv);
                    downloadPdfBtn.innerHTML = origHTML;
                    downloadPdfBtn.disabled = false;
                });

            } catch (err) {
                console.error('PDF error:', err);
                alert(`Lỗi tạo PDF: ${err.message}`);
                if (tempDiv.parentNode) {
                    document.body.removeChild(tempDiv);
                }
                downloadPdfBtn.innerHTML = origHTML;
                downloadPdfBtn.disabled = false;
            }
        });
    }

    // (Old DOCX listener removed to avoid errors, since the button was deleted)

    // ── 3. Diagram Download (PNG via Canvas) ──────────────────────────────────
    if (downloadDiagBtn) {
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

                // Strip pan/zoom transforms to restore native size and center alignment
                cloned.style.transform = 'none';
                cloned.style.transformOrigin = 'unset';
                cloned.style.transition = 'none';
                cloned.removeAttribute('id');

                // Extract native dimensions from viewBox
                let w = 800;
                let h = 600;
                const viewBoxAttr = svgEl.getAttribute('viewBox');
                if (viewBoxAttr) {
                    const parts = viewBoxAttr.split(/[\s,]+/);
                    if (parts.length === 4) {
                        w = parseFloat(parts[2]) || 800;
                        h = parseFloat(parts[3]) || 600;
                    }
                } else {
                    const bbox = svgEl.getBoundingClientRect();
                    w = bbox.width || 800;
                    h = bbox.height || 600;
                }

                cloned.setAttribute('width', w);
                cloned.setAttribute('height', h);
                cloned.setAttribute('viewBox', viewBoxAttr || `0 0 ${w} ${h}`);

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
                        const scale   = 2; // Retina resolution scaling factor
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
    }

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
        reportView.style.maxWidth = '100%';
        reportView.style.margin = '5px 0';
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
        mermaidOutput.style.maxWidth = '100%';
        mermaidOutput.style.margin = '5px 0';
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
            n.classList.remove('completed');
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

    function highlightNode(nodeKey) {
        const mapping = agentMappings[nodeKey];
        if (!mapping) return;

        if (nodeKey === 'analyst') {
            hasAnalystRun = true;
        }

        const nodesOrder = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
        const currentIndex = nodesOrder.indexOf(nodeKey);

        nodesOrder.forEach((nk, idx) => {
            const m = agentMappings[nk];
            const nodeEl = document.getElementById(m.nodeId);
            if (nodeEl) {
                if (idx < currentIndex) {
                    nodeEl.classList.add('completed');
                    nodeEl.classList.remove('active');
                } else if (idx === currentIndex) {
                    nodeEl.classList.remove('completed');
                    nodeEl.classList.add('active');
                } else {
                    nodeEl.classList.remove('completed');
                    nodeEl.classList.remove('active');
                }
            }

            // Handle edge lighting dynamically
            const edgeId = (nk === 'reporter' && !hasAnalystRun) ? 'edge-researcher-reporter' : m.edgeId;
            if (edgeId) {
                const edgeEl = document.getElementById(edgeId);
                if (edgeEl) {
                    if (idx <= currentIndex) {
                        edgeEl.classList.add('active');
                    } else {
                        edgeEl.classList.remove('active');
                    }
                }
            }
        });

        if (nodeKey === 'reporter' && !hasAnalystRun) {
            // QA Flow: Hide intermediate nodes and their edges
            document.getElementById('node-analyst')?.classList.add('node-hidden');
            document.getElementById('node-risk_assessor')?.classList.add('node-hidden');
            document.getElementById('node-recommender')?.classList.add('node-hidden');
            
            document.getElementById('edge-researcher-analyst')?.classList.add('edge-hidden');
            document.getElementById('edge-analyst-risk_assessor')?.classList.add('edge-hidden');
            document.getElementById('edge-risk_assessor-recommender')?.classList.add('edge-hidden');
            document.getElementById('edge-recommender-reporter')?.classList.add('edge-hidden');
            
            const directEdge = document.getElementById('edge-researcher-reporter');
            if (directEdge) {
                directEdge.style.display = 'block';
                directEdge.classList.add('active');
            }
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
        element.textContent = text;
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        return Promise.resolve();
    }

    function stripMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#+\s+(.+)$/gm, '$1')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+[\.\-]\s+/gm, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/&nbsp;/g, ' ')
            .replace(/_{2,}/g, '')
            .replace(/\*{2,}/g, '')
            .trim();
    }

    const FILENAME_MAP = {
        "agentvista_testvista.md": "Tài liệu Khảo sát AgentVista & TestVista",
        "ai_first_challenges.md": "Báo cáo Thách thức Chiến lược AI-First",
        "codevista_features.md": "Tài liệu Tính năng CodeVista",
        "coding_standards.md": "Quy chuẩn Phát triển Phần mềm FPT Software",
        "flezi_foundry_adlc.md": "Báo cáo Quy trình Vận hành Flezi Foundry ADLC",
        "flezipt_architecture.md": "Kiến trúc Nền tảng Flezi Platform (FlezIPT)",
        "fpt_academic_publications.md": "Các Công trình Nghiên cứu Khoa học FPT Software",
        "fpt_agentic_ai_2026.md": "Báo cáo Phát triển Agentic AI FPT Software 2026",
        "fpt_ai_initiatives_2026.md": "Sáng kiến Chiến lược AI FPT Software 2026",
        "fpt_ai_research_lab_2026.md": "Tài liệu Phòng Nghiên cứu Trí tuệ Nhân tạo FPT AI Research Lab",
        "fpt_ai_strategy_advisory_2026.md": "Báo cáo Tư vấn Chiến lược AI FPT Software 2026",
        "fpt_architecture_consulting_2026.md": "Quy trình Tư vấn Kiến trúc Công nghệ FPT Software 2026",
        "fpt_enterprise_products_2026.md": "Danh mục Sản phẩm Doanh nghiệp FPT Software 2026",
        "fpt_financial_growth_2026.md": "Báo cáo Phát triển Tài chính FPT Software 2026",
        "fpt_flezi_ecosystem.md": "Tài liệu Hệ sinh thái Flezi Ecosystem FPT",
        "fpt_global_presence_2026.md": "Báo cáo Năng lực Toàn cầu FPT Software 2026",
        "fpt_global_verticals_2026.md": "Tài liệu Lĩnh vực Kinh doanh Toàn cầu FPT Software 2026",
        "fpt_research.md": "Báo cáo Nghiên cứu và Phát triển Công nghệ FPT Software",
        "fpt_risk_compliance_2026.md": "Tài liệu Quản trị Rủi ro & Tuân thủ FPT Software 2026",
        "fpt_software_overview_2026.md": "Tài liệu Tổng quan FPT Software 2026",
        "sdlc_evolution.md": "Tài liệu Tiến trình Phát triển Phần mềm SDLC FPT",
        "security_best_practices.md": "Quy chuẩn Bảo mật Thông tin FPT Software",
    };

    function cleanInternalFilenames(text) {
        if (!text) return '';
        let cleaned = text;
        
        // 1. Remove RAG prefixes and list of files in parentheses
        const prefixPat = /(?:Truy\s+xuất\s+dữ\s+liệu|Truy\s+xuất\s+tri\s+thức|Nguồn\s+dữ\s+liệu|Tham\s+khảo)\s+từ\s+(?:kho\s+)?(?:tri\s+thức|dữ\s+liệu)\s+nội\s+bộ\s*(?:\([^)]*\)|:[^\n.]*|)/gi;
        cleaned = cleaned.replace(prefixPat, '');
        
        // Remove parenthesized lists of filenames
        const parenPat = /\(\s*[^)]*\.(?:md|txt)[^)]*\)/gi;
        cleaned = cleaned.replace(parenPat, '');
        
        // 2. Fallback translations
        const sortedKeys = Object.keys(FILENAME_MAP).sort((a, b) => b.length - a.length);
        for (const filename of sortedKeys) {
            const title = FILENAME_MAP[filename];
            const escaped = filename.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            cleaned = cleaned.replace(regex, title);
        }
        
        for (const filename of sortedKeys) {
            const title = FILENAME_MAP[filename];
            const nameNoExt = filename.split('.').slice(0, -1).join('.');
            const escaped = nameNoExt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
            cleaned = cleaned.replace(regex, title);
        }
        
        // Strip any remaining raw .md / .txt filenames
        cleaned = cleaned.replace(/\b[a-zA-Z0-9_-]+\.(?:md|txt)\b/g, '');
        
        return cleaned;
    }

    // ── Print Queue ──────────────────────────────────────────────────────────
    async function processQueue() {
        if (printQueue.length === 0) { isPrinting = false; return; }
        isPrinting = true;
        const item = printQueue.shift();

        // Start marker (sequentially queued agent start)
        if (item.type === 'start') {
            highlightNode(item.node); // Sequential highlight transition
            printAgentStartInLog(item.node);
            isPrinting = false;
            processQueue();
            return;
        }

        // Completion marker
        if (item.type === 'completion') {
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
            thinkingContainer.style.cssText = 'border-radius: 0 8px 8px 0;';
            thinkingContainer.open = true; // default to open for clear intuition
            
            const summary = document.createElement('summary');
            summary.style.cssText = 'cursor: pointer; font-weight: 600; outline: none; margin-bottom: 4px; user-select: none; color: #a0aec0;';
            summary.innerHTML = '<i class="fa-solid fa-brain"></i> Quá trình suy nghĩ (Thinking Process)';
            thinkingContainer.appendChild(summary);
            
            const thinkingContent = document.createElement('div');
            thinkingContent.style.cssText = 'white-space: pre-line; line-height: 1.5; padding: 4px 0;';
            thinkingContent.textContent = stripMarkdown(item.thinking);
            thinkingContainer.appendChild(thinkingContent);
            consoleOutput.appendChild(thinkingContainer);
        }

        const logBody = document.createElement('div');
        logBody.className  = 'console-log';
        logBody.style.cssText = `color:#b0bec8;padding-left:12px;border-left:2px solid ${titleColor};margin-bottom:12px;line-height:1.55;`;
        consoleOutput.appendChild(logBody);

        await typeText(logBody, stripMarkdown(item.content) || 'Không có thông tin ghi nhận.', 4);
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
            // Render report and update stats immediately in real-time!
            clearInterval(timerInterval);
            highlightPanel('complete');

            if (data.stats) {
                statTime.textContent   = formatTimeString(data.stats.time);
                statTokens.textContent = data.stats.tokens;

                if (data.stats.irrelevant) {
                    statAgents.textContent = '1 / 6';
                    statStatus.textContent = 'Bị Từ Chối ❌';
                    statStatus.style.color = '#ef4444';
                } else {
                    const agentCount = data.stats.agents || 6;
                    statAgents.textContent = `${agentCount} / ${agentCount === 3 ? 3 : 6}`;
                    statStatus.textContent = 'Hoàn Thành ✅';
                    statStatus.style.color = '#16a069';
                    if (downloadGroup) downloadGroup.style.display = 'flex';
                }

                // Update metrics badges for all agents in real-time
                if (data.stats.agent_tokens) {
                    const agentKeys = ['guardrail', 'researcher', 'analyst', 'risk_assessor', 'recommender', 'reporter'];
                    agentKeys.forEach(k => {
                        const badge = document.getElementById(`metrics-${k}`);
                        if (badge) {
                            const durVal = data.stats.agent_durations && data.stats.agent_durations[k] ? data.stats.agent_durations[k] : 0;
                            const durText = `${durVal.toFixed(3)}s`;
                            const tk = data.stats.agent_tokens[k] ? data.stats.agent_tokens[k].toLocaleString() : '0';
                            const tps = data.stats.agent_toks_per_sec && data.stats.agent_toks_per_sec[k] ? data.stats.agent_toks_per_sec[k].toFixed(1) : '0.0';
                            const mdl = data.stats.agent_models && data.stats.agent_models[k] ? data.stats.agent_models[k].split('/').pop() : '';
                            badge.textContent = mdl ? `${mdl} · ${durText} · ${tps} tk/s · ${tk} tk` : `${durText} · ${tk} tk`;
                            badge.title = (data.stats.agent_models && data.stats.agent_models[k]) || '';
                        }
                    });
                }
            }

            runBtn.disabled  = false;
            runBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Phân Tích';
            if (data.report) {
                displayReportData(data);
            } else {
                fetchReport();
            }

            // Mark all active graph nodes and edges as completed
            document.querySelectorAll('.graph-node').forEach(n => {
                if (!n.classList.contains('node-hidden')) {
                    n.classList.remove('active');
                    n.classList.add('completed');
                }
            });
            document.querySelectorAll('.graph-edges line').forEach(l => {
                if (!l.classList.contains('edge-hidden')) {
                    l.classList.add('active');
                }
            });

            // Push completion marker to printQueue to gracefully end typewriter logic in background
            printQueue.push({ 
                type: 'completion', 
                stats: data.stats, 
                report: data.report, 
                diagram: data.diagram, 
                explanation: data.explanation 
            });
            if (!isPrinting) processQueue();
            if (stopBtn) stopBtn.style.display = 'none';
            localStorage.removeItem('fpt_active_search');
            return;
        }

        if (data.type === 'node_start') {
            // Update node visual highlight and badge immediately in real-time!
            highlightNode(data.node);
            
            // Immediately create the DOM containers for real-time streaming console logs!
            const nk = data.node;
            const mapping = agentMappings[nk];
            let titleColor = '#94a3b8';
            if      (nk === 'guardrail')    titleColor = 'var(--accent-guardrail)';
            else if (nk === 'researcher')   titleColor = 'var(--accent-researcher)';
            else if (nk === 'analyst')      titleColor = 'var(--accent-analyst)';
            else if (nk === 'risk_assessor') titleColor = 'var(--accent-risk)';
            else if (nk === 'recommender')  titleColor = 'var(--accent-recommender)';
            else if (nk === 'reporter')     titleColor = 'var(--accent-reporter)';

            // Clean welcome panel if it exists
            const welcome = consoleOutput.querySelector('.console-welcome');
            if (welcome) {
                consoleOutput.innerHTML = '';
            }

            const logHeader = document.createElement('div');
            logHeader.className = 'console-log';
            const agentName = mapping?.name ?? nk.toUpperCase();
            logHeader.innerHTML = `<span style="color:${titleColor};font-weight:bold;">[${agentName}]</span><span class="analysis-log-suffix"> nhật ký phân tích:</span>`;
            consoleOutput.appendChild(logHeader);

            // Collapsible thinking process container (visible/open by default)
            const thinkingContainer = document.createElement('details');
            thinkingContainer.className = 'console-log thinking-details';
            thinkingContainer.open = true;

            const summary = document.createElement('summary');
            summary.innerHTML = '<i class="fa-solid fa-brain"></i> Quá trình suy nghĩ (Thinking Process)';
            thinkingContainer.appendChild(summary);

            const thinkingContent = document.createElement('div');
            thinkingContent.style.cssText = 'white-space: pre-line; line-height: 1.5; padding: 4px 0;';
            thinkingContainer.appendChild(thinkingContent);
            consoleOutput.appendChild(thinkingContainer);

            // Log body container
            const logBody = document.createElement('div');
            logBody.className  = 'console-log';
            logBody.style.cssText = `color:#b0bec8;padding-left:12px;border-left:2px solid ${titleColor};margin-bottom:12px;line-height:1.55;`;
            consoleOutput.appendChild(logBody);

            consoleOutput.scrollTop = consoleOutput.scrollHeight;

            // Update active stream details
            activeStream = {
                node: nk,
                rawText: '',
                thinkingText: '',
                contentText: '',
                reportText: '',
                diagramText: '',
                explanationText: '',
                section: 'none',
                logHeaderEl: logHeader,
                thinkingDetailsEl: thinkingContainer,
                thinkingContentEl: thinkingContent,
                logBodyEl: logBody
            };

            saveActiveSearchState('running');
        }

        if (data.type === 'token') {
            // Append incoming LLM token in real-time
            if (data.node === activeStream.node) {
                activeStream.rawText += data.token;
                const rawText = activeStream.rawText;
                
                // Track transitions between THINKING, CONSOLE MESSAGE, DETAILED REPORT, MERMAID DIAGRAM and DIAGRAM EXPLANATION sections
                if (rawText.includes('=== THINKING ===') && activeStream.section === 'none') {
                    activeStream.section = 'thinking';
                    activeStream.thinkingDetailsEl.style.display = 'block';
                }
                
                if (rawText.includes('=== CONSOLE MESSAGE ===') && activeStream.section !== 'content' && activeStream.section !== 'report' && activeStream.section !== 'diagram' && activeStream.section !== 'explanation') {
                    activeStream.section = 'content';
                }

                if (rawText.includes('=== DETAILED REPORT ===') && activeStream.section !== 'report' && activeStream.section !== 'diagram' && activeStream.section !== 'explanation') {
                    activeStream.section = 'report';
                    // Programmatically switch to the Report tab when report starts streaming!
                    const reportTabBtn = document.getElementById('tab-btn-report');
                    if (reportTabBtn && !reportTabBtn.classList.contains('active')) {
                        reportTabBtn.click();
                    }
                }

                if ((rawText.includes('=== MERMAID DIAGRAM ===') || rawText.includes('=== SƠ ĐỒ MERMAID ===') || rawText.includes('=== BIỂU ĐỒ MERMAID ===')) && activeStream.section !== 'diagram' && activeStream.section !== 'explanation') {
                    activeStream.section = 'diagram';
                    // Programmatically switch to the Diagram tab when diagram starts streaming!
                    const diagramTabBtn = document.getElementById('tab-btn-diagram');
                    if (diagramTabBtn && !diagramTabBtn.classList.contains('active')) {
                        diagramTabBtn.click();
                    }
                }

                if ((rawText.includes('=== DIAGRAM EXPLANATION ===') || rawText.includes('=== GIẢI THÍCH CHI TIẾT SƠ ĐỒ ===') || rawText.includes('=== GIẢI THÍCH SƠ ĐỒ ===') || rawText.includes('=== GIẢI THÍCH ===')) && activeStream.section !== 'explanation') {
                    activeStream.section = 'explanation';
                }
                
                if (activeStream.section === 'thinking') {
                    if (activeStream.thinkingContentEl.textContent === '') {
                        const idx = rawText.indexOf('=== THINKING ===');
                        if (idx !== -1) {
                            const after = rawText.substring(idx + 16);
                            activeStream.thinkingText = after;
                            activeStream.thinkingContentEl.textContent = cleanInternalFilenames(stripMarkdown(after));
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                            return;
                        }
                    }
                    if (!data.token.includes('===') && !data.token.includes('CONSOLE')) {
                        activeStream.thinkingText += data.token;
                        activeStream.thinkingContentEl.textContent = cleanInternalFilenames(stripMarkdown(activeStream.thinkingText));
                    }
                } else if (activeStream.section === 'content') {
                    if (activeStream.logBodyEl.textContent === '') {
                        const idx = rawText.indexOf('=== CONSOLE MESSAGE ===');
                        if (idx !== -1) {
                            const after = rawText.substring(idx + 23);
                            activeStream.contentText = after;
                            activeStream.logBodyEl.textContent = cleanInternalFilenames(stripMarkdown(after));
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                            return;
                        }
                    }
                    if (!data.token.includes('===') && !data.token.includes('DETAILED')) {
                        activeStream.contentText += data.token;
                        activeStream.logBodyEl.textContent = cleanInternalFilenames(stripMarkdown(activeStream.contentText));
                    }
                } else if (activeStream.section === 'report') {
                    if (!activeStream.reportText) {
                        const idx = rawText.indexOf('=== DETAILED REPORT ===');
                        if (idx !== -1) {
                            const after = rawText.substring(idx + 23);
                            activeStream.reportText = after;
                        } else {
                            activeStream.reportText = '';
                        }
                    } else {
                        if (!data.token.includes('===') && !data.token.includes('MERMAID') && !data.token.includes('SƠ ĐỒ') && !data.token.includes('BIỂU ĐỒ')) {
                            activeStream.reportText += data.token;
                        }
                    }
                    if (activeStream.reportText) {
                        const cleanedReportText = cleanInternalFilenames(activeStream.reportText.replace(/={2,}/g, '').replace(/\*\*\*/g, ''));
                        currentMarkdown = cleanedReportText;
                        if (rawMarkdownText) rawMarkdownText.value = cleanedReportText;
                        renderMarkdownReport(cleanedReportText);
                    }
                } else if (activeStream.section === 'diagram') {
                    if (!activeStream.diagramText) {
                        const idx = Math.max(rawText.indexOf('=== MERMAID DIAGRAM ==='), rawText.indexOf('=== SƠ ĐỒ MERMAID ==='), rawText.indexOf('=== BIỂU ĐỒ MERMAID ==='));
                        if (idx !== -1) {
                            let offset = 23;
                            if (rawText.includes('=== SƠ ĐỒ MERMAID ===')) offset = 21;
                            else if (rawText.includes('=== BIỂU ĐỒ MERMAID ===')) offset = 23;
                            const after = rawText.substring(idx + offset);
                            activeStream.diagramText = after;
                        } else {
                            activeStream.diagramText = '';
                        }
                    } else {
                        if (!data.token.includes('===') && !data.token.includes('DIAGRAM') && !data.token.includes('GIẢI THÍCH')) {
                            activeStream.diagramText += data.token;
                        }
                    }
                    if (activeStream.diagramText) {
                        const cleanedDiagramText = activeStream.diagramText.replace(/={2,}/g, '').trim();
                        const outputContainer = document.getElementById('mermaid-render-output');
                        if (outputContainer && cleanedDiagramText) {
                            outputContainer.innerHTML = `<div style="padding:20px; font-family: 'Fira Code', monospace; font-size:11px; white-space:pre-wrap; text-align:left; color:#475569; width: 100%; height: 100%; box-sizing: border-box;"><div style="color:var(--fpt-blue); font-weight:700; margin-bottom:8px;"><i class="fa-solid fa-spinner fa-spin"></i> ĐANG VẼ SƠ ĐỒ KIẾN TRÚC...</div><code style="display:block; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0; overflow-x:auto;">${cleanedDiagramText}</code></div>`;
                        }
                    }
                } else if (activeStream.section === 'explanation') {
                    if (!activeStream.explanationText) {
                        const idx = Math.max(
                            rawText.indexOf('=== DIAGRAM EXPLANATION ==='),
                            rawText.indexOf('=== GIẢI THÍCH CHI TIẾT SƠ ĐỒ ==='),
                            rawText.indexOf('=== GIẢI THÍCH SƠ ĐỒ ==='),
                            rawText.indexOf('=== GIẢI THÍCH ===')
                        );
                        if (idx !== -1) {
                            let offset = 27;
                            if (rawText.includes('=== GIẢI THÍCH CHI TIẾT SƠ ĐỒ ===')) offset = 33;
                            else if (rawText.includes('=== GIẢI THÍCH SƠ ĐỒ ===')) offset = 24;
                            else if (rawText.includes('=== GIẢI THÍCH ===')) offset = 18;
                            const after = rawText.substring(idx + offset);
                            activeStream.explanationText = after;
                        } else {
                            activeStream.explanationText = '';
                        }
                    } else {
                        if (!data.token.includes('===')) {
                            activeStream.explanationText += data.token;
                        }
                    }
                    if (activeStream.explanationText) {
                        const expContainer = document.getElementById('mermaid-explanation-container');
                        const expContent = document.getElementById('mermaid-explanation-content');
                        if (expContainer && expContent) {
                            const cleanedExplanation = cleanInternalFilenames(activeStream.explanationText.replace(/={2,}/g, ''));
                            expContent.innerHTML = marked.parse(cleanedExplanation);
                            expContainer.style.display = 'block';
                        }
                    }
                }
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        }

        if (data.type === 'node_end' && data.content) {
            // Update the node's visual completion status and metrics badge immediately in real-time!
            const nodeEl = document.getElementById(agentMappings[data.node]?.nodeId);
            if (nodeEl) {
                nodeEl.classList.add('completed');
                nodeEl.classList.remove('active');
            }
            const edgeId = (data.node === 'reporter' && !hasAnalystRun) ? 'edge-researcher-reporter' : agentMappings[data.node]?.edgeId;
            if (edgeId) {
                const edgeEl = document.getElementById(edgeId);
                if (edgeEl) {
                    edgeEl.classList.add('active');
                }
            }
            const badge = document.getElementById(`metrics-${data.node}`);
            if (badge) {
                const durVal = data.duration ? data.duration : 0;
                const durText = `${durVal.toFixed(3)}s`;
                const tk = data.tokens ? data.tokens.toLocaleString() : '0';
                const tps = data.toks_per_sec ? data.toks_per_sec.toFixed(1) : '0.0';
                const mdl = data.model ? data.model.split('/').pop() : '';
                badge.textContent = mdl ? `${mdl} · ${durText} · ${tps} tk/s · ${tk} tk` : `${durText} · ${tk} tk`;
                badge.title = data.model || '';
            }

            // Sync with final cleaned text from server
            if (data.node === activeStream.node) {
                if (activeStream.thinkingContentEl && data.thinking) {
                    activeStream.thinkingContentEl.textContent = cleanInternalFilenames(stripMarkdown(data.thinking));
                }
                if (activeStream.logBodyEl && data.content) {
                    activeStream.logBodyEl.textContent = cleanInternalFilenames(stripMarkdown(data.content));
                }
                activeStream.node = null;
            }

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

        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        eventSource = new EventSource(getApiPrefix() + `/api/run?topic=${encodeURIComponent(topic)}`);

        eventSource.onmessage = (event) => {
            if (!event.data) return;
            try {
                const data = JSON.parse(event.data);
                handleSseMessage(data);
            } catch (e) {
                console.error('SSE parse error:', e);
            }
        };

        eventSource.onerror = (err) => {
            const statusText = statStatus.textContent || '';
            if (statusText.includes('Hoàn Thành') || statusText.includes('Bị Từ Chối') || statusText.includes('Đã tạm dừng') || statusText.includes('Thất Bại')) {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                return;
            }
            console.error('SSE EventSource error:', err);
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
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
        };
    });

    // ── Render Markdown and LaTeX (KaTeX) ──────────────────────────────────────
    function renderMarkdownReport(content) {
        if (!reportView) return;
        if (!content) {
            reportView.innerHTML = '';
            return;
        }

        // Protect math blocks from marked.js escaping
        const displayMath = [];
        const inlineMath = [];
        let processed = content;

        processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
            const placeholder = `MATHBLOCKPLACEHOLDER${displayMath.length}`;
            displayMath.push(math);
            return placeholder;
        });

        processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
            const placeholder = `MATHINLINEPLACEHOLDER${inlineMath.length}`;
            inlineMath.push(math);
            return placeholder;
        });

        let html = marked.parse(processed);

        displayMath.forEach((math, idx) => {
            try {
                const rendered = window.katex ? window.katex.renderToString(math, { displayMode: true, throwOnError: false }) : math;
                html = html.replace(`MATHBLOCKPLACEHOLDER${idx}`, rendered);
            } catch (e) {
                html = html.replace(`MATHBLOCKPLACEHOLDER${idx}`, `<span class="text-danger">${math}</span>`);
            }
        });

        inlineMath.forEach((math, idx) => {
            try {
                const rendered = window.katex ? window.katex.renderToString(math, { displayMode: false, throwOnError: false }) : math;
                html = html.replace(`MATHINLINEPLACEHOLDER${idx}`, rendered);
            } catch (e) {
                html = html.replace(`MATHINLINEPLACEHOLDER${idx}`, `<span class="text-danger">${math}</span>`);
            }
        });

        reportView.innerHTML = html;
    }

    // ── Display Report & Diagram Data ──────────────────────────────────────────
    function displayReportData(data) {
        if (!data || !data.report) return;

        let reportText = data.report;
        let diagramText = data.diagram || '';
        let explanationText = data.explanation || '';

        // Robust Fallback Parser if standard section markers are missing
        const hasMarkers = reportText.includes('=== DETAILED REPORT ===') || 
                           reportText.includes('=== CONSOLE MESSAGE ===') || 
                           reportText.includes('=== THINKING ===');

        if (!hasMarkers) {
            if (reportText.includes('```mermaid')) {
                const regex = /```mermaid\s*([\s\S]*?)\s*```/i;
                const match = reportText.match(regex);
                if (match) {
                    diagramText = match[1].trim();
                    const idx = reportText.indexOf('```mermaid');
                    const beforeDiagram = reportText.substring(0, idx).trim();
                    const endIdx = reportText.indexOf('```', idx + 10);
                    let afterDiagram = '';
                    if (endIdx !== -1) {
                        afterDiagram = reportText.substring(endIdx + 3).trim();
                    }
                    reportText = beforeDiagram;
                    explanationText = afterDiagram;
                }
            }
            
            if (reportText.trim().length === 0 && explanationText.trim().length > 0) {
                reportText = explanationText;
                explanationText = '';
            }

            // Sync Console Message with the first body paragraph
            const paragraphs = reportText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
            let firstPara = paragraphs.length > 0 ? paragraphs[0] : '';
            if (firstPara.startsWith('#') && paragraphs.length > 1) {
                firstPara = paragraphs[1];
            }
            if (firstPara) {
                const cleanSummary = cleanInternalFilenames(stripMarkdown(firstPara));
                const consoleLogs = consoleOutput.querySelectorAll('.console-log');
                if (consoleLogs.length > 0) {
                    const lastLog = consoleLogs[consoleLogs.length - 1];
                    if (lastLog && !lastLog.querySelector('summary') && !lastLog.querySelector('span')) {
                        lastLog.textContent = cleanSummary;
                    }
                }
            }
        }

        currentMarkdown = reportText;
        if (rawMarkdownText) rawMarkdownText.value = reportText;
        
        reportView.style.cssText = '';
        if (reportText.includes('Báo cáo chưa được tạo') || reportText.includes('Report not created') || reportText.includes('not generated yet')) {
            showUncreatedReportCard();
        } else {
            renderMarkdownReport(reportText);
        }
        
        try {
            if (diagramText) {
                renderMermaidDiagram(diagramText);
            } else {
                renderMermaidDiagram(reportText);
            }
        } catch (mErr) {
            console.error('Mermaid render failure:', mErr);
        }

        // Render diagram explanation
        const expContainer = document.getElementById('mermaid-explanation-container');
        const expContent = document.getElementById('mermaid-explanation-content');
        if (expContainer && expContent && explanationText) {
            expContent.innerHTML = marked.parse(explanationText);
            expContainer.style.display = 'block';
        } else if (expContainer) {
            expContainer.style.display = 'none';
        }

        if (!reportText.includes('Request Rejected') &&
            !reportText.includes('not generated yet') &&
            !reportText.includes('Báo cáo chưa được tạo') &&
            !reportText.includes('Report not created')) {
            if (downloadGroup) downloadGroup.style.display = 'flex';
        } else {
            if (downloadGroup) downloadGroup.style.display = 'none';
        }
    }

    // ── Fetch & Render Final Report ───────────────────────────────────────────
    function fetchReport() {
        uploadedDiagramDataUrl = null;
        fetch(getApiPrefix() + '/api/report?t=' + Date.now())
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (data.report) {
                    displayReportData(data);
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
                        renderMarkdownReport(content);
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

                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }

                eventSource = new EventSource(getApiPrefix() + `/api/run?topic=${encodeURIComponent(activeSearch.topic)}`);

                eventSource.onmessage = (event) => {
                    if (!event.data) return;
                    try {
                        const data = JSON.parse(event.data);
                        handleSseMessage(data);
                    } catch (e) {
                        console.error('SSE parse error:', e);
                    }
                };

                eventSource.onerror = (err) => {
                    const statusText = statStatus.textContent || '';
                    if (statusText.includes('Hoàn Thành') || statusText.includes('Bị Từ Chối') || statusText.includes('Đã tạm dừng') || statusText.includes('Thất Bại')) {
                        if (eventSource) {
                            eventSource.close();
                            eventSource = null;
                        }
                        return;
                    }
                    console.error('SSE EventSource error:', err);
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
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                };
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

                    displayReportData(data);
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
