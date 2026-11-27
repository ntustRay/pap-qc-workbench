# PAP 品管工作台

## 維護入口

- `dist/` 是納入版控的靜態網站原始檔。畫面操作在 `dist/app.js`，資料配對及統計在 `dist/domain/engine.js`，CSV 和 XLSX 在 `dist/io/`。
- 專業規則以 `dist/config/rules.json` 表示。維持規則的宣告式格式和既有案件的規則快照。修改規則或指標後，同步審核表與規則文件。[規則維護](docs/RULES.md)
- 測試與文件使用合成個案。保持個案匯入、運算和明細留在瀏覽器。

## 驗證

- 使用 Node.js 22+，跑 `npm test` 檢查腳本與領域測試，以 `npm start` 預覽靜態站。
- 改動原始檔或規則後，跑 `npm run bundle` 重新產生獨立離線版。確認虛構示範資料可在離線頁完成匯入、比對和匯出。[發布與驗收](docs/DEPLOY.md)
