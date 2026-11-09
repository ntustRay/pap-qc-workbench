export function parseDelimited(text, delimiter) {
  text = text.replace(/^\uFEFF/, "");
  if (!delimiter) delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows = []; let row = [], field = "", quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field.length || closed) throw new Error("CSV 引號格式錯誤，請重新由 Excel 匯出 UTF-8 CSV。");
      quoted = true;
    } else if (char === delimiter) { row.push(field); field = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field); if (row.some(v => v.trim())) rows.push(row);
      row = []; field = ""; closed = false;
    } else {
      if (closed && char.trim()) throw new Error("CSV 引號後出現非分隔字元。");
      if (!closed) field += char;
    }
  }
  if (quoted) throw new Error("CSV 引號未關閉，請檢查檔案。");
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function tabularRows(matrix) {
  if (!matrix.length) throw new Error("工作表沒有資料。");
  const headers = matrix[0].map(v => String(v ?? "").trim());
  if (!headers.length || headers.some(v => !v) || new Set(headers.map(v=>v.normalize("NFKC").toUpperCase())).size !== headers.length) throw new Error("第一列必須是非空白且不重複的欄位名稱，請移除空欄或合併標題。");
  const rows = matrix.slice(1).filter(row => row.some(v => String(v ?? "").trim())).map((row,index) => {
    if (row.length > headers.length && row.slice(headers.length).some(v=>String(v??"").trim())) throw new Error(`第 ${index+2} 列超出欄位數，請確認分隔字元及引號。`);
    return Object.fromEntries(headers.map((header,index)=>[header,String(row[index] ?? "")]));
  });
  if (!rows.length) throw new Error("檔案只有欄位名稱，沒有資料列。");
  if (rows.length > 100000) throw new Error("單一工作表上限 100,000 列，請分批匯入。");
  return {headers,rows};
}
export function toCsv(headers, rows) {
  const escape = value => {
    let text = String(value ?? "");
    // Neutralize spreadsheet formulas, including control/whitespace prefixes.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  return "\uFEFF" + [headers,...rows].map(row=>row.map(escape).join(",")).join("\r\n");
}
