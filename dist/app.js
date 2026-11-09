import {analyze,validateRules,inferMapping,requiredFields,FIELD_LABELS,FILTERS,OUTCOMES,normalizeText,parseDate} from "./domain/engine.js";
import {parseDelimited,tabularRows,toCsv} from "./io/csv.js";
import {readSourceFile,selectSheet} from "./io/xlsx.js";

const $ = selector => document.querySelector(selector);
const e = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const count = value => Number(value).toLocaleString("zh-TW");
const ICONS={
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  file:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 12h8M8 16h6"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m14 18 3 3 5-7"/>',
  report:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 17v-3m3 3v-6m3 6v-4"/>',
  list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  sliders:'<path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h11m4 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 1-1 1-1 3m0 3h.01"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  print:'<path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.01"/>',
  alert:'<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
};
const icon = (name,size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]??ICONS.file}</svg>`;
const VIEW_NAMES={import:"建立比對",results:"比對結果",report:"完整報告",registry:"個案清冊",rules:"專業規則",history:"工作紀錄",help:"操作說明"};
const PAGE_SIZE=20, HISTORY_KEY="papqc.history.v1",RULE_KEY="papqc.rules.v1";
const state={view:"import",rules:null,defaults:null,ruleDraft:null,ruleTab:"matching",files:{pas:null,path:null},workbooks:{pas:null,path:null},options:{cutoff:localDate(),registryMonths:6,institution:"",persist:false},result:null,history:[],masked:true,q:"",filter:"all",page:1,reportPage:0,busy:false,dirty:false,error:"",storageAvailable:true};
let toastTimer;
function toast(message,error=false){const node=$("#toast");node.textContent=message;node.dataset.error=String(error);node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,5500);}
function safeLoad(key,fallback){try{return JSON.parse(localStorage.getItem(key)??"null")??fallback;}catch{return fallback;}}
function storeRules(){try{localStorage.setItem(RULE_KEY,JSON.stringify(state.rules));return true;}catch{toast("規則已套用；瀏覽器拒絕保存，請匯出規則備份。",true);return false;}}
function download(filename,content,type="text/csv;charset=utf-8"){
  const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement("a");link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const badge=(text,type="")=>`<span class="badge ${e(type)}">${e(text)}</span>`;
function profileBadge(rules=state.rules){return rules.profile.status==="reviewed"?badge("已記錄專業覆核","success"):badge("示範規則・待覆核","warn");}
function heading(title,description,actions=""){return `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:""}</div>`;}
function ruleNotice(rules=state.rules){return rules.profile.status!=="reviewed"?`<div class="notice warn no-print">${icon("alert",16)}<span>目前使用示範規則。診斷分類、追蹤期限與統計定義，請由單位專業人員覆核。<a href="#rules">檢視規則</a></span></div>`:"";}
function maskedId(value){if(!state.masked)return value;return value.length<=4?"••••":`${value.slice(0,2)}••••${value.slice(-2)}`;}
function personName(value){return state.masked?(value?`${value.slice(0,1)}○○`:"未提供姓名"):(value||"未提供姓名");}
function labelFor(group,rules=state.result?.rules??state.rules,type="smear"){return rules[type==="smear"?"smearGroups":"tissueGroups"].find(g=>g.id===group)?.label??"未分類";}
const reviewLabels={pending:"未複核",confirmed:"已確認",reread:"待重閱"};
function render(){
  if(!state.rules)return;
  for(const a of document.querySelectorAll("[data-view]")){const active=a.dataset.view===state.view;a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");}
  $("#current-view").textContent=VIEW_NAMES[state.view];
  $("#footer-version").textContent=state.rules.profile.version;
  $("#result-count").textContent=state.result?count(state.result.totals.pas):"";$("#result-count").hidden=!state.result;
  const pages={import:renderImport,results:renderResults,registry:renderRegistry,report:renderReport,rules:renderRules,history:renderHistory,help:renderHelp};
  $("#main").innerHTML=pages[state.view]();
  if(state.view==="help"&&!$("#embedded-rules")){
    const paragraph=document.createElement("p"),link=document.createElement("a");link.href="./offline.html";link.download="pap-qc-offline.html";link.textContent="下載可直接開啟的離線 HTML";paragraph.append(link);$("#main").append(paragraph);
  }
}
function navigate(view){
  if(state.view==="rules")captureDraft();
  state.view=Object.hasOwn(VIEW_NAMES,view)?view:"import";state.q="";state.filter="all";state.page=1;
  render();window.scrollTo({top:0,behavior:"instant"});$("#main").focus({preventScroll:true});
}
function sourceCard(kind){
  const file=state.files[kind],book=state.workbooks[kind],label=kind==="pas"?"抹片資料":"切片資料";
  return `<section class="upload-card"><div class="source-title"><span class="source-label">${kind.toUpperCase()}</span><strong>${label}</strong><span class="required">必要</span></div><label class="dropzone ${file?"ready":""}" data-drop="${kind}" for="file-${kind}"><span class="upload-icon">${icon(file?"check":"upload",22)}</span><strong>${file?e(file.filename):"拖曳檔案至此"}</strong><small>${file?`${count(file.rows.length)} 筆資料・${count(file.headers.length)} 個欄位`:"Excel .xlsx ／ CSV ／ TSV"}</small><span class="choose-file">${icon(file?"file":"plus",13)}${file?"更換檔案":"選擇檔案"}</span><input class="hidden-file" type="file" id="file-${kind}" data-file="${kind}" accept=".xlsx,.csv,.tsv,.txt" aria-label="選擇 ${kind.toUpperCase()} ${label}"></label><div class="source-foot"><span>${kind==="pas"?"採檢日期取自資料欄位":"請涵蓋完整追蹤期間"}</span>${file?`<button type="button" data-action="remove-file" data-kind="${kind}">移除</button>`:"<span>上限 25 MB</span>"}</div>${book?.sheets.length>1?`<label class="field sheet-select"><span>選擇工作表</span><select data-sheet="${kind}" aria-label="${kind.toUpperCase()} 工作表">${book.sheets.map(s=>`<option ${s.name===file?.sheet?"selected":""}>${e(s.name)}</option>`).join("")}</select></label>`:""}${book?.warnings?.length?`<div class="notice warn compact">${e(book.warnings.join(" "))}</div>`:""}</section>`;
}
function mappingSection(){return `<details class="details-section" ${state.files.pas||state.files.path?"open":""}><summary>欄位對應與文字編碼${state.files.pas||state.files.path?"・請確認自動對應結果":""}</summary><div class="panel-body"><p class="mapping-help">以識別碼配對，不以姓名猜測。無法自動辨識的欄位可在此選擇；必要欄位標示 *。</p><div class="mapping-grid">${["pas","path"].map(kind=>`<section><h3>${kind.toUpperCase()} 欄位</h3>${state.files[kind]?Object.keys(state.rules.columns[kind]).map(field=>`<label class="mapping-row"><span>${e(FIELD_LABELS[field]??field)}${requiredFields(kind,state.rules).includes(field)?" *":""}</span><select data-map-kind="${kind}" data-map-field="${e(field)}" aria-label="${kind.toUpperCase()} ${e(FIELD_LABELS[field]??field)}欄位"><option value="">未對應</option>${state.files[kind].headers.map(header=>`<option value="${e(header)}" ${state.files[kind].mapping[field]===header?"selected":""}>${e(header)}</option>`).join("")}</select></label>`).join(""):`<p class="mapping-help">請先選擇來源檔案。</p>`}</section>`).join("")}</div><label class="field"><span>CSV／TSV 文字編碼（選擇後重新匯入檔案）</span><select id="text-encoding"><option value="utf-8" ${state.encoding!=="big5"?"selected":""}>UTF-8（建議）</option><option value="big5" ${state.encoding==="big5"?"selected":""}>Big5（舊版繁體中文）</option></select></label></div></details>`;}
function readyToRun(){return !state.busy&&["pas","path"].every(kind=>state.files[kind]&&requiredFields(kind,state.rules).every(field=>state.files[kind].mapping[field]));}
function renderImport(){
  const picked=Number(!!state.files.pas)+Number(!!state.files.path),r=state.rules;
  return heading("建立抹切比對","匯入 PAS 與 PATH，開始本期的子宮頸抹片品質檢核。",`<button class="secondary" data-action="demo">${icon("grid",15)}載入示範資料</button>`)+`<div class="notice">${icon("shield",17)}<span>來源檔案與比對運算留在此瀏覽器。預設不保存個案資料，關閉頁面即清除。</span></div><div class="workflow" aria-label="比對流程"><div class="workflow-step current"><span class="step-number">1</span><div><strong>匯入來源資料</strong><small>選擇檔案與確認欄位</small></div></div><div class="workflow-step"><span class="step-number">2</span><div><strong>核對比對結果</strong><small>檢查資料與追蹤狀態</small></div></div><div class="workflow-step"><span class="step-number">3</span><div><strong>匯出報告與清冊</strong><small>保存統計與核對紀錄</small></div></div></div><div class="import-layout"><div><section class="panel"><div class="panel-head"><h2>來源資料</h2><span>${picked} / 2 個檔案已就緒</span></div><div class="upload-grid">${sourceCard("pas")}${sourceCard("path")}</div>${mappingSection()}</section><section class="panel"><div class="panel-head"><h2>本次比對設定</h2><span>日期與報告資訊</span></div><div class="panel-body"><div class="form-grid"><label class="field"><span>資料完整截止日 *</span><input type="date" id="cutoff" value="${e(state.options.cutoff)}" required><small>請填寫資料已完整收集至哪一天，用來判斷追蹤是否期滿。</small></label><label class="field"><span>個案清冊期間</span><select id="registry-months"><option value="6" ${state.options.registryMonths===6?"selected":""}>抹片日起 6 個月</option><option value="12" ${state.options.registryMonths===12?"selected":""}>抹片日起 12 個月</option><option value="all" ${state.options.registryMonths===null?"selected":""}>抹片日起至截止日</option></select><small>清冊包含全部部位；品質統計依規則固定 ${r.matching.windowMonths} 個月。</small></label><label class="field full"><span>報告機構名稱</span><input id="institution" maxlength="120" placeholder="例如：病理科／細胞診斷單位" value="${e(state.options.institution)}"><small>報告起訖日依有效 PAS 採檢日期產生，檔名不作為篩選條件。</small></label></div>${state.error?`<div class="notice error compact" role="alert">${icon("alert",16)}<span>${e(state.error)}</span></div>`:""}</div><div class="import-bottom"><label class="checkbox-line"><input type="checkbox" id="persist-results" ${state.options.persist?"checked":""}><span>將結果保存至此瀏覽器的工作紀錄<small class="table-sub">包含個案識別碼、姓名及核對註記，最多 10 筆；不保存原始檔。</small></span></label><div><button class="primary" data-action="run" ${readyToRun()?"":"disabled"}>${state.busy?'<span class="busy-indicator"></span>本機比對中…':`開始本機比對${icon("arrow",17)}`}</button><div class="button-help">${state.busy?"正在比對，請稍候":picked<2?`還需選擇 ${2-picked} 個來源檔案`:readyToRun()?"資料就緒，請確認截止日後執行":"請完成必要欄位對應"}</div></div></div></section></div><aside class="import-aside"><section class="rule-card"><div class="aside-title">${icon("sliders",16)}　本次使用規則</div>${profileBadge()}<p class="rule-name">${e(r.profile.name)}</p><dl class="rule-details"><div><dt>規則版本</dt><dd>${e(r.profile.version)}</dd></div><div><dt>品質追蹤期間</dt><dd>${r.matching.windowMonths} 個日曆月</dd></div><div><dt>多筆切片選擇</dt><dd>${r.matching.selection==="earliest"?"最早符合條件":"依自訂優先序"}</dd></div><div><dt>配對依據</dt><dd>識別碼 + ${r.matching.dateField==="sampleDate"?"採檢日":"報告日"}</dd></div></dl><a href="#rules">檢視與編輯專業規則${icon("arrow",15)}</a></section><section class="side-note"><h3>第一次使用？</h3><ol><li>先載入示範資料，確認流程。</li><li>由專業人員確認規則。</li><li>匯入實際資料並核對欄位。</li></ol><button class="text-button" data-action="templates">${icon("download",14)}下載 CSV 欄位範本</button><p>範本與示範資料均使用虛構個案。</p></section></aside></div>`;
}
function empty(title,copy){return `<section class="empty-state"><span>${icon("report",42)}</span><h2>${e(title)}</h2><p>${e(copy)}</p><div class="empty-actions"><a href="#import" class="button-primary">建立比對</a><button class="secondary" data-action="demo-run">載入示範並比對</button></div></section>`;}
function summaryBox(label,value,foot="",alert=false){return `<section class="summary-box ${alert?"alert":""}"><div class="summary-label">${e(label)}</div><div class="summary-value">${e(value)}</div><div class="summary-foot">${e(foot)}</div></section>`;}
function resultSummary(){const t=state.result.totals;return `<div class="summary-grid">${summaryBox("有效抹片",count(t.pas),`有效切片 ${count(t.path)} 筆`)}${summaryBox("完成切片配對",count(t.matched),`${state.result.rules.matching.windowMonths} 個月內・符合部位`)}${summaryBox("未配對",count(t.unmatched),"包含未期滿與已期滿個案")}${summaryBox("分類差異",count(t.discordant),`另有 ${count(t.pending)} 筆待專業判定`,t.discordant>0)}</div>`;}
function filteredCases(){
  const query=state.q.toLocaleLowerCase();return state.result.cases.filter(c=>{
    const searchable=[c.smear.sampleId,c.smear.diagnosis,labelFor(c.smear.group),maskedId(c.smear.personId),personName(c.smear.name),c.selected?.sampleId??"",c.selected?.diagnosis??""].join(" ").toLocaleLowerCase();
    if(query&&!searchable.includes(query))return false;
    switch(state.filter){case"matched":return !!c.selected;case"unmatched":return !c.selected;case"overdue":return !c.selected&&c.mature;case"immature":return !c.mature;case"discordant":return c.outcome==="discordant";case"review":return ["review","unclassified"].includes(c.outcome);case"pending":return c.reviewStatus==="pending";default:return true;}
  });
}
function resultToolbar(registry=false){return `<div class="toolbar"><div class="toolbar-left"><input id="case-search" type="search" placeholder="搜尋檢體編號、診斷或顯示中的個案" aria-label="搜尋個案" value="${e(state.q)}"><select id="case-filter" aria-label="篩選比對狀態">${[["all","全部個案"],["matched","已配對"],["unmatched","未配對"],["overdue","已期滿未配對"],["immature","追蹤尚未期滿"],["discordant","分類差異"],["review","待專業判定"],["pending","尚未複核"]].map(([value,label])=>`<option value="${value}" ${state.filter===value?"selected":""}>${label}</option>`).join("")}</select></div><div class="toolbar-right"><button class="secondary small" data-action="${registry?"export-registry":"export-results"}">${icon("download",14)}匯出全部 CSV</button>${registry?"":`<a href="#report" class="text-button">檢視完整報告</a>`}</div></div>`;}
function pagination(total){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));state.page=Math.min(state.page,pages);return `<div class="pagination"><span>共 ${count(total)} 筆${state.masked?"・已隱藏姓名與完整識別碼":""}</span><div class="pagination-controls"><button class="secondary small" data-action="page" data-delta="-1" ${state.page<=1?"disabled":""}>上一頁</button><span>${state.page} / ${pages}</span><button class="secondary small" data-action="page" data-delta="1" ${state.page>=pages?"disabled":""}>下一頁</button></div></div>`;}
function outcomeBadge(c){const type={concordant:"success",discordant:"error",review:"warn",unclassified:"warn",unmatched:"neutral"}[c.outcome];return badge(OUTCOMES[c.outcome],type);}
function casesTable(registry=false){
  const filtered=filteredCases().filter(c=>!registry||c.registry.length);const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));state.page=Math.min(state.page,pages);
  const page=filtered.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);
  return `<div class="panel"><div class="table-scroll"><table><thead><tr><th>個案／檢體</th><th>抹片採檢日</th><th>抹片分類</th><th>${registry?"清冊切片數":"配對切片"}</th><th>比對判定</th><th>追蹤／複核</th><th>核對</th></tr></thead><tbody>${page.length?page.map(c=>`<tr><td><strong>${e(personName(c.smear.name))}</strong><span class="table-sub">${e(maskedId(c.smear.personId))} / ${e(c.smear.sampleId||`第 ${c.smear.row} 列`)}</span></td><td class="dense-number">${e(c.smear.sampleDate)}</td><td><span class="cell-code">${e(c.smear.diagnosis)}</span>${e(c.smear.group??"未分類")}</td><td>${registry?`<strong>${c.registry.length} 筆</strong><span class="table-sub">含全部部位</span>`:c.selected?`<strong>${e(c.selected.group??"未分類")}</strong><span class="table-sub">${e(c.selected[rulesForResult().matching.dateField])} / ${e(c.selected.sampleId||"無編號")}</span>`:'<span class="table-sub">無符合條件切片</span>'}</td><td>${outcomeBadge(c)}</td><td>${badge(c.mature?"已期滿":"未期滿",c.mature?"":"info")}<span class="table-sub">${e(reviewLabels[c.reviewStatus])}</span></td><td><button class="table-link" data-action="case" data-id="${e(c.id)}">檢視明細</button></td></tr>`).join(""):'<tr><td colspan="7">沒有符合條件的個案，請調整搜尋或篩選條件。</td></tr>'}</tbody></table></div>${pagination(filtered.length)}</div>`;
}
const rulesForResult=()=>state.result.rules;
function issuesPanel(){const issues=state.result.issues;return `<details class="panel"><summary class="panel-head">資料檢查紀錄<span>${count(issues.length)} 筆提醒／排除</span></summary><div class="panel-body"><p class="section-copy">此處最多顯示 200 筆，可匯出完整檢查紀錄。排除資料不進入統計。未知代碼保留為未分類；非統計部位只列於清冊。結果使用有效 PAS ${state.result.totals.pas} 筆、PATH ${state.result.totals.path} 筆。</p><button class="secondary small" data-action="export-issues">匯出全部檢查紀錄 CSV</button><div class="issue-list"><table><thead><tr><th>來源</th><th>列號</th><th>類型</th><th>說明</th></tr></thead><tbody>${issues.length?issues.slice(0,200).map(i=>`<tr><td>${e(i.kind.toUpperCase())}</td><td>${i.row}</td><td>${badge(i.level==="error"?"排除":i.level==="warning"?"需確認":"資訊",i.level==="error"?"error":i.level==="warning"?"warn":"info")}</td><td>${e(i.message)}</td></tr>`).join(""):'<tr><td colspan="4">未發現資料格式問題；仍請逐筆確認比對結果。</td></tr>'}</tbody></table></div></div></details>`;}
function renderResults(){if(!state.result)return heading("比對結果","核對每一筆抹片的配對依據與資料品質。")+empty("尚未建立比對","匯入來源資料，或使用虛構示範資料體驗完整流程。");return heading("比對結果",`${state.result.options.institution||"本次工作"}　${state.result.period.start} 至 ${state.result.period.end}`,`<button class="secondary" data-action="save-result">${icon("clock",15)}保存工作紀錄</button>`)+ruleNotice(state.result.rules)+resultSummary()+`<p class="consistency-note">此工作使用 ${e(state.result.rules.profile.version)}；截止日 ${e(state.result.options.cutoff)}。統計以每筆有效抹片為單位，同一切片可能配對同個案的不同抹片。</p>`+resultToolbar()+`<div id="cases-region">${casesTable()}</div>`+issuesPanel();}
function renderRegistry(){if(!state.result)return heading("個案清冊","核對同一個案抹片日起的全部相關切片。")+empty("尚無個案清冊","完成比對後，可檢視所有部位的切片及匯出清冊。");return heading("個案清冊","列出有相關切片的個案；清冊期間與品質統計期間分開計算。")+`<div class="notice">${icon("list",17)}<span>清冊範圍：${state.result.options.registryMonths??"不限"}${state.result.options.registryMonths?" 個月":"（截至資料完整截止日）"}，包含全部部位。品質統計仍依 ${state.result.rules.matching.windowMonths} 個月與規則部位配對。</span></div>`+resultToolbar(true)+`<div id="cases-region">${casesTable(true)}</div>`;}
const REPORT_TITLES=["摘要與診斷分布","ASC-US / ASC-H 追蹤","AGC 與重閱紀錄","抹切交叉表","抹片診斷數量"];
function reportHeader(index){const r=state.result;return `<div class="report-header"><div><h2>${e(r.options.institution||"PAP 子宮頸抹片品質管制")}</h2><p>${e(REPORT_TITLES[index])}　${e(r.period.start)} — ${e(r.period.end)}</p></div><div class="report-meta">第 ${index+1} / 5 頁<br>截止日 ${e(r.options.cutoff)}<br>${e(r.rules.profile.version)} ${r.rules.profile.status==="reviewed"?"已記錄覆核":"示範規則・待覆核"}</div></div>`;}
function groupStats(groups){const cases=state.result.cases;return `<div class="table-scroll"><table><thead><tr><th>抹片分類</th><th class="numeric">有效抹片</th><th class="numeric">已期滿</th><th class="numeric">期滿有切片</th><th class="numeric">期滿配對率</th><th class="numeric">未期滿</th></tr></thead><tbody>${groups.map(group=>{const items=cases.filter(c=>c.smear.group===group.id),mature=items.filter(c=>c.mature),matched=mature.filter(c=>c.selected);return `<tr><td>${e(group.label)}</td><td class="numeric">${items.length}</td><td class="numeric">${mature.length}</td><td class="numeric">${matched.length}</td><td class="numeric">${mature.length?`${(matched.length/mature.length*100).toFixed(1)}%`:"—"}</td><td class="numeric">${items.length-mature.length}</td></tr>`;}).join("")}</tbody></table></div>`;}
function reportPageContent(index){const r=state.result,groups=r.rules.smearGroups;
  if(index===0)return `<div class="report-section"><h3>品質指標</h3><div class="summary-grid">${r.metrics.map(m=>summaryBox(m.label,m.value===null?"—":m.value.toFixed(m.scale==="ratio"?2:1)+(m.scale==="percent"?"%":""),`${m.numeratorCount} / ${m.denominatorCount}${m.value===null?"・分母為 0，不計算":""}`,m.alert)).join("")}</div>${r.metrics.map(m=>`<p class="section-copy"><strong>${e(m.label)}</strong>：${e(m.description||scopeDescription(m))}${m.alert?`（超過單位自訂提醒值 ${e(m.alertAbove)}）`:""}</p>`).join("")}</div><div class="report-section"><h3>抹片診斷分布</h3><div class="distribution">${[...groups,{id:null,label:"未知／未分類"}].map(g=>{const n=r.cases.filter(c=>c.smear.group===g.id).length;return `<div class="distribution-row"><span>${e(g.label)}</span><meter min="0" max="${r.totals.pas}" value="${n}" aria-label="${e(g.label)} ${n} 筆">${n}</meter><span>${n}</span></div>`;}).join("")}</div></div><div class="report-section"><h3>比對與資料品質</h3><p class="section-copy">有效抹片 ${r.totals.pas} 筆；有效切片 ${r.totals.path} 筆；完成配對 ${r.totals.matched} 筆；未配對 ${r.totals.unmatched} 筆；分類差異 ${r.totals.discordant} 筆；待專業判定或未分類 ${r.totals.pending} 筆。排除 PAS ${r.totals.rejectedPas} 列、PATH ${r.totals.rejectedPath} 列。</p></div>`;
  if(index===1)return `<div class="report-section"><h3>ASC-US / ASC-H 追蹤統計</h3><p class="section-copy">依規則中的分類 ID 計算。期滿日為抹片採檢日加 ${r.rules.matching.windowMonths} 個日曆月；截止日當天期滿即列入分母。尚未期滿的個案另列。</p>${groupStats(groups.filter(g=>["ASC-US","ASC-H"].includes(g.id)))}</div><div class="report-section"><h3>相關指標定義</h3><p class="section-copy">ASC / SIL ratio 的分子、分母由「專業規則 → 統計指標」設定。現行版本：${e(r.metrics.find(m=>m.id==="ascsil")?.description??"未設定此指標")}。分母為 0 時顯示 —。</p></div>`;
  if(index===2){const reviewed=r.cases.filter(c=>c.reviewStatus!=="pending");return `<div class="report-section"><h3>AGC / AGUS 追蹤統計</h3>${groupStats(groups.filter(g=>g.id==="AGC"))}</div><div class="report-section"><h3>人工複核與重閱紀錄</h3><p class="section-copy">已確認 ${r.cases.filter(c=>c.reviewStatus==="confirmed").length} 筆；待重閱 ${r.cases.filter(c=>c.reviewStatus==="reread").length} 筆；未複核 ${r.cases.filter(c=>c.reviewStatus==="pending").length} 筆。人工註記不會更改原始診斷與統計判定。</p><div class="table-scroll"><table><thead><tr><th>抹片編號</th><th>狀態</th><th>核對註記</th></tr></thead><tbody>${reviewed.length?reviewed.map(c=>`<tr><td>${e(c.smear.sampleId||`列 ${c.smear.row}`)}</td><td>${e(reviewLabels[c.reviewStatus])}</td><td>${e(c.note||"—")}</td></tr>`).join(""):'<tr><td colspan="3">尚無人工複核紀錄。</td></tr>'}</tbody></table></div></div>`;}
  if(index===3)return `<div class="report-section"><h3>抹片 × 組織切片</h3><p class="section-copy">僅計入已配對且兩側診斷皆已分類的抹片；每筆抹片採用一筆切片。選擇方式：${r.rules.matching.selection==="earliest"?"最早符合條件":"最高自訂優先序，優先序相同取最早"}。未分類或未配對者不填入矩陣。</p><div class="table-scroll"><table><thead><tr><th>抹片 / 切片</th>${r.rules.tissueGroups.map(g=>`<th class="numeric">${e(g.id)}</th>`).join("")}<th class="numeric">合計</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${e(g.id)}</td>${r.rules.tissueGroups.map(t=>`<td class="numeric">${r.cross[g.id][t.id]}</td>`).join("")}<td class="numeric"><strong>${Object.values(r.cross[g.id]).reduce((a,b)=>a+b,0)}</strong></td></tr>`).join("")}</tbody></table></div></div>`;
  const codes=new Map();for(const c of r.cases)codes.set(c.smear.diagnosis,(codes.get(c.smear.diagnosis)??0)+1);
  return `<div class="report-section"><h3>依原始抹片診斷代碼統計</h3><div class="table-scroll"><table><thead><tr><th>代碼</th><th>分類</th><th class="numeric">數量</th><th class="numeric">占有效抹片</th></tr></thead><tbody>${Array.from(codes.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,n])=>`<tr><td>${e(code)}</td><td>${e(groups.find(g=>g.codes.some(c=>String(c).padStart(2,"0")===code||c.toUpperCase()===code))?.label??"未分類")}</td><td class="numeric">${n}</td><td class="numeric">${(n/r.totals.pas*100).toFixed(1)}%</td></tr>`).join("")}<tr><td colspan="2"><strong>合計</strong></td><td class="numeric"><strong>${r.totals.pas}</strong></td><td class="numeric">100.0%</td></tr></tbody></table></div></div><div class="report-section"><h3>規則版本與覆核</h3><p class="section-copy">${e(r.rules.profile.notes)}<br>覆核者：${e(r.rules.profile.reviewer||"尚未記錄")}；覆核日期：${e(r.rules.profile.reviewDate||"尚未記錄")}。</p></div>`;
}
function renderReport(){if(!state.result)return heading("完整品質管制報告","統計、追蹤、交叉表及核對紀錄。")+empty("尚未產生報告","完成比對後會依實際資料產生五個報告章節，可列印或另存 PDF。");return heading("完整品質管制報告","五個章節呈現本次統計；列印時一併輸出全部章節。",`<button class="secondary" data-action="export-metrics">${icon("download",15)}匯出統計 CSV</button><button class="primary" data-action="print">${icon("print",15)}列印／另存 PDF</button>`)+ruleNotice(state.result.rules)+`<div class="tabs no-print" role="tablist" aria-label="報告章節">${REPORT_TITLES.map((title,index)=>`<button role="tab" aria-selected="${state.reportPage===index}" data-action="report-tab" data-index="${index}">${index+1} ${e(title)}</button>`).join("")}</div>${REPORT_TITLES.map((_,index)=>`<section class="report-page panel ${index===state.reportPage?"active":""}">${reportHeader(index)}${reportPageContent(index)}<div class="report-sign"><span>製表：________________</span><span>專業覆核：________________</span><span>日期：________________</span></div></section>`).join("")}`;}
function scopeDescription(metric){return `${FILTERS[metric.numerator.filter]}${metric.numerator.codes.length?`（${metric.numerator.codes.join(", ")}）`:""} ÷ ${FILTERS[metric.denominator.filter]}${metric.denominator.codes.length?`（${metric.denominator.codes.join(", ")}）`:""}`;}
function ruleInput(path,value,kind="string",extra=""){return `<input data-path="${e(path)}" data-kind="${kind}" ${kind==="number"||kind==="nullNumber"?'type="number" step="any"':'type="text"'} value="${e(Array.isArray(value)?value.join(", "):value??"")}" ${extra}>`;}
function ruleSelect(path,value,options){return `<select data-path="${e(path)}">${options.map(([v,label])=>`<option value="${e(v)}" ${value===v?"selected":""}>${e(label)}</option>`).join("")}</select>`;}
function ruleField(label,content,help="",full=false){return `<label class="field ${full?"full":""}"><span>${e(label)}</span>${content}${help?`<small>${e(help)}</small>`:""}</label>`;}
function groupEditor(kind){const groups=state.ruleDraft[kind==="smear"?"smearGroups":"tissueGroups"],key=kind==="smear"?"smearGroups":"tissueGroups";return `<section class="panel"><div class="panel-head"><h2>${kind==="smear"?"抹片診斷分類":"切片診斷分類"}</h2><button class="secondary small" data-action="add-group" data-kind="${kind}">${icon("plus",13)}新增分類</button></div><div class="table-scroll"><table class="rules-table"><thead><tr><th>分類 ID</th><th>顯示名稱</th><th>接受的代碼（逗號分隔）</th>${kind==="smear"?"<th>異常</th><th>SIL</th>":"<th>配對優先序</th>"}<th>操作</th></tr></thead><tbody>${groups.map((g,i)=>`<tr><td>${e(g.id)}</td><td>${ruleInput(`${key}.${i}.label`,g.label,"string",`class="name-input" aria-label="${e(g.id)} 分類名稱"`)}</td><td>${ruleInput(`${key}.${i}.codes`,g.codes,"list",`class="codes-input" aria-label="${e(g.id)} 診斷代碼"`)}</td>${kind==="smear"?`<td class="checkbox-cell"><input type="checkbox" data-path="${key}.${i}.abnormal" data-kind="boolean" ${g.abnormal?"checked":""} aria-label="${e(g.id)} 列為異常"></td><td class="checkbox-cell"><input type="checkbox" data-path="${key}.${i}.sil" data-kind="boolean" ${g.sil?"checked":""} aria-label="${e(g.id)} 列為 SIL"></td>`:`<td>${ruleInput(`${key}.${i}.priority`,g.priority,"number",`min="0" max="100" aria-label="${e(g.id)} 配對優先序"`)}</td>`}<td><button class="text-button small danger" data-action="remove-group" data-kind="${kind}" data-index="${i}" aria-label="移除 ${e(g.id)} 分類">移除</button></td></tr>`).join("")}</tbody></table></div><p class="inline-note">${kind==="smear"?"未知代碼保留為未分類；不自動當作正常。異常、SIL 勾選值影響相關統計。":"優先序數字越大越優先，只在「多筆切片 → 依自訂優先序」時使用。腺體與鱗狀病變不以數值推導診斷一致性。"}</p></section>`;}
function renderRuleTab(){const r=state.ruleDraft;
  if(state.ruleTab==="matching")return `<section class="panel"><div class="panel-head"><h2>配對與追蹤條件</h2><span>每筆抹片採用一筆符合條件的切片</span></div><div class="panel-body"><div class="form-grid">${ruleField("品質追蹤期限（個日曆月）",ruleInput("matching.windowMonths",r.matching.windowMonths,"number",'min="1" max="60"'),"月末自動落在目標月份的最後一天，例如 8/31 加 6 個月為 2 月末。")}${ruleField("切片配對日期",ruleSelect("matching.dateField",r.matching.dateField,[["sampleDate","採檢日期"],["reportDate","報告日期"]]),"即使使用報告日期，切片採檢日仍不可早於抹片。")}${ruleField("多筆切片選擇方式",ruleSelect("matching.selection",r.matching.selection,[["earliest","最早符合條件；同日依檢體編號"],["highestPriority","依分類自訂優先序；相同取最早"]]))}${ruleField("同日切片",`<span class="checkbox-line"><input type="checkbox" data-path="matching.includeSameDay" data-kind="boolean" ${r.matching.includeSameDay?"checked":""}><span>納入抹片採檢當日的切片</span></span>`)}${ruleField("納入品質統計的切片部位",ruleInput("matching.sites",r.matching.sites,"list"),"以完整代碼相符判定，可輸入中文或院內代碼，用逗號分隔。未符合者只列入清冊。",true)}${ruleField("規則備註",`<textarea data-path="profile.notes" rows="3">${e(r.profile.notes)}</textarea>`,"請記錄單位適用條件與專業定義。",true)}</div></div></section>`;
  if(state.ruleTab==="classification")return groupEditor("smear")+groupEditor("tissue");
  if(state.ruleTab==="matrix")return `<section class="panel"><div class="panel-head"><h2>抹切分類判定矩陣</h2><span>每一格由專業人員明確決定</span></div><div class="panel-body"><p class="section-copy">選擇「分類一致」「分類差異」或「待專業判定」。未設定或未分類的診斷不會自動判為一致。這是品管分類，不能用來替個案決定治療。</p></div><div class="table-scroll"><table class="matrix-table"><thead><tr><th>抹片 / 切片</th>${r.tissueGroups.map(g=>`<th>${e(g.id)}</th>`).join("")}</tr></thead><tbody>${r.smearGroups.map(s=>`<tr><th>${e(s.id)}</th>${r.tissueGroups.map(t=>`<td><label><span class="hidden-file">${e(s.id)} 與 ${e(t.id)} 判定</span>${ruleSelect(`comparison.matrix.${s.id}.${t.id}`,r.comparison.matrix[s.id]?.[t.id]??r.comparison.default,[["review","待專業判定"],["concordant","分類一致"],["discordant","分類差異"]])}</label></td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  if(state.ruleTab==="metrics")return `<section class="panel"><div class="panel-head"><h2>統計指標與分母定義</h2><button class="secondary small" data-action="add-metric">${icon("plus",13)}新增指標</button></div>${r.metrics.map((m,i)=>`<section class="metric-editor"><div class="metric-editor-head"><strong>${e(m.label)}</strong><button class="text-button small danger" data-action="remove-metric" data-index="${i}">移除此指標</button></div><div class="form-grid">${ruleField("指標名稱",ruleInput(`metrics.${i}.label`,m.label))}${ruleField("顯示方式",ruleSelect(`metrics.${i}.scale`,m.scale,[["percent","百分比（× 100%）"],["ratio","比值"]]))}${ruleField("超過此值時提醒（留空即停用）",ruleInput(`metrics.${i}.alertAbove`,m.alertAbove,"nullNumber",'min="0"'),"這是單位自訂提醒，不代表官方合格標準。")}${ruleField("公式說明",ruleInput(`metrics.${i}.description`,m.description??""))}</div><div class="metric-sides">${["numerator","denominator"].map(side=>`<div class="scope-box"><h3>${side==="numerator"?"分子":"分母"}計數條件</h3>${ruleField("資料條件",ruleSelect(`metrics.${i}.${side}.filter`,m[side].filter,Object.entries(FILTERS)))}${ruleField("限指定抹片診斷代碼",ruleInput(`metrics.${i}.${side}.codes`,m[side].codes,"list"),"留空代表不限代碼；填多個代碼用逗號分隔。")}</div>`).join("")}</div></section>`).join("")}<p class="inline-note">分母為 0 時顯示 —，不當作 0%。所有計數以有效抹片為單位；未知分類、品質空白不會自動當成正常或良好。</p></section>`;
  return `<section class="panel"><div class="panel-head"><h2>匯入欄位別名</h2><span>支援院內英文欄位或中文標題</span></div><div class="panel-body"><p class="section-copy">同一欄位可以有多個名稱，以逗號分隔。如果檔案同時出現多個可對應欄位，系統要求手動選擇。</p><div class="mapping-grid">${["pas","path"].map(kind=>`<section><h3>${kind.toUpperCase()} 欄位</h3>${Object.entries(r.columns[kind]).map(([field,aliases])=>`<div class="mapping-row"><label for="alias-${kind}-${e(field)}">${e(FIELD_LABELS[field]??field)}</label>${ruleInput(`columns.${kind}.${field}`,aliases,"list",`id="alias-${kind}-${e(field)}"`)}</div>`).join("")}</section>`).join("")}</div></div></section>`;
}
function renderRules(){if(!state.ruleDraft)state.ruleDraft=structuredClone(state.rules);const r=state.ruleDraft;
  return heading("專業規則","以中文表單維護配對、分類、判定與統計定義。",`<button class="secondary" data-action="import-rules">${icon("upload",15)}匯入規則</button><button class="secondary" data-action="export-rules">${icon("download",15)}匯出規則</button><button class="primary" data-action="apply-rules">套用至此瀏覽器</button>`)+`<div class="notice">${icon("sliders",17)}<span>在此修改不會更動已完成工作的結果。匯出規則檔後，替換網站的 <strong>config/rules.json</strong> 即可發布給所有使用者。</span></div><div id="rule-editor"><section class="rules-heading"><div class="form-grid">${ruleField("規則名稱",ruleInput("profile.name",r.profile.name))}${ruleField("版本",ruleInput("profile.version",r.profile.version))}${ruleField("覆核者",ruleInput("profile.reviewer",r.profile.reviewer))}${ruleField("覆核日期",`<input type="date" data-path="profile.reviewDate" value="${e(r.profile.reviewDate)}">`)}</div><div class="rules-banner"><label class="field"><span>規則狀態（修改計算設定後會回到待覆核）</span>${ruleSelect("profile.status",r.profile.status,[["draft","示範／草稿，待專業覆核"],["reviewed","已由填列的專業人員覆核"]])}</label></div></section><div class="tabs" role="tablist" aria-label="規則分類">${[["matching","配對與追蹤"],["classification","診斷分類"],["matrix","判定矩陣"],["metrics","統計指標"],["columns","欄位名稱"]].map(([id,label])=>`<button role="tab" aria-selected="${state.ruleTab===id}" data-action="rule-tab" data-tab="${id}">${label}</button>`).join("")}</div><div id="rules-form">${renderRuleTab()}</div></div><div class="toolbar"><button class="text-button danger" data-action="reset-rules">還原網站預設規則</button><span class="search-status">${state.dirty?"有尚未套用的修改":"規則可匯出為 JSON，交給專業人員核對"}</span></div>`;
}
function captureDraft(){if(!state.ruleDraft||!$("#rule-editor"))return;for(const input of document.querySelectorAll("#rule-editor [data-path]")){
  const parts=input.dataset.path.split(".");let target=state.ruleDraft;
  for(const key of parts.slice(0,-1)){if(!Object.hasOwn(target,key))target[key]={};target=target[key];}
  let value=input.value;
  if(input.dataset.kind==="boolean")value=input.checked;
  else if(input.dataset.kind==="list")value=value.split(/[,，\n]+/).map(v=>v.trim()).filter(Boolean);
  else if(input.dataset.kind==="number")value=value===""?NaN:Number(value);
  else if(input.dataset.kind==="nullNumber")value=value.trim()===""?null:Number(value);
  target[parts.at(-1)]=value;
}}
function renderHistory(){
  const title=heading("工作紀錄","只有你選擇保存的計算結果，才會留在此瀏覽器。",state.history.length?`<button class="secondary danger" data-action="clear-history">${icon("trash",15)}清除全部紀錄</button>`:"");
  const notice=`<div class="notice">${icon("shield",17)}<span>紀錄包含識別碼、姓名與核對註記，僅保存於此瀏覽器。清除瀏覽資料會一併移除；原始 PAS／PATH 檔案不保存。</span></div>`;
  if(!state.history.length)return title+notice+empty("目前沒有保存的工作","完成比對後，可選擇保存工作紀錄。未保存的資料在重新整理或關閉頁面後消失。");
  return title+notice+`<div class="panel">${state.history.map(r=>`<article class="history-item"><div><h3>${e(r.options.institution||"未命名機構")}　${e(r.period.start)} — ${e(r.period.end)}</h3><p>${count(r.totals.pas)} 筆抹片 ／ ${count(r.totals.matched)} 筆配對　${e(r.rules.profile.version)}<br>保存時間 ${e(new Date(r.savedAt??r.createdAt).toLocaleString("zh-TW"))}</p></div><div class="history-actions"><button class="secondary small" data-action="open-history" data-id="${e(r.id)}">開啟結果</button><button class="text-button danger small" data-action="delete-history" data-id="${e(r.id)}">刪除</button></div></article>`).join("")}</div>`;
}
function sourceLinks(){return(state.rules.sources??[]).map(source=>{let href="";try{const url=new URL(source.url);if(["https:","http:"].includes(url.protocol))href=url.href;}catch{}return `<li>${href?`<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(source.title)}</a>`:e(source.title)}<br>${e(source.scope??"")}</li>`;}).join("");}
function renderHelp(){return heading("操作說明","從來源檔案到可追溯的品質管制報告。")+`<div class="help-grid"><section class="panel"><div class="panel-head"><h2>完成一次比對</h2></div><div class="panel-body"><ol><li>載入示範資料確認流程，或下載 CSV 欄位範本。</li><li>請專業人員在「專業規則」確認分類、追蹤期限、部位及指標公式。</li><li>匯入 PAS、PATH 的 .xlsx、UTF-8 CSV 或 TSV。Big5 檔案先切換文字編碼；舊版 .xls 請另存為 .xlsx。</li><li>確認欄位對應、資料完整截止日及機構名稱。兩份資料須使用相同識別碼。</li><li>開始比對，先查看資料檢查紀錄，再核對各個案與候選切片。</li><li>在個案明細記錄「已確認」或「待重閱」。匯出 CSV 或列印五個報告章節。</li></ol><button class="text-button" data-action="templates">${icon("download",14)}下載 CSV 欄位範本</button></div></section><section class="panel"><div class="panel-head"><h2>如何判定與計算</h2></div><div class="panel-body"><ul><li>識別碼去除前後空白、轉全形為半形並統一大寫。不使用姓名或模糊字串配對。</li><li>接受西元 <code>2026-01-31</code>、<code>20260131</code>，以及民國 <code>1150131</code>、<code>115/01/31</code>。Excel 日期儲存格可直接讀取。</li><li>期間包含截止當日。月末以實際月曆計算，不使用固定 180 天。</li><li>只要有符合期限與部位的切片，就視為已配對；未知診斷代碼仍須人工分類。</li><li>每筆抹片選一筆切片；同一個案的多次抹片獨立計算。同一切片可能出現在多筆抹片的配對中。</li><li>分母為 0 時顯示 —。待專業判定不列為分類一致或差異。</li></ul></div></section><section class="panel"><div class="panel-head"><h2>讓非工程師更新規則</h2></div><div class="panel-body"><ol><li>在「專業規則」用表單調整設定，無須撰寫程式。</li><li>填寫版本、覆核者、日期及狀態；用示範或已去識別資料驗證。</li><li>按「套用至此瀏覽器」先試算，再按「匯出規則」。</li><li>將下載的 <code>rules.json</code> 交給網站維護者，替換 <code>config/rules.json</code> 後重新發布。</li><li>其他使用者若曾在自己的瀏覽器套用規則，需按「還原網站預設規則」取得發布版本。</li></ol><p>每份結果會保留當次規則快照；後續修改規則不會改寫舊報告。</p></div></section><section class="panel"><div class="panel-head"><h2>資料與規則來源</h2></div><div class="panel-body"><p>抹片代碼參考公開譯碼；院內切片代碼、比對判定與統計指標須由專業人員確認。此工具用於品管資料整理，不提供個人診斷或治療建議。</p><ul>${sourceLinks()}</ul><h3>本機資料管理</h3><p>工具不包含後端、分析追蹤或外部字型。首次開啟靜態網頁會下載程式檔；匯入的內容不會上傳。預設隱藏姓名與完整識別碼；CSV 依目前顯示設定匯出。匯出檔仍包含檢體編號及日期，請依單位規範保管。</p><button class="text-button danger" data-action="clear-session">清除本次來源與結果</button></div></section></div>`;}

async function attachFile(kind,file){
  state.error="";state.fileRequests??={pas:0,path:0};const request=++state.fileRequests[kind];
  toast(`正在本機讀取 ${kind.toUpperCase()}…`);
  try{
    const book=await readSourceFile(file,state.encoding??"utf-8");
    if(request!==state.fileRequests[kind])return;
    const table=selectSheet(book,book.sheets[0].name);
    state.workbooks[kind]=book;state.files[kind]={...table,mapping:inferMapping(table.headers,state.rules.columns[kind])};
    toast(`${kind.toUpperCase()} 已讀取 ${count(table.rows.length)} 筆，請核對欄位對應。`);
  }catch(error){if(request!==state.fileRequests[kind])return;state.error=`${kind.toUpperCase()}：${error.message}`;state.files[kind]=null;state.workbooks[kind]=null;toast(state.error,true);}
  render();
}
async function loadDemo(autoRun=false){
  const embedded=$("#embedded-samples");let samples;
  if(embedded)samples=JSON.parse(embedded.textContent);
  else{
    const responses=await Promise.all([fetch("./samples/PAS_DEMO_1150101_1151031.csv"),fetch("./samples/PATH_DEMO.csv")]);
    if(responses.some(r=>!r.ok))throw new Error("示範檔案讀取失敗，請下載範本後匯入。");
    const texts=await Promise.all(responses.map(r=>r.text()));samples={pas:texts[0],path:texts[1]};
  }
  for(const kind of["pas","path"]){const table=tabularRows(parseDelimited(samples[kind]));const filename=kind==="pas"?"PAS_DEMO_1150101_1151031.csv":"PATH_DEMO.csv";state.files[kind]={...table,filename,sheet:"示範資料",mapping:inferMapping(table.headers,state.rules.columns[kind])};state.workbooks[kind]={filename,sheets:[{name:"示範資料",matrix:parseDelimited(samples[kind])}],warnings:[]};}
  state.options={cutoff:"2026-11-09",registryMonths:6,institution:"示範病理科（虛構資料）",persist:false};state.error="";
  if(state.view!=="import"){state.view="import";location.hash="import";}render();toast("已載入虛構資料；請確認設定後開始比對。");if(autoRun)await run();
}
async function calculate(input){
  let worker;
  try{
    const embedded=$("#embedded-worker");
    worker=embedded?new Worker(URL.createObjectURL(new Blob([embedded.textContent],{type:"text/javascript"}))):new Worker(new URL("./domain/worker.js",import.meta.url),{type:"module"});
  }catch{return analyze(input);}
  return await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error("比對時間超過 60 秒，請減少單次資料量後重試。"));},60000);
    worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();if(data.error)reject(new Error(data.error));else resolve(data.result);};
    worker.onerror=()=>{clearTimeout(timeout);worker.terminate();try{resolve(analyze(input));}catch(error){reject(error);}};
    worker.postMessage(input);
  });
}
async function run(){
  if(!readyToRun())return;
  if(!parseDate(state.options.cutoff)){state.error="請填寫有效的資料完整截止日。";render();return;}
  state.busy=true;state.error="";render();
  try{
    const result=await calculate({pas:state.files.pas,path:state.files.path,rules:state.rules,options:state.options});
    state.result=result;state.page=1;state.q="";state.filter="all";
    if(state.options.persist)saveResult(true);
    state.view="results";location.hash="results";toast(`比對完成：${count(result.totals.pas)} 筆有效抹片，${count(result.totals.matched)} 筆已配對。`);
  }catch(error){state.error=error.message;toast(error.message,true);}
  finally{state.busy=false;render();}
}
function saveHistoryList(next){
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));state.history=next;return true;}
  catch{toast("工作尚未保存：瀏覽器儲存空間不足或停用。請匯出 CSV；本次結果仍在頁面中。",true);return false;}
}
function saveResult(silent=false){if(!state.result)return;const snapshot=structuredClone(state.result);snapshot.savedAt=new Date().toISOString();const next=[snapshot,...state.history.filter(r=>r.id!==snapshot.id)].slice(0,10);if(saveHistoryList(next)&&!silent)toast("已保存至此瀏覽器的工作紀錄（含個案資訊）。");}
function exportResults(registry=false){
  if(!state.result)return;const r=state.result;
  const headers=["識別碼","姓名","抹片編號","抹片採檢日","抹片代碼","抹片分類","切片編號","切片採檢日","切片報告日","切片部位","切片代碼","切片分類",registry?"是否為品質統計選用切片":"配對判定","追蹤期滿日","是否已期滿","複核狀態","核對註記","規則版本","規則狀態","資料完整截止日"];
  const rows=r.cases.flatMap(c=>(registry?c.registry:[c.selected]).map(t=>[maskedId(c.smear.personId),personName(c.smear.name),c.smear.sampleId,c.smear.sampleDate,c.smear.diagnosis,c.smear.group??"未分類",t?.sampleId??"",t?.sampleDate??"",t?.reportDate??"",t?.site??"",t?.diagnosis??"",t?.group??"",registry?(t?.row===c.selected?.row?"是":"否"):OUTCOMES[c.outcome],c.end,c.mature?"是":"否",reviewLabels[c.reviewStatus],c.note,r.rules.profile.version,r.rules.profile.status,r.options.cutoff]));
  download(registry?"PAP_個案清冊.csv":"PAP_比對結果.csv",toCsv(headers,rows));toast(`已匯出 ${rows.length} 列；${state.masked?"姓名與識別碼已遮蔽":"含完整姓名與識別碼"}。`);
}
function exportMetrics(){const r=state.result;download("PAP_統計指標.csv",toCsv(["指標","分子數","分母數","結果","單位","說明","規則版本","規則狀態","截止日"],r.metrics.map(m=>[m.label,m.numeratorCount,m.denominatorCount,m.value===null?"不計算（分母為 0）":m.value,m.scale==="percent"?"%":"ratio",m.description,r.rules.profile.version,r.rules.profile.status,r.options.cutoff])));}
function openCase(id){
  const c=state.result?.cases.find(item=>item.id===id);if(!c)return;
  $("#modal-host").innerHTML=`<dialog id="case-dialog" aria-labelledby="case-title"><header><h2 id="case-title">個案核對明細</h2><button class="icon-button" data-action="close-dialog" aria-label="關閉明細">${icon("close")}</button></header><div class="dialog-content"><div class="detail-grid"><p><small>個案／抹片</small><strong>${e(personName(c.smear.name))}</strong>　${e(maskedId(c.smear.personId))}<br>${e(c.smear.sampleId||"無編號")}　${e(c.smear.sampleDate)}</p><p><small>抹片分類／配對判定</small>${e(c.smear.diagnosis)} ${e(labelFor(c.smear.group))}<br>${outcomeBadge(c)}　${badge(c.mature?"追蹤已期滿":"追蹤尚未期滿",c.mature?"":"info")}</p></div><p class="section-copy">品質追蹤至 ${e(c.end)}，${state.result.rules.matching.windowMonths} 個月內符合條件 ${c.candidates.length} 筆，選用 ${e(c.selected?.sampleId||"無")}。下列是個案清冊期間的全部部位切片；未選用者不計入抹切交叉表。</p><div class="table-scroll"><table><thead><tr><th>切片編號</th><th>採檢日／報告日</th><th>部位</th><th>診斷</th><th>納入統計</th></tr></thead><tbody>${c.registry.length?c.registry.map(t=>`<tr><td>${e(t.sampleId||`列 ${t.row}`)}</td><td>${e(t.sampleDate)}<span class="table-sub">${e(t.reportDate||"未提供報告日")}</span></td><td>${e(t.site)}</td><td>${e(t.diagnosis)}<span class="table-sub">${e(labelFor(t.group,state.result.rules,"tissue"))}</span></td><td>${t.row===c.selected?.row?badge("本次選用","success"):c.candidates.some(candidate=>candidate.row===t.row)?badge("候選切片"):badge("不在統計條件內","neutral")}</td></tr>`).join(""):'<tr><td colspan="5">清冊期間內沒有切片紀錄。</td></tr>'}</tbody></table></div><div class="dialog-note review-fields"><label class="field"><span>人工複核狀態</span><select id="case-review">${Object.entries(reviewLabels).map(([value,label])=>`<option value="${value}" ${c.reviewStatus===value?"selected":""}>${label}</option>`).join("")}</select></label><label class="field"><span>核對註記</span><textarea id="case-note" maxlength="2000" placeholder="記錄重閱原因或待確認事項">${e(c.note)}</textarea></label></div></div><div class="modal-actions"><button class="secondary" data-action="close-dialog">關閉</button><button class="primary" data-action="save-case" data-id="${e(c.id)}">保存核對註記</button></div></dialog>`;
  $("#case-dialog").showModal();
}
function confirmAction(title,copy,onConfirm){
  $("#modal-host").innerHTML=`<dialog id="confirm-dialog" aria-labelledby="confirm-title"><header><h2 id="confirm-title">${e(title)}</h2></header><div class="dialog-content"><p>${e(copy)}</p></div><div class="modal-actions"><button class="secondary" data-action="close-dialog">取消</button><button class="primary" id="confirm-action">確認</button></div></dialog>`;
  $("#confirm-action").addEventListener("click",()=>{$("#confirm-dialog").close();onConfirm();},{once:true});$("#confirm-dialog").showModal();
}
async function importRulesFile(file){
  if(file.size>1024*1024)throw new Error("規則檔上限 1 MB。");
  const imported=JSON.parse(await file.text()),errors=validateRules(imported);
  if(errors.length)throw new Error(errors.join("\n"));
  state.ruleDraft=structuredClone(imported);state.dirty=true;render();toast("已載入規則供檢查，按「套用至此瀏覽器」後才會生效。");
}
function assertDraft(){captureDraft();const errors=validateRules(state.ruleDraft);if(errors.length)throw new Error(errors.join("\n"));}

document.addEventListener("click",async event=>{
  const button=event.target.closest("[data-action]");if(!button||button.disabled)return;
  const action=button.dataset.action;
  try{
    if(action==="demo"||action==="demo-run")await loadDemo(action==="demo-run");
    else if(action==="run")await run();
    else if(action==="templates"){
      download("PAS_欄位範本.csv",toCsv(["person_id","name","sample_id","sample_date","diagnosis","quality","reviewer"],[["DEMO001","示範甲","P001","2026-01-15","04","1","示範閱片人員"]]));
      download("PATH_欄位範本.csv",toCsv(["person_id","name","sample_id","sample_date","report_date","diagnosis","site"],[["DEMO001","示範甲","T001","2026-02-10","2026-02-13","CIN1","CERVIX"]]));toast("已下載 PAS 與 PATH 欄位範本。");
    }
    else if(action==="remove-file"){const kind=button.dataset.kind;state.files[kind]=null;state.workbooks[kind]=null;state.error="";render();}
    else if(action==="page"){state.page+=Number(button.dataset.delta);$("#cases-region").innerHTML=casesTable(state.view==="registry");}
    else if(action==="export-results")exportResults();
    else if(action==="export-registry")exportResults(true);
    else if(action==="export-metrics")exportMetrics();
    else if(action==="export-issues")download("PAP_資料檢查紀錄.csv",toCsv(["來源","列號","類型","說明"],state.result.issues.map(i=>[i.kind,i.row,i.level,i.message])));
    else if(action==="save-result")confirmAction("保存此工作紀錄","此瀏覽器會保存結果中的識別碼、姓名與核對註記。原始檔案不會保存。",()=>saveResult());
    else if(action==="case")openCase(button.dataset.id);
    else if(action==="close-dialog")button.closest("dialog").close();
    else if(action==="save-case"){
      const c=state.result.cases.find(item=>item.id===button.dataset.id);c.reviewStatus=$("#case-review").value;c.note=$("#case-note").value;
      $("#case-dialog").close();if(state.history.some(r=>r.id===state.result.id))saveResult(true);render();toast("已保存核對註記；原始診斷與比對判定不變。");
    }
    else if(action==="report-tab"){state.reportPage=Number(button.dataset.index);render();}
    else if(action==="print")window.print();
    else if(action==="rule-tab"){captureDraft();state.ruleTab=button.dataset.tab;render();}
    else if(action==="apply-rules"){
      assertDraft();state.rules=structuredClone(state.ruleDraft);state.dirty=false;
      for(const kind of["pas","path"])if(state.files[kind])state.files[kind].mapping=inferMapping(state.files[kind].headers,state.rules.columns[kind]);
      if(storeRules())toast("規則已套用至此瀏覽器；下次比對生效。更新網站請另外匯出規則。");render();
    }
    else if(action==="export-rules"){assertDraft();download("rules.json",JSON.stringify(state.ruleDraft,null,2)+"\n","application/json;charset=utf-8");toast("已匯出 rules.json，可交給網站維護者更新。");}
    else if(action==="import-rules"){
      const input=document.createElement("input");input.type="file";input.accept=".json,application/json";input.addEventListener("change",async()=>{try{if(input.files[0])await importRulesFile(input.files[0]);}catch(error){toast(`規則未匯入：${error.message}`,true);}});input.click();
    }
    else if(action==="reset-rules")confirmAction("還原網站預設規則","這會取代此瀏覽器的自訂規則。已完成工作的規則快照會保留。",()=>{state.rules=structuredClone(state.defaults);state.ruleDraft=structuredClone(state.defaults);state.dirty=false;storeRules();render();toast("已還原網站預設規則。");});
    else if(action==="add-group"){
      captureDraft();const key=button.dataset.kind==="smear"?"smearGroups":"tissueGroups",groups=state.ruleDraft[key];if(groups.length>=40)throw new Error("分類上限 40 個。");let n=groups.length+1;while(groups.some(g=>g.id===`CUSTOM${n}`))n++;
      groups.push({id:`CUSTOM${n}`,label:"自訂分類",codes:[`CUSTOM${n}`],...(key==="smearGroups"?{abnormal:false,sil:false}:{priority:0})});state.ruleDraft.profile.status="draft";state.dirty=true;render();
    }
    else if(action==="remove-group"){
      captureDraft();const key=button.dataset.kind==="smear"?"smearGroups":"tissueGroups",groups=state.ruleDraft[key],group=groups[Number(button.dataset.index)];if(groups.length<=1)throw new Error("至少保留一個分類。");groups.splice(Number(button.dataset.index),1);
      if(key==="smearGroups")delete state.ruleDraft.comparison.matrix[group.id];else for(const row of Object.values(state.ruleDraft.comparison.matrix))delete row[group.id];state.ruleDraft.profile.status="draft";state.dirty=true;render();
    }
    else if(action==="add-metric"){
      captureDraft();if(state.ruleDraft.metrics.length>=20)throw new Error("統計指標上限 20 個。");state.ruleDraft.metrics.push({id:`custom_${Date.now()}`,label:"自訂指標",numerator:{domain:"pas",filter:"matched",codes:[]},denominator:{domain:"pas",filter:"all",codes:[]},scale:"percent",alertAbove:null,description:""});state.ruleDraft.profile.status="draft";state.dirty=true;render();
    }
    else if(action==="remove-metric"){captureDraft();state.ruleDraft.metrics.splice(Number(button.dataset.index),1);state.ruleDraft.profile.status="draft";state.dirty=true;render();}
    else if(action==="open-history"){const saved=state.history.find(r=>r.id===button.dataset.id);if(saved){state.result=structuredClone(saved);state.view="results";location.hash="results";state.q="";state.filter="all";state.page=1;render();}}
    else if(action==="delete-history")confirmAction("刪除此工作紀錄","此瀏覽器保存的這筆工作會被移除，已匯出的檔案不受影響。",()=>{if(saveHistoryList(state.history.filter(r=>r.id!==button.dataset.id)))render();});
    else if(action==="clear-history")confirmAction("清除全部工作紀錄","這會移除此瀏覽器保存的所有個案結果。已匯出的檔案不受影響。",()=>{if(saveHistoryList([])){render();toast("已清除保存的工作紀錄。");}});
    else if(action==="clear-session")confirmAction("清除本次來源與結果","本次尚未保存的結果與註記會被移除。既有工作紀錄及自訂規則會保留。",()=>{state.files={pas:null,path:null};state.workbooks={pas:null,path:null};state.result=null;state.error="";location.hash="import";navigate("import");toast("已清除本次資料。");});
  }catch(error){toast(error.message,true);}
});
document.addEventListener("change",async event=>{
  const input=event.target;
  try{
    if(input.dataset.file&&input.files[0])await attachFile(input.dataset.file,input.files[0]);
    else if(input.dataset.sheet){const kind=input.dataset.sheet,table=selectSheet(state.workbooks[kind],input.value);state.files[kind]={...table,mapping:inferMapping(table.headers,state.rules.columns[kind])};render();}
    else if(input.dataset.mapKind){state.files[input.dataset.mapKind].mapping[input.dataset.mapField]=input.value;render();}
    else if(input.id==="text-encoding")state.encoding=input.value;
    else if(input.id==="cutoff")state.options.cutoff=input.value;
    else if(input.id==="registry-months")state.options.registryMonths=input.value==="all"?null:Number(input.value);
    else if(input.id==="persist-results")state.options.persist=input.checked;
    else if(input.id==="case-filter"){state.filter=input.value;state.page=1;$("#cases-region").innerHTML=casesTable(state.view==="registry");}
  }catch(error){toast(error.message,true);}
});
document.addEventListener("input",event=>{
  const input=event.target;
  if(input.id==="institution")state.options.institution=input.value;
  else if(input.id==="cutoff")state.options.cutoff=input.value;
  else if(input.id==="case-search"){state.q=input.value;state.page=1;$("#cases-region").innerHTML=casesTable(state.view==="registry");}
  if(input.dataset.path){
    state.dirty=true;
    if(input.dataset.path!=="profile.status"){
      state.ruleDraft.profile.status="draft";const status=$('[data-path="profile.status"]');if(status)status.value="draft";
    }
  }
});
document.addEventListener("keydown",event=>{
  const tab=event.target.closest('[role="tab"]');if(!tab||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  event.preventDefault();const tabs=Array.from(tab.parentElement.querySelectorAll('[role="tab"]')),index=tabs.indexOf(tab);
  const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
  const selector=tabs[next].dataset.action==="rule-tab"?`[data-tab="${tabs[next].dataset.tab}"]`:`[data-action="report-tab"][data-index="${tabs[next].dataset.index}"]`;
  tabs[next].click();$(selector)?.focus();
});
for(const type of["dragover","dragleave","drop"])document.addEventListener(type,async event=>{
  const zone=event.target.closest("[data-drop]");if(!zone)return;event.preventDefault();zone.classList.toggle("dragging",type==="dragover");
  if(type==="drop"){const files=event.dataTransfer.files;if(files.length!==1)toast("每個來源請選一個檔案。",true);else await attachFile(zone.dataset.drop,files[0]);}
});
$("#privacy-toggle").addEventListener("click",()=>{
  state.masked=!state.masked;$("#privacy-toggle").setAttribute("aria-pressed",String(state.masked));$("#privacy-toggle").setAttribute("aria-label",state.masked?"顯示個案姓名與完整識別碼":"隱藏個案姓名與完整識別碼");
  $("#modal-host").innerHTML="";state.q="";render();toast(state.masked?"已隱藏姓名與完整識別碼，CSV 同步遮蔽。":"已顯示完整個案資訊；CSV 將包含姓名與識別碼。");
});
window.addEventListener("hashchange",()=>{if(location.hash==="#main")$("#main").focus();else navigate(location.hash.slice(1));});
async function init(){
  try{
    const embedded=$("#embedded-rules");let defaults;
    if(embedded)defaults=JSON.parse(embedded.textContent);
    else{const response=await fetch("./config/rules.json",{cache:"no-store"});if(!response.ok)throw new Error("規則檔讀取失敗。");defaults=await response.json();}
    const errors=validateRules(defaults);if(errors.length)throw new Error(errors.join("\n"));
    state.defaults=structuredClone(defaults);const saved=safeLoad(RULE_KEY,null);state.rules=saved&&!validateRules(saved).length?saved:defaults;
    const histories=safeLoad(HISTORY_KEY,[]);state.history=Array.isArray(histories)?histories.filter(r=>r&&typeof r.id==="string"&&r.options&&r.period&&r.totals&&Array.isArray(r.cases)&&r.rules&&validateRules(r.rules).length===0).slice(0,10):[];
    for(const node of document.querySelectorAll("[data-icon]"))node.innerHTML=icon(node.dataset.icon);
    state.view=Object.hasOwn(VIEW_NAMES,location.hash.slice(1))?location.hash.slice(1):"import";render();
  }catch(error){$("#main").innerHTML=`<div class="notice error" role="alert">${e(error.message)} 請確認 rules.json 格式與檔案路徑，或使用離線版 HTML。</div>`;}
}
init();
