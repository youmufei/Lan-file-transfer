/**
 * LAN File Transfer — Frontend App (Final)
 * Vanilla JS — no frameworks, no build step.
 * Features: upload/download, QR, PIN, push, drag-drop, speed/ETA, Chinese UI.
 */

(function () {
    'use strict';

    // ============ Device Detection ============
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // ============ DOM References ============
    const mainContainer = document.getElementById('mainContainer');
    const panelUpload = document.getElementById('panelUpload');
    const panelBrowse = document.getElementById('panelBrowse');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const textInput = document.getElementById('textInput');
    const refreshBtn = document.getElementById('refreshBtn');
    const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
    const filesList = document.getElementById('filesList');
    const textsList = document.getElementById('textsList');
    const connectionStatus = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    const bottomNav = document.getElementById('bottomNav');
    const desktopTabs = document.getElementById('desktopTabs');

    // ============ API Helpers ============
    function apiUrl(path) { return path; }

    async function apiRequest(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                throw new Error('无法连接到服务器，请检查网络。');
            }
            throw err;
        }
    }

    // ============ Toast System ============
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ============ Connection Check ============
    async function checkConnection() {
        try {
            const data = await apiRequest(apiUrl('/api/room-info'));
            if (data.status === 'active') {
                connectionStatus.className = 'status-dot online';
                statusText.textContent = '已连接';
                updateConnectInfo(data);
                updatePinUI(data);
                return true;
            }
        } catch (e) {
            connectionStatus.className = 'status-dot offline';
            statusText.textContent = '已断开';
            return false;
        }
    }

    function updateConnectInfo(data) {
        const urlEl = document.getElementById('infoUrl');
        const roomIdEl = document.getElementById('infoRoomId');
        const modalUrl = document.getElementById('modalUrl');
        const modalRoomId = document.getElementById('modalRoomId');
        if (urlEl) urlEl.textContent = data.url || '';
        if (roomIdEl) roomIdEl.textContent = data.room_id || '';
        if (modalUrl) modalUrl.textContent = data.url || '';
        if (modalRoomId) modalRoomId.textContent = data.room_id || '';
    }

    // ============ PIN Toggle (Phase 5 final) ============
    const pinToggle = document.getElementById('pinToggle');
    const pinDisplay = document.getElementById('pinDisplay');
    const revealPinBtn = document.getElementById('revealPinBtn');
    const infoPin = document.getElementById('infoPin');
    const pinInfoRow = document.getElementById('pinInfoRow');

    function updatePinUI(data) {
        if (pinToggle) pinToggle.checked = !!data.pin_enabled;
        if (pinDisplay) {
            if (data.pin_enabled && data.pin_code) {
                pinDisplay.textContent = data.pin_code;
                pinDisplay.classList.remove('hidden');
            } else {
                pinDisplay.classList.add('hidden');
            }
        }
        if (pinInfoRow) {
            pinInfoRow.style.display = data.pin_enabled ? 'flex' : 'none';
        }
        if (revealPinBtn) {
            if (data.pin_enabled) {
                revealPinBtn.classList.remove('hidden');
                revealPinBtn.dataset.revealed = 'false';
                revealPinBtn.textContent = '👁 显示 PIN';
                if (infoPin) infoPin.textContent = '••••';
            } else {
                revealPinBtn.classList.add('hidden');
            }
        }
    }

    if (pinToggle) {
        pinToggle.addEventListener('change', async () => {
            const enabled = pinToggle.checked;
            try {
                const data = await apiRequest('/api/toggle-pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled }),
                });
                updatePinUI(data);
                showToast(data.pin_enabled ? '🔐 PIN 码保护已开启' : '🔓 PIN 码保护已关闭', 'success');
            } catch (err) {
                pinToggle.checked = !enabled;
                showToast('❌ 切换 PIN 失败: ' + err.message, 'error');
            }
        });
    }

    if (revealPinBtn && infoPin) {
        revealPinBtn.addEventListener('click', async () => {
            if (revealPinBtn.dataset.revealed === 'true') {
                infoPin.textContent = '••••';
                revealPinBtn.textContent = '👁 显示 PIN';
                revealPinBtn.dataset.revealed = 'false';
                return;
            }
            try {
                const resp = await fetch('/api/verify-pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: '' }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    infoPin.textContent = data.pin;
                    revealPinBtn.textContent = '🙈 隐藏 PIN';
                    revealPinBtn.dataset.revealed = 'true';
                }
            } catch {
                showToast('无法获取 PIN 码', 'error');
            }
        });
    }

    // ============ Mobile Info Modal ============
    const mobileInfoBtn = document.getElementById('mobileInfoBtn');
    const infoModal = document.getElementById('infoModal');
    const closeInfoModal = document.getElementById('closeInfoModal');
    const modalCopyUrlBtn = document.getElementById('modalCopyUrlBtn');

    function openInfoModal() {
        if (infoModal) infoModal.classList.remove('hidden');
    }
    function closeInfoModalFn() {
        if (infoModal) infoModal.classList.add('hidden');
    }

    if (mobileInfoBtn) mobileInfoBtn.addEventListener('click', openInfoModal);
    if (closeInfoModal) closeInfoModal.addEventListener('click', closeInfoModalFn);
    if (infoModal) {
        infoModal.querySelector('.modal-backdrop')?.addEventListener('click', closeInfoModalFn);
    }
    if (modalCopyUrlBtn) {
        modalCopyUrlBtn.addEventListener('click', () => {
            const url = document.getElementById('modalUrl')?.textContent || '';
            if (url) copyToClipboard(url);
        });
    }

    // ============ Global Drag-and-Drop (anywhere on page) ============
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) document.body.classList.add('global-drag-over');
    });
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) document.body.classList.remove('global-drag-over');
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        document.body.classList.remove('global-drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const activeDropZone = document.querySelector('.drop-zone.drag-over');
            if (!activeDropZone) {
                Array.from(e.dataTransfer.files).forEach(file => uploadFile(file));
            }
        }
    });

    // ============ Paste from Clipboard Auto-Detect ============
    document.addEventListener('paste', (e) => {
        const clipboardItems = e.clipboardData?.items;
        if (!clipboardItems) return;
        for (const item of clipboardItems) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    const ext = item.type.split('/')[1] || 'png';
                    const filename = `clipboard_${Date.now()}.${ext}`;
                    const file = new File([blob], filename, { type: item.type });
                    uploadFile(file);
                    showToast('📋 图片已从剪贴板粘贴！', 'info');
                    return;
                }
            }
            if (item.kind === 'file' && !item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    uploadFile(file);
                    showToast('📋 文件已从剪贴板粘贴！', 'info');
                    return;
                }
            }
        }
    });

    // ============ Upload with Speed & ETA ============
    function uploadFile(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);

            uploadProgress.classList.remove('hidden');
            progressFill.style.width = '0%';
            progressText.textContent = `上传中: ${file.name}...`;

            let lastLoaded = 0, lastTime = Date.now();

            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';

                    const now = Date.now();
                    const elapsed = (now - lastTime) / 1000;
                    const bytesDelta = e.loaded - lastLoaded;
                    let info = `${file.name} — ${percent}%`;
                    if (elapsed >= 0.5 && bytesDelta > 0) {
                        const speed = bytesDelta / elapsed;
                        const remaining = e.total - e.loaded;
                        const etaS = speed > 0 ? Math.round(remaining / speed) : 0;
                        let speedStr = speed > 1024*1024 ? (speed/1024/1024).toFixed(1)+' MB/s'
                            : speed > 1024 ? (speed/1024).toFixed(0)+' KB/s' : speed.toFixed(0)+' B/s';
                        let etaStr = etaS > 60 ? Math.ceil(etaS/60)+'分' : etaS+'秒';
                        if (etaS === 0) etaStr = '...';
                        info += ` — ${speedStr} — 预计 ${etaStr}`;
                        lastLoaded = e.loaded;
                        lastTime = now;
                    }
                    progressText.textContent = info;
                }
            });

            xhr.addEventListener('load', () => {
                uploadProgress.classList.add('hidden');
                if (xhr.status >= 200 && xhr.status < 300) {
                    const result = JSON.parse(xhr.responseText);
                    showToast(`✅ ${result.original_name} 上传成功！`, 'success');
                    loadFiles();
                    resolve(result);
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.detail || `上传失败 (${xhr.status})`));
                    } catch {
                        reject(new Error(`上传失败 (${xhr.status})`));
                    }
                }
            });

            xhr.addEventListener('error', () => {
                uploadProgress.classList.add('hidden');
                reject(new Error('上传失败 — 网络错误'));
            });
            xhr.addEventListener('abort', () => {
                uploadProgress.classList.add('hidden');
                reject(new Error('上传已取消'));
            });

            xhr.open('POST', apiUrl('/api/upload/file'));
            xhr.send(formData);
        }).catch(err => showToast(`❌ ${err.message}`, 'error'));
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => uploadFile(file));
    }

    // Drop Zone Events
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    // Camera capture (mobile)
    const cameraBtn = document.getElementById('cameraBtn');
    if (cameraBtn) cameraBtn.addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', () => {
        handleFiles(cameraInput.files);
        cameraInput.value = '';
    });

    const selectFileBtn = document.getElementById('selectFileBtn');
    if (selectFileBtn) selectFileBtn.addEventListener('click', () => fileInput.click());

    // ============ Text / Link Upload ============
    async function sendText() {
        const content = textInput.value.trim();
        if (!content) {
            showToast('请先输入文字或链接', 'info');
            return;
        }
        try {
            const data = await apiRequest(apiUrl('/api/upload/text'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            showToast(`✅ ${data.message}`, 'success');
            textInput.value = '';
            loadTexts();
        } catch (err) {
            showToast(`❌ ${err.message}`, 'error');
        }
    }

    sendTextBtn.addEventListener('click', sendText);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendText();
        }
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                textInput.value = text;
                showToast('📋 已从剪贴板粘贴！', 'info');
            } else {
                showToast('剪贴板为空', 'info');
            }
        } catch {
            showToast('无法访问剪贴板，请手动粘贴', 'error');
        }
    });

    // ============ Load Files ============
    async function loadFiles() {
        try {
            const data = await apiRequest(apiUrl('/api/files'));
            renderFiles(data.files);
        } catch (err) { /* silent */ }
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
        return `${size} ${units[i]}`;
    }

    function getFileIcon(mimeType) {
        if (!mimeType) return '📄';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
        return '📄';
    }

    function isPreviewable(mimeType) {
        return mimeType && (
            mimeType.startsWith('image/') ||
            mimeType.startsWith('video/') ||
            mimeType.startsWith('audio/') ||
            mimeType.includes('pdf')
        );
    }

    function renderFiles(files) {
        if (!files || files.length === 0) {
            filesList.innerHTML = '<p class="empty-state">暂无文件，请上传吧！</p>';
            return;
        }
        filesList.innerHTML = files.map(f => {
            const previewable = isPreviewable(f.mime_type);
            const downUrl = apiUrl(`/api/download/${encodeURIComponent(f.filename)}`);
            return `
                <div class="item file-item" data-filename="${escapeAttr(f.filename)}">
                    <span class="item-icon">${getFileIcon(f.mime_type)}</span>
                    <div class="item-info">
                        <div class="item-name" title="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</div>
                        <div class="item-meta">${formatSize(f.size)}</div>
                    </div>
                    <div class="item-actions">
                        ${previewable ? `<button class="btn btn-outline btn-small preview-btn"
                            data-url="${escapeAttr(downUrl)}"
                            data-filename="${escapeAttr(f.filename)}"
                            data-mime="${escapeAttr(f.mime_type)}">👁 预览</button>` : ''}
                        <a href="${downUrl}" class="btn btn-primary btn-small" download>⬇ 下载</a>
                        <button class="btn btn-danger btn-small delete-file-btn"
                                data-filename="${escapeAttr(f.filename)}">🗑 删除</button>
                    </div>
                </div>`;
        }).join('');

        filesList.querySelectorAll('.preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                previewFile(btn.dataset.url, btn.dataset.filename, btn.dataset.mime);
            });
        });
        filesList.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteFile(btn.dataset.filename));
        });
    }

    function previewFile(url, filename, mime) {
        if (mime.startsWith('image/')) {
            showPreviewModal(`<img src="${url}" alt="${escapeHtml(filename)}" style="max-width:90vw;max-height:85vh;border-radius:8px;">`);
        } else if (mime.startsWith('video/')) {
            showPreviewModal(`<video controls autoplay style="max-width:90vw;max-height:85vh;border-radius:8px;"><source src="${url}" type="${mime}"></video>`);
        } else if (mime.startsWith('audio/')) {
            showPreviewModal(`<div style="padding:40px;text-align:center;"><p style="margin-bottom:16px;">🎵 ${escapeHtml(filename)}</p><audio controls autoplay style="width:100%;max-width:400px;"><source src="${url}" type="${mime}"></audio></div>`);
        } else {
            window.open(url, '_blank');
        }
    }

    function showPreviewModal(innerHTML) {
        const existing = document.querySelector('.preview-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        overlay.innerHTML = `<div class="preview-backdrop"></div><div class="preview-content">${innerHTML}</div><button class="preview-close">✕</button>`;
        overlay.querySelector('.preview-backdrop').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.preview-close').addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // ============ Load Texts ============
    async function loadTexts() {
        try {
            const data = await apiRequest(apiUrl('/api/texts'));
            renderTexts(data.texts);
        } catch (err) { /* silent */ }
    }

    function renderTexts(texts) {
        if (!texts || texts.length === 0) {
            textsList.innerHTML = '<p class="empty-state">暂无内容，发送点什么吧！</p>';
            return;
        }
        textsList.innerHTML = texts.map(t => {
            const isLink = t.type === 'link';
            const icon = isLink ? '🔗' : '💬';
            const typeLabel = isLink ? '链接' : '文字';
            const fullContent = t.content;
            const isLong = fullContent.length > 100;
            const summary = isLong ? fullContent.substring(0, 100) + '…' : fullContent;
            const textId = t.id;
            return `
                <div class="text-card" data-id="${textId}">
                    <div class="text-card-header">
                        <span class="text-card-icon">${icon}</span>
                        <span class="text-card-type">${typeLabel}</span>
                        <span class="text-card-time">${formatTime(t.timestamp)}</span>
                    </div>
                    <div class="text-card-body">
                        <div class="text-summary" id="summary-${textId}">
                            ${isLink ? `<a href="${escapeAttr(fullContent)}" target="_blank" rel="noopener" class="text-link">${escapeHtml(summary)}</a>`
                               : `<span class="text-content">${escapeHtml(summary)}</span>`}
                        </div>
                        ${isLong ? `<div class="text-full hidden" id="full-${textId}">
                            ${isLink ? `<a href="${escapeAttr(fullContent)}" target="_blank" rel="noopener" class="text-link">${escapeHtml(fullContent)}</a>`
                               : `<span class="text-content">${escapeHtml(fullContent)}</span>`}
                        </div>` : ''}
                    </div>
                    <div class="text-card-footer">
                        ${isLong ? `<button class="btn btn-small btn-outline toggle-text-btn" data-id="${textId}" data-expanded="false">📖 展开</button>` : ''}
                        <button class="btn btn-small btn-primary copy-text-btn" data-content="${escapeAttr(fullContent)}">📋 复制</button>
                        <button class="btn btn-small btn-danger delete-text-btn" data-content="${escapeAttr(fullContent)}" data-id="${textId}">🗑 删除</button>
                    </div>
                </div>`;
        }).join('');

        textsList.querySelectorAll('.toggle-text-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const summaryEl = document.getElementById('summary-' + id);
                const fullEl = document.getElementById('full-' + id);
                const expanded = btn.dataset.expanded === 'true';
                if (expanded) {
                    summaryEl.classList.remove('hidden');
                    fullEl.classList.add('hidden');
                    btn.dataset.expanded = 'false';
                    btn.textContent = '📖 展开';
                } else {
                    summaryEl.classList.add('hidden');
                    fullEl.classList.remove('hidden');
                    btn.dataset.expanded = 'true';
                    btn.textContent = '📕 收起';
                }
            });
        });
        textsList.querySelectorAll('.copy-text-btn').forEach(btn => {
            btn.addEventListener('click', () => copyToClipboard(btn.dataset.content));
        });
        textsList.querySelectorAll('.delete-text-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteText(btn.dataset.id, btn.dataset.content));
        });
    }

    function formatTime(isoString) {
        if (!isoString) return '';
        try {
            const d = new Date(isoString);
            const now = new Date();
            const diffMin = Math.floor((now - d) / 60000);
            if (diffMin < 1) return '刚刚';
            if (diffMin < 60) return `${diffMin}分钟前`;
            if (diffMin < 1440) return `${Math.floor(diffMin / 60)}小时前`;
            return d.toLocaleDateString('zh-CN');
        } catch { return ''; }
    }

    // ============ Delete Operations ============
    async function deleteFile(filename) {
        if (!confirm(`确定删除 "${filename}"？`)) return;
        try {
            await apiRequest(apiUrl(`/api/file/${encodeURIComponent(filename)}`), { method: 'DELETE' });
            showToast(`已删除 ${filename}`, 'info');
            loadFiles();
        } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
    }

    async function deleteText(textId, content) {
        const preview = content ? (content.length > 40 ? content.substring(0, 40) + '…' : content) : '此内容';
        if (!confirm(`确定删除"${preview}"？`)) return;
        try {
            await apiRequest(apiUrl(`/api/text/${textId}`), { method: 'DELETE' });
            showToast('已删除！', 'info');
            loadTexts();
        } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('📋 已复制到剪贴板！', 'success');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('📋 已复制！', 'info');
        }
    }

    // ============ Copy Connection URL ============
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const url = document.getElementById('infoUrl')?.textContent || '';
            if (url) copyToClipboard(url);
        });
    }

    // ============ Push to Mobile ============
    const pushTextInput = document.getElementById('pushTextInput');
    const sendPushTextBtn = document.getElementById('sendPushTextBtn');
    const pastePushBtn = document.getElementById('pastePushBtn');
    const pushDropZone = document.getElementById('pushDropZone');
    const pushFileInput = document.getElementById('pushFileInput');
    const pushUploadProgress = document.getElementById('pushUploadProgress');
    const pushProgressFill = document.getElementById('pushProgressFill');
    const pushProgressText = document.getElementById('pushProgressText');
    const pushHistoryList = document.getElementById('pushHistoryList');

    async function sendPushText() {
        const content = (pushTextInput?.value || '').trim();
        if (!content) { showToast('请先输入文字或链接', 'info'); return; }
        try {
            const data = await apiRequest(apiUrl('/api/push/text'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            showToast(`📡 ${data.message}`, 'success');
            if (pushTextInput) pushTextInput.value = '';
            loadPushHistory();
            loadTexts();
        } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
    }

    if (sendPushTextBtn) sendPushTextBtn.addEventListener('click', sendPushText);
    if (pushTextInput) {
        pushTextInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendPushText(); }
        });
    }
    if (pastePushBtn) {
        pastePushBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && pushTextInput) { pushTextInput.value = text; showToast('📋 已粘贴！', 'info'); }
            } catch { showToast('无法访问剪贴板', 'error'); }
        });
    }

    if (pushDropZone) {
        pushDropZone.addEventListener('click', () => pushFileInput?.click());
        pushDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pushDropZone.classList.add('drag-over'); });
        pushDropZone.addEventListener('dragleave', () => pushDropZone.classList.remove('drag-over'));
        pushDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            pushDropZone.classList.remove('drag-over');
            handlePushFiles(e.dataTransfer.files);
        });
    }
    if (pushFileInput) {
        pushFileInput.addEventListener('change', () => {
            handlePushFiles(pushFileInput.files);
            pushFileInput.value = '';
        });
    }

    function handlePushFiles(files) {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => pushFileUpload(file));
    }

    function pushFileUpload(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            if (pushUploadProgress) pushUploadProgress.classList.remove('hidden');
            if (pushProgressFill) pushProgressFill.style.width = '0%';
            if (pushProgressText) pushProgressText.textContent = `推送中: ${file.name}...`;
            let lastLoaded = 0, lastTime = Date.now();
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && pushProgressFill && pushProgressText) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    pushProgressFill.style.width = percent + '%';
                    const now = Date.now();
                    const elapsed = (now - lastTime) / 1000;
                    const bytesDelta = e.loaded - lastLoaded;
                    let info = `${file.name} — ${percent}%`;
                    if (elapsed >= 0.5 && bytesDelta > 0) {
                        const speed = bytesDelta / elapsed;
                        const remaining = e.total - e.loaded;
                        const etaS = speed > 0 ? Math.round(remaining / speed) : 0;
                        let speedStr = speed > 1024*1024 ? (speed/1024/1024).toFixed(1)+' MB/s' : speed > 1024 ? (speed/1024).toFixed(0)+' KB/s' : speed.toFixed(0)+' B/s';
                        let etaStr = etaS > 60 ? Math.ceil(etaS/60)+'分' : etaS+'秒';
                        if (etaS === 0) etaStr = '...';
                        info += ` — ${speedStr} — 预计 ${etaStr}`;
                        lastLoaded = e.loaded;
                        lastTime = now;
                    }
                    pushProgressText.textContent = info;
                }
            });
            xhr.addEventListener('load', () => {
                if (pushUploadProgress) pushUploadProgress.classList.add('hidden');
                if (xhr.status >= 200 && xhr.status < 300) {
                    const result = JSON.parse(xhr.responseText);
                    showToast(`📡 ${result.message}`, 'success');
                    loadPushHistory();
                    loadFiles();
                    resolve(result);
                } else { reject(new Error('推送失败')); }
            });
            xhr.addEventListener('error', () => {
                if (pushUploadProgress) pushUploadProgress.classList.add('hidden');
                reject(new Error('推送失败 — 网络错误'));
            });
            xhr.open('POST', apiUrl('/api/push/file'));
            xhr.send(formData);
        }).catch(err => showToast(`❌ ${err.message}`, 'error'));
    }

    async function loadPushHistory() {
        if (!pushHistoryList) return;
        try {
            const data = await apiRequest(apiUrl('/api/pushes'));
            renderPushHistory(data.pushes);
        } catch (err) { /* silent */ }
    }

    function renderPushHistory(pushes) {
        if (!pushHistoryList) return;
        if (!pushes || pushes.length === 0) {
            pushHistoryList.innerHTML = '<p class="empty-state">暂无推送记录。推送点什么到手机吧！</p>';
            return;
        }
        pushHistoryList.innerHTML = pushes.map(p => {
            const isLink = p.type === 'link';
            const isFile = p.type === 'file';
            const icon = isLink ? '🔗' : isFile ? '📎' : '💬';
            const title = isFile ? (p.filename || '文件') : (p.content || '').substring(0, 80);
            return `<div class="push-history-item">
                <span class="push-history-icon">${icon}</span>
                <div class="push-history-info">
                    <div class="push-history-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    <div class="push-history-meta">${formatTime(p.timestamp)}</div>
                </div>
                <span class="push-history-badge">已推送</span>
            </div>`;
        }).join('');
    }


    // ============ Tab Switching ============
    function switchDesktopTab(tabName) {
        document.querySelectorAll('#desktopTabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#panelBrowse .tab-content').forEach(tc => tc.classList.remove('active'));
        const tabBtn = document.querySelector(`#desktopTabs .tab[data-tab="${tabName}"]`);
        if (tabBtn) tabBtn.classList.add('active');
        const tabContent = document.getElementById(tabName + 'Tab');
        if (tabContent) tabContent.classList.add('active');
    }

    if (desktopTabs) {
        desktopTabs.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchDesktopTab(tab.dataset.tab));
        });
    }

    // ============ Mobile Bottom Navigation (3 buttons) ============
    if (isMobile && bottomNav) {
        bottomNav.style.display = 'flex';

        const navBtns = bottomNav.querySelectorAll('.bottom-nav-btn[data-panel]');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const panelName = btn.dataset.panel;
                if (panelName === 'upload') showMobilePanel('upload');
                else if (panelName === 'browse') {
                    showMobilePanel('browse');
                    switchDesktopTab('files');
                }
            });
        });

        // Mobile refresh button
        if (mobileRefreshBtn) {
            mobileRefreshBtn.addEventListener('click', () => {
                loadFiles();
                loadTexts();
                showToast('🔄 已刷新！', 'info');
            });
        }
    }

    function showMobilePanel(panelName) {
        if (panelName === 'upload') {
            panelUpload.classList.add('active');
            panelUpload.style.display = 'block';
            panelBrowse.classList.remove('active');
            panelBrowse.style.display = 'none';
        } else {
            panelBrowse.classList.add('active');
            panelBrowse.style.display = 'block';
            panelUpload.classList.remove('active');
            panelUpload.style.display = 'none';
        }
    }

    if (isMobile) showMobilePanel('upload');

    // ============ Refresh ============
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => { loadFiles(); loadTexts(); });
    }

    // ============ Preview Overlay Styles ============
    const previewStyles = document.createElement('style');
    previewStyles.textContent = `
        .preview-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;}
        .preview-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.85);}
        .preview-content{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;}
        .preview-close{position:absolute;top:16px;right:16px;z-index:2;background:rgba(255,255,255,0.2);color:#fff;border:none;width:44px;height:44px;border-radius:50%;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
        .preview-close:active{background:rgba(255,255,255,0.4);}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
    `;
    document.head.appendChild(previewStyles);

    // ============ Utility ============
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ============ Keyboard shortcut ============
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' && e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            loadFiles();
            loadTexts();
            showToast('🔄 已刷新！', 'info');
        }
    });

    // ============ Init ============
    async function init() {
        const connected = await checkConnection();
        if (connected) {
            loadFiles();
            loadTexts();
            loadPushHistory();
            setInterval(() => {
                loadFiles();
                loadTexts();
                loadPushHistory();
            }, 10000);
        }
        setInterval(checkConnection, 30000);
    }

    init();
})();
