// サイドパネルをアイコンクリックで開く
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// ========================================
// キーボードショートカット処理
// ========================================
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'take-screenshot') {
        try {
            // スクリーンショット撮影
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

            // chrome.storageに一時保存（サイドパネルで取得する用）
            await chrome.storage.local.set({
                pendingScreenshot: {
                    dataUrl,
                    timestamp: Date.now()
                }
            });

            // 通知を表示（サイドパネルを開くよう促す）
            // 注意: chrome.sidePanel.open() はユーザージェスチャーが必要なため使用不可
            console.log('Screenshot saved to storage. Open side panel to view.');

        } catch (error) {
            console.error('Screenshot error:', error);
        }
    }
});

// ========================================
// スクリーンショット撮影のメッセージハンドラ
// ========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                try {
                    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                    sendResponse({ success: true, dataUrl });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            } else {
                sendResponse({ success: false, error: 'No active tab' });
            }
        });
        return true; // 非同期レスポンスを示す
    }
});
