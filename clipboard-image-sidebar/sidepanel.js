// ========================================
// IndexedDB Setup (タグ対応版)
// ========================================
const DB_NAME = 'ClipboardImageDB';
const DB_VERSION = 2; // タグ対応でバージョンアップ
const STORE_NAME = 'images';

let db = null;
let currentFilter = 'all';
let editingImageId = null;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // 既存データにtagsフィールドを追加する必要はIndexedDBでは不要
            // 新規データにはtagsが含まれる
        };
    });
}

async function saveImage(dataUrl, tags = []) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const imageData = {
            dataUrl,
            tags,
            timestamp: Date.now()
        };

        const request = store.add(imageData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateImageTags(id, tags) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const data = getRequest.result;
            if (data) {
                data.tags = tags;
                const putRequest = store.put(data);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                reject(new Error('Image not found'));
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function getAllImages() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result.reverse());
        request.onerror = () => reject(request.error);
    });
}

async function deleteImage(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function clearAllImages() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ========================================
// UI Elements
// ========================================
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const pasteZone = document.getElementById('paste-zone');
const pasteBtn = document.getElementById('paste-btn');
const screenshotBtn = document.getElementById('screenshot-btn');
const clearBtn = document.getElementById('clear-btn');
const toast = document.getElementById('toast');
const tagFilterBar = document.getElementById('tag-filter-bar');
const tagModal = document.getElementById('tag-modal');
const modalClose = document.getElementById('modal-close');
const currentTagsContainer = document.getElementById('current-tags');
const newTagInput = document.getElementById('new-tag-input');
const addTagBtn = document.getElementById('add-tag-btn');

// ========================================
// Utility Functions
// ========================================
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'たった今';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;

    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

async function addImageToGallery(dataUrl, tags = []) {
    const id = await saveImage(dataUrl, tags);
    const imageData = { id, dataUrl, tags, timestamp: Date.now() };
    gallery.insertBefore(createGalleryItem(imageData), gallery.firstChild);
    updateEmptyState();
    updateTagFilterBar();
    showToast('✅ 画像を保存しました');
}

// ========================================
// Tag Management
// ========================================
async function getAllTags() {
    const images = await getAllImages();
    const tagSet = new Set();
    images.forEach(img => {
        (img.tags || []).forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
}

async function updateTagFilterBar() {
    const tags = await getAllTags();
    tagFilterBar.innerHTML = '<button class="tag-chip active" data-tag="all">すべて</button>';

    tags.forEach(tag => {
        const chip = document.createElement('button');
        chip.className = 'tag-chip';
        chip.dataset.tag = tag;
        chip.textContent = tag;
        if (currentFilter === tag) {
            chip.classList.add('active');
            tagFilterBar.querySelector('[data-tag="all"]').classList.remove('active');
        }
        tagFilterBar.appendChild(chip);
    });
}

tagFilterBar.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-chip')) {
        currentFilter = e.target.dataset.tag;
        tagFilterBar.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        renderGallery();
    }
});

function openTagModal(imageId, currentTags) {
    editingImageId = imageId;
    tagModal.classList.add('show');
    renderCurrentTags(currentTags);
}

function closeTagModal() {
    tagModal.classList.remove('show');
    editingImageId = null;
    newTagInput.value = '';
}

modalClose.addEventListener('click', closeTagModal);
tagModal.addEventListener('click', (e) => {
    if (e.target === tagModal) closeTagModal();
});

function renderCurrentTags(tags) {
    currentTagsContainer.innerHTML = '';
    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'current-tag';
        tagEl.innerHTML = `${tag}<button class="remove-tag" data-tag="${tag}">✕</button>`;
        currentTagsContainer.appendChild(tagEl);
    });
}

currentTagsContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-tag')) {
        const tagToRemove = e.target.dataset.tag;
        const images = await getAllImages();
        const image = images.find(img => img.id === editingImageId);
        if (image) {
            const newTags = (image.tags || []).filter(t => t !== tagToRemove);
            await updateImageTags(editingImageId, newTags);
            renderCurrentTags(newTags);
            await renderGallery();
            await updateTagFilterBar();
        }
    }
});

async function addTag(tag) {
    if (!tag || !editingImageId) return;

    const images = await getAllImages();
    const image = images.find(img => img.id === editingImageId);
    if (image) {
        const currentTags = image.tags || [];
        if (!currentTags.includes(tag)) {
            const newTags = [...currentTags, tag];
            await updateImageTags(editingImageId, newTags);
            renderCurrentTags(newTags);
            await renderGallery();
            await updateTagFilterBar();
            showToast(`タグ "${tag}" を追加しました`);
        }
    }
    newTagInput.value = '';
}

addTagBtn.addEventListener('click', () => addTag(newTagInput.value.trim()));
newTagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTag(newTagInput.value.trim());
});

document.querySelectorAll('.preset-tag').forEach(btn => {
    btn.addEventListener('click', () => addTag(btn.dataset.tag));
});

