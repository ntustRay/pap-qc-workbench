# PAP 品管工作台

[開啟網站](https://ntustray.github.io/pap-qc-workbench/) · [離線版](https://ntustray.github.io/pap-qc-workbench/offline.html) · [下載原始碼 ZIP](https://github.com/ntustRay/pap-qc-workbench/archive/refs/heads/main.zip)

純靜態的 PAS 抹片 × PATH 組織切片比對工具。HTML、CSS、ES modules；無後端、無資料庫服務、無執行期套件及第三方 CDN。資料在瀏覽器運算，預設不保存個案。

## 使用

1. 開啟網站，按「載入示範資料」。示範個案均為虛構。
2. 確認 PAS／PATH 欄位對應與資料完整截止日，按「開始本機比對」。
3. 查看資料檢查紀錄、個案明細與五個報告章節。
4. 匯出 CSV，或「列印／另存 PDF」。預設遮蔽姓名與完整識別碼；檢體編號與日期仍保留。

**專業規則目前為示範草稿。** 抹片代碼參考衛福部 Health-54（2026-07-28）。院內 PATH 代碼、追蹤期限、指標與判定矩陣須經專業人員覆核。本工具依啟用的規則版本計算，非官方認證報表。

## 非工程師修改規則

1. 開啟「專業規則」。
2. 用表單修改配對日期、追蹤月數、部位、診斷分類、判定矩陣或指標的分子／分母。
3. 更新版本，用去識別資料驗證；填寫覆核者、日期與狀態。
4. 「套用至此瀏覽器」供本機試算。舊工作保留原來規則快照。
5. 「匯出規則」產生 `rules.json`。維護者將它替換 `dist/config/rules.json`，重新發布靜態網站。

規則檔不包含 JavaScript 或可執行公式。JSON 的條件只能選用已定義的計數方式。完整操作見 [專業規則維護說明](docs/RULES.md)。

## 專業邏輯與 UI 邏輯分離

| 檔案 | 責任 | 修改對象 |
| --- | --- | --- |
| `dist/config/rules.json` | 診斷代碼、配對條件、矩陣、統計定義、覆核版本 | 專業人員透過網頁表單編輯 |
| `dist/domain/engine.js` | 日期、驗證、去重、索引配對與宣告式規則運算；不依賴 DOM、storage、network | 工程師 |
| `dist/domain/worker.js` | 在 Web Worker 執行 domain engine，避免比對時卡住 UI | 工程師 |
| `dist/io/csv.js`、`xlsx.js` | 檔案讀寫、Excel 解壓縮與 CSV 匯出 | 工程師 |
| `dist/app.js` | 畫面、操作、搜尋、分頁、規則表單、瀏覽器紀錄 | 工程師 |
| `dist/styles.css` | 視覺、RWD、列印樣式 | 工程師 |

## 本機執行與測試

需要 Node.js 22+ 或 Bun；**不需要 npm install**。

```sh
node scripts/serve.mjs
# http://127.0.0.1:5175

node scripts/check.mjs
# 語法檢查及 domain / CSV / ZIP 測試

node scripts/bundle.mjs
# artifacts/pap-qc-offline.html
```

`dist/index.html` 使用 ES modules，請透過 HTTP 開啟。單一離線版 `pap-qc-offline.html` 可直接雙擊開啟，內嵌規則、示範資料與 Worker，不需要網路。本機自訂規則與網站規則為不同儲存位置；瀏覽器可能限制 file:// 的本機儲存，仍可匯出檔案備份。修改原始碼或規則後，須重新執行 bundle 才會更新離線版。

## 發布

完整發布步驟見 [DEPLOY.md](docs/DEPLOY.md)。任何能提供靜態檔案的主機都能使用，包括 GitHub Pages、Cloudflare Pages、Netlify、Vercel 或院內 Web server。

1. 將 `dist` 目錄內容作為網站根目錄，保留 `domain`、`io`、`config`、`samples` 子目錄。
2. 不需要 Build command、API key 或後端服務。
3. 子路徑部署使用相對 URL，無須調整 base URL。

## 邊界與資料規則

- 支援 `.xlsx`、`.csv`、`.tsv`、`.txt`；舊版 `.xls` 請另存 `.xlsx`。Excel 公式讀取已儲存的 cached value，不重新計算。
- 單檔最多 25 MB、工作表最多 100,000 列、500 欄；Excel 最多 30 個工作表，解壓縮總量 64 MB。只使用選定工作表，不跨頁合併。
- 接受西元／民國日期；期間按日曆月計算並含截止當日。錯誤日期不滾動到其他月份。
- 以每筆有效 PAS 為統計單位，不是每人。同一切片可能配對同一個案的不同抹片；不進行模糊姓名比對。
- 同個案同檢體編號完全重複只取一次；內容衝突全部排除。未知診斷列為未分類，品質空白不列入品質分母。
- 所有統計分母為零時顯示 `—`。未期滿個案不列入「期滿異常個案切片配對率」分母。
- 清冊按採檢日期列出全部部位；品質統計則採規則的配對日期、期限及部位，兩者刻意分開。
- Web Storage 只儲存明確選擇保存的結果與套用的規則，最多 10 筆工作。容量不足會提示，不宣稱保存成功。
- 預設遮蔽姓名與完整識別碼，但不表示完全去識別。註記、檢體編號、日期仍可能含個資，匯出及共用須依單位規範。
- 列印輸出為五個章節；資料多時章節可能跨多張紙。長報表建議橫式或縮小列印比例。

## 來源與授權範圍

- 抹片譯碼參考：https://www.mohw.gov.tw/dl-95586-62183e9f-1f49-45ea-a447-7b88b2c0237b.html

網站內容與專業規則的正式適用範圍，由發布者及專業覆核人員確認。
