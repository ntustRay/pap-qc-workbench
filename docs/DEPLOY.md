# 發布純靜態網站

## 任一靜態主機

1. 解壓縮原始碼 ZIP。
2. 檢查 `dist/config/rules.json` 已更新至要發布的規則。
3. 將 `dist` 設為發布目錄，或把 `dist` 內全部檔案上傳至網站目錄。
4. 確認 `index.html`、`app.js`、`styles.css`、`domain`、`io`、`config`、`samples` 均完整。
5. 開啟網站，使用虛構示範資料驗證。不要將實際醫療資料放入 Git repository 或網站檔案。

沒有 Build command；不需要 API key、資料庫、Node server 或環境變數。`scripts/serve.mjs` 只是開發預覽，正式網站只需提供靜態檔案。

## GitHub Pages

1. 在你的 GitHub 建立 repository。
2. 將 `dist` 裡面的檔案上傳至 repository 根目錄（不要再包一層 `dist`）。專業維護文件可一併上傳。
3. 在根目錄新增空白 `.nojekyll`。
4. 到 Settings → Pages，選擇 Deploy from a branch，分支 main、資料夾 `/ (root)`。
5. 等待 Pages 部署完成，用提供的 URL 開啟。

網站採相對路徑，可放在 `https://帳號.github.io/repository/`。後續更新規則只需更新根目錄的 `config/rules.json` 並重新發布。

## 院內離線環境

1. 使用支援 ES modules、Web Worker 與 DecompressionStream 的新版 Chrome／Edge。
2. 可由院內靜態 Web server 提供 `dist`。不用外網或 CDN。
3. 無 Web server 時，直接雙擊 `pap-qc-offline.html`。它包含程式、規則與示範資料。
4. 規則更新後執行 `node scripts/bundle.mjs`，重新分發離線 HTML。
5. 瀏覽器可能限制離線檔的 Web Storage；請以匯出規則及 CSV 備份。

## 發布前驗收

1. `node scripts/check.mjs` 通過。
2. 以單位的去識別測試案例核對公式、代碼、時間窗及矩陣。
3. 記錄專業覆核版本；此工具沒有使用者權限、電子簽章或不可竄改的稽核紀錄。
4. 驗證上傳檔案後沒有對外傳輸資料的程式。此專案只對同站讀取靜態規則與虛構範例。
5. 實測匯入、搜尋、明細、CSV、列印及紀錄保存。舊版 `.xls` 不支援，先另存 `.xlsx`。