// ========================================
// Gallery
// ========================================
function createGalleryItem(imageData) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.id = imageData.id;

    const tagsHtml = (imageData.tags || []).map(t => `<span class="item-tag">${t}</span>`).join('');

    div.innerHTML = `
    <img src="${imageData.dataUrl}" alt="Saved image">
    <div class="overlay">
      <span class="time">${formatTime(imageData.timestamp)}</span>
      <div class="item-tags">${tagsHtml}</div>
      <div class="overlay-actions">
        <button class="action-btn tag-btn" title="タグ編集">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
        </button>
        <button class="action-btn copy-btn" title="コピー">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
        <button class="action-btn download-btn" title="保存">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
        <button class="action-btn delete-btn" title="削除">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
  `;

    div.querySelector('.tag-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openTagModal(imageData.id, imageData.tags || []);
    });

    div.querySelector('.copy-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const response = await fetch(imageData.dataUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            showToast('📋 クリップボードにコピーしました');
        } catch (err) {
            showToast('コピーに失敗しました', 'error');
        }
    });

    div.querySelector('.download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = imageData.dataUrl;
        link.download = `image-${Date.now()}.png`;
        link.click();
        showToast('💾 ダウンロードを開始しました');
    });

    div.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteImage(imageData.id);
        div.remove();
        updateEmptyState();
        updateTagFilterBar();
        showToast('🗑️ 画像を削除しました');
    });

    return div;
}

async function renderGallery() {
    let images = await getAllImages();

    if (currentFilter !== 'all') {
        images = images.filter(img => (img.tags || []).includes(currentFilter));
    }

    gallery.innerHTML = '';
    images.forEach(img => gallery.appendChild(createGalleryItem(img)));
    updateEmptyState();
}

function updateEmptyState() {
    const hasImages = gallery.children.length > 0;
    emptyState.classList.toggle('show', !hasImages);
    gallery.style.display = hasImages ? 'grid' : 'none';
}

// ========================================
// Clipboard & Paste
// ========================================
async function readClipboardImage() {
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }
        }
    } catch (err) {
        console.error(err);
    }
    return null;
}

async function handlePaste(e) {
    e.preventDefault();
    const items = e.clipboardData?.items;
    if (items) {
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = async (event) => await addImageToGallery(event.target.result);
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        }
    }
    const dataUrl = await readClipboardImage();
    if (dataUrl) {
        await addImageToGallery(dataUrl);
    } else {
        showToast('クリップボードに画像がありません', 'error');
    }
}

pasteBtn.addEventListener('click', async () => {
    const dataUrl = await readClipboardImage();
    if (dataUrl) {
        await addImageToGallery(dataUrl);
    } else {
        showToast('クリップボードに画像がありません', 'error');
    }
});

// ========================================
// Screenshot
// ========================================
screenshotBtn.addEventListener('click', async () => {
    try {
        screenshotBtn.disabled = true;
        const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
        if (response.success) {
            await addImageToGallery(response.dataUrl);
            showToast('📷 スクリーンショットを保存しました');
        } else {
            throw new Error(response.error);
        }
    } catch (err) {
        showToast('スクリーンショットに失敗しました', 'error');
    } finally {
        screenshotBtn.disabled = false;
    }
});

// ========================================
// Clear All
// ========================================
clearBtn.addEventListener('click', async () => {
    if (gallery.children.length === 0) return;
    if (confirm('すべての画像を削除しますか？')) {
        await clearAllImages();
        gallery.innerHTML = '';
        updateEmptyState();
        updateTagFilterBar();
        showToast('🗑️ すべての画像を削除しました');
    }
});

// ========================================
// Drag & Drop
// ========================================
function handleDragOver(e) {
    e.preventDefault();
    pasteZone.classList.add('drag-over');
}
function handleDragLeave(e) {
    e.preventDefault();
    pasteZone.classList.remove('drag-over');
}
async function handleDrop(e) {
    e.preventDefault();
    pasteZone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = async (event) => await addImageToGallery(event.target.result);
                reader.readAsDataURL(file);
                return;
            }
        }
    }
    showToast('画像ファイルをドロップしてください', 'error');
}

document.addEventListener('paste', handlePaste);
pasteZone.addEventListener('click', () => pasteZone.focus());
pasteZone.addEventListener('dragover', handleDragOver);
pasteZone.addEventListener('dragleave', handleDragLeave);
pasteZone.addEventListener('drop', handleDrop);
document.body.addEventListener('dragover', handleDragOver);
document.body.addEventListener('dragleave', handleDragLeave);
document.body.addEventListener('drop', handleDrop);

// ========================================
// ショートカットからのスクショ処理
// ========================================
async function checkPendingScreenshot() {
    const result = await chrome.storage.local.get(['pendingScreenshot']);
    if (result.pendingScreenshot) {
        const { dataUrl, timestamp } = result.pendingScreenshot;
        // 10秒以内のスクショのみ処理
        if (Date.now() - timestamp < 10000) {
            await addImageToGallery(dataUrl);
            showToast('📷 ショートカットでスクショを保存しました');
        }
        await chrome.storage.local.remove(['pendingScreenshot']);
    }
}

// ========================================
// Initialize
// ========================================
(async () => {
    await initDB();
    await renderGallery();
    await updateTagFilterBar();
    await checkPendingScreenshot();
    pasteZone.focus();
})();
