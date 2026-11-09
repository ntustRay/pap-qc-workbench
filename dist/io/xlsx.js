import { parseDelimited, tabularRows } from "./csv.js";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", {fatal:true});
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
const elements = (node, name) => Array.from(node.getElementsByTagNameNS("*", name));
function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("不支援含外部實體的 Excel XML。");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (elements(doc,"parsererror").length) throw new Error("Excel XML 格式損壞。");
  return doc;
}
export async function unzipEntries(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i,true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("不是有效的 .xlsx 檔案；舊版 .xls 請另存為 .xlsx。");
  if (view.getUint16(end + 4,true) || view.getUint16(end + 6,true)) throw new Error("不支援分段 Excel 檔。");
  const count = view.getUint16(end + 10,true);
  if (count > 2000 || count === 65535) throw new Error("Excel 結構過大或使用不支援的 ZIP64 格式。");
  let offset = view.getUint32(end + 16,true), expanded = 0;
  const entries = new Map();
  for (let i=0;i<count;i++) {
    if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw new Error("Excel ZIP 索引損壞。");
    const flags = view.getUint16(offset + 8,true), method = view.getUint16(offset + 10,true), checksum = view.getUint32(offset + 16,true);
    const size = view.getUint32(offset + 20,true), originalSize = view.getUint32(offset + 24,true);
    const nameLength = view.getUint16(offset + 28,true), extra = view.getUint16(offset + 30,true), comment = view.getUint16(offset + 32,true);
    const local = view.getUint32(offset + 42,true);
    if (offset + 46 + nameLength + extra + comment > end) throw new Error("Excel ZIP 檔名索引損壞。");
    const name = decoder.decode(bytes.subarray(offset + 46,offset + 46 + nameLength));
    offset += 46 + nameLength + extra + comment;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    if (flags & 1) throw new Error("無法讀取加密 Excel；請先移除密碼。");
    if (![0,8].includes(method)) throw new Error("不支援的 Excel 壓縮格式。");
    expanded += originalSize;
    if (expanded > MAX_EXPANDED || originalSize > 32 * 1024 * 1024) throw new Error("Excel 解壓縮後過大，請分批匯入。");
    if (local + 30 > bytes.length || view.getUint32(local,true) !== 0x04034b50) throw new Error("Excel ZIP 資料損壞。");
    const start = local + 30 + view.getUint16(local + 26,true) + view.getUint16(local + 28,true);
    if (start + size > bytes.length) throw new Error("Excel 檔案不完整。");
    if (entries.has(name)) throw new Error("Excel 包含重複的工作表檔案。");
    entries.set(name,{method,originalSize,crc:checksum,bytes:bytes.subarray(start,start+size)});
  }
  return entries;
}
async function readEntry(entries,name) {
  const entry = entries.get(name);
  if (!entry) return null;
  let data = entry.bytes;
  if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("此瀏覽器不支援 Excel 解壓縮，請使用新版 Chrome、Edge，或匯入 CSV。");
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks=[]; let length=0;
    while (true) {
      const {done,value}=await reader.read(); if(done) break;
      length+=value.length;
      if(length > entry.originalSize || length > 32*1024*1024) { await reader.cancel(); throw new Error("Excel 解壓縮大小異常。"); }
      chunks.push(value);
    }
    data = new Uint8Array(length); let offset=0;
    for(const chunk of chunks) {data.set(chunk,offset);offset+=chunk.length;}
  }
  if(data.length !== entry.originalSize) throw new Error("Excel 解壓縮長度不符。");
  if(crc32(data)!==entry.crc) throw new Error("Excel 檔案校驗失敗，請重新匯出來源檔案。");
  return decoder.decode(data);
}
const combinedText = node => elements(node,"t").map(t=>t.textContent??"").join("");
function columnIndex(reference) {
  const letters=reference.match(/^[A-Z]+/)?.[0];
  if(!letters) throw new Error("Excel 儲存格座標無效。");
  let index=0; for(const c of letters) index=index*26+c.charCodeAt(0)-64;
  if(index>500) throw new Error("Excel 欄位過多，請移除不必要的欄位（上限 500 欄）。");
  return index-1;
}
function excelDate(value,date1904) {
  const days=Number(value);
  if(!Number.isFinite(days) || (!date1904 && Math.floor(days)===60)) return value;
  const epoch=Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30);
  const adjusted=!date1904&&days<60?days+1:days;
  const date=new Date(epoch+Math.floor(adjusted)*86400000);
  return Number.isNaN(date.getTime())?value:date.toISOString().slice(0,10);
}
export async function readXlsx(buffer) {
  const entries=await unzipEntries(buffer);
  const workbookText=await readEntry(entries,"xl/workbook.xml"),relsText=await readEntry(entries,"xl/_rels/workbook.xml.rels");
  if(!workbookText||!relsText) throw new Error("Excel 缺少活頁簿資料。");
  const workbook=xml(workbookText),rels=xml(relsText);
  const date1904=["1","true"].includes(elements(workbook,"workbookPr")[0]?.getAttribute("date1904"));
  const relationships=new Map(elements(rels,"Relationship").filter(r=>r.getAttribute("TargetMode")!=="External").map(r=>{
    const target=r.getAttribute("Target")??"";
    const clean=target.startsWith("/")?target.slice(1):`xl/${target.replace(/^\.\//,"")}`;
    return[r.getAttribute("Id"),clean];
  }));
  const sharedText=await readEntry(entries,"xl/sharedStrings.xml");
  const shared=sharedText?elements(xml(sharedText),"si").map(combinedText):[];
  const stylesText=await readEntry(entries,"xl/styles.xml");
  let formats=[];
  if(stylesText) {
    const styles=xml(stylesText),custom=new Map(elements(styles,"numFmt").map(f=>[Number(f.getAttribute("numFmtId")),f.getAttribute("formatCode")??""]));
    const xfs=elements(styles,"cellXfs")[0];
    formats=xfs?elements(xfs,"xf").map(f=>{
      const id=Number(f.getAttribute("numFmtId"));
      const pattern=(custom.get(id)??"").replace(/"[^"]*"|\[[^\]]*\]|\\./g,"");
      return {date:(id>=14&&id<=22)||(id>=45&&id<=47)||/[yd]/i.test(pattern),padding:/^0{2,}$/.test(pattern)?pattern.length:0};
    }):[];
  }
  const sheets=[];let formulas=0;
  const sheetDefinitions=elements(workbook,"sheet");
  if(sheetDefinitions.length>30) throw new Error("工作表上限 30 頁，請保留需要的分頁。");
  for(const sheet of sheetDefinitions) {
    const relId=sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")??sheet.getAttribute("r:id");
    const target=relationships.get(relId);
    if(!target||!/^xl\/worksheets\/[^/]+\.xml$/.test(target)) continue;
    const dataText=await readEntry(entries,target);if(!dataText) continue;
    const data=xml(dataText),matrix=[];
    const rows=elements(data,"row");
    if(rows.length>100001) throw new Error("單一工作表上限 100,000 筆資料。");
    for(const row of rows) {
      const values=[];
      for(const cell of elements(row,"c")) {
        const index=columnIndex(cell.getAttribute("r")??"");
        const type=cell.getAttribute("t"),raw=elements(cell,"v")[0]?.textContent??"";
        if(elements(cell,"f").length) formulas++;
        let value=raw;
        if(type==="s") value=shared[Number(raw)]??"";
        else if(type==="inlineStr") value=combinedText(cell);
        else if(type==="d") value=raw.slice(0,10);
        else if(type==="e") value="";
        else if((!type||type==="n")&&raw){
          const format=formats[Number(cell.getAttribute("s")??0)];
          if(format?.date)value=excelDate(raw,date1904);
          else if(format?.padding&&/^\d+$/.test(raw))value=raw.padStart(format.padding,"0");
        }
        values[index]=value;
      }
      if(values.some(v=>String(v??"").trim())) matrix.push(Array.from({length:values.length},(_,i)=>values[i]??""));
    }
    if(matrix.length) sheets.push({name:sheet.getAttribute("name")??"工作表",matrix});
  }
  if(!sheets.length) throw new Error("Excel 沒有可讀取的工作表。");
  return {sheets,warnings:formulas?["Excel 公式使用檔案內已儲存的結果；本工具不重新計算公式。"]:[]};
}
export async function readSourceFile(file,encoding="utf-8") {
  if(file.size>MAX_BYTES) throw new Error("單一檔案上限 25 MB，請分批匯入。");
  const extension=file.name.split(".").pop().toLowerCase();
  let workbook;
  if(extension==="xlsx") workbook=await readXlsx(await file.arrayBuffer());
  else if(["csv","tsv","txt"].includes(extension)) {
    let text;
    try{text=new TextDecoder(encoding,{fatal:true}).decode(await file.arrayBuffer());}
    catch{throw new Error("文字編碼無法讀取；請切換 Big5，或在 Excel 另存 UTF-8 CSV。");}
    workbook={sheets:[{name:"資料",matrix:parseDelimited(text,extension==="tsv"?"\t":undefined)}],warnings:[]};
  } else throw new Error("請匯入 .xlsx、.csv 或 .tsv；舊版 .xls 請先另存為 .xlsx。");
  return {...workbook,filename:file.name};
}
export function selectSheet(workbook,name) {
  const sheet=workbook.sheets.find(s=>s.name===name)??workbook.sheets[0];
  return {...tabularRows(sheet.matrix),filename:workbook.filename,sheet:sheet.name};
}
