// Pure domain functions. No DOM, browser storage, network, or UI dependencies.
export const FILTERS = {
  all: "全部有效抹片", known: "已分類抹片", abnormal: "異常分類", sil: "SIL 分類",
  matched: "有合格切片", comparable: "矩陣可判定", discordant: "矩陣差異",
  mature: "追蹤已期滿", matureAbnormal: "已期滿且異常", matureAbnormalMatched: "已期滿且異常且有切片",
  unsatisfactory: "品質代碼 3", knownQuality: "品質代碼 1、2、3"
};
export const OUTCOMES = { concordant: "分類一致", discordant: "分類差異", review: "待專業判定", unclassified: "未分類", unmatched: "未配對" };
export const FIELD_LABELS = { personId: "個案識別碼", name: "姓名", sampleId: "檢體編號", sampleDate: "採檢日期", reportDate: "報告日期", diagnosis: "診斷代碼", quality: "抹片品質", site: "切片部位", reviewer: "閱片人員" };
export const normalizeText = value => String(value ?? "").normalize("NFKC").trim();
export const normalizeId = value => normalizeText(value).toUpperCase();
export const normalizeCode = value => {
  const code = normalizeId(value);
  return /^\d{1,2}$/.test(code) ? code.padStart(2, "0") : code;
};
export function parseDate(value) {
  const text = normalizeText(value);
  let match = text.match(/^(\d{3}|\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!match) match = text.match(/^(\d{3}|\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  let year = Number(match[1]);
  if (match[1].length === 3) year += 1911;
  const month = Number(match[2]), day = Number(match[3]);
  if (year < 1912 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
export function addMonths(iso, months) {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
const safeName = value => typeof value === "string" && value.length > 0 && value.length < 500;
export function validateRules(rules) {
  const errors = [];
  if (!isRecord(rules) || rules.schemaVersion !== 1) return ["不支援的規則格式；schemaVersion 必須是 1。"];
  if (!isRecord(rules.profile) || !safeName(rules.profile.name) || !safeName(rules.profile.version)) errors.push("請填寫規則名稱與版本。");
  if (rules.profile?.notes !== undefined && (typeof rules.profile.notes !== "string" || rules.profile.notes.length > 4000)) errors.push("規則備註須為 4,000 字內的文字。");
  if (rules.sources !== undefined && (!Array.isArray(rules.sources) || rules.sources.length > 20 || rules.sources.some(s => !isRecord(s) || !safeName(s.title) || !safeName(s.url)))) errors.push("規則來源須為含標題與 URL 的陣列，上限 20 筆。");
  if (!["draft", "reviewed"].includes(rules.profile?.status)) errors.push("規則狀態必須是 draft 或 reviewed。");
  if (rules.profile?.status === "reviewed" && (!safeName(rules.profile.reviewer) || !parseDate(rules.profile.reviewDate))) errors.push("已覆核規則必須填寫覆核者與有效覆核日期。");
  const matching = rules.matching;
  if (!isRecord(matching) || !Number.isInteger(matching.windowMonths) || matching.windowMonths < 1 || matching.windowMonths > 60) errors.push("追蹤期限須為 1–60 個月的整數。");
  if (!["earliest", "highestPriority"].includes(matching?.selection)) errors.push("不支援的多筆切片選擇方式。");
  if (!["sampleDate", "reportDate"].includes(matching?.dateField)) errors.push("配對日期必須是採檢日期或報告日期。");
  if (typeof matching?.includeSameDay !== "boolean") errors.push("請設定是否納入同日切片。");
  if (!Array.isArray(matching?.sites) || !matching.sites.length || matching.sites.some(v => !safeName(v))) errors.push("至少設定一個有效切片部位。");
  for (const kind of ["pas", "path"]) {
    const columns = rules.columns?.[kind];
    if (!isRecord(columns) || !Object.keys(columns).length) { errors.push(`${kind} 欄位設定缺漏。`); continue; }
    for (const key of ["personId", "sampleDate", "diagnosis", ...(kind === "path" ? ["site", "reportDate"] : [])]) {
      if (!Array.isArray(columns[key]) || !columns[key].length) errors.push(`${kind} ${FIELD_LABELS[key]} 欄位別名不可空白。`);
    }
    for (const [key, aliases] of Object.entries(columns)) if (!Array.isArray(aliases) || aliases.some(v => !safeName(v))) errors.push(`${kind} ${key} 欄位別名格式錯誤。`);
  }
  for (const key of ["smearGroups", "tissueGroups"]) {
    const groups = rules[key];
    if (!Array.isArray(groups) || !groups.length || groups.length > 40) { errors.push(`${key} 須有 1–40 個分類。`); continue; }
    const ids = new Set(), codes = new Set();
    for (const group of groups) {
      if (!isRecord(group) || !safeName(group.id) || !/^[A-Za-z0-9_-]+$/.test(group.id) || ["__proto__","constructor","prototype"].includes(group.id) || !safeName(group.label)) { errors.push(`${key} 分類名稱或 ID 無效。`); continue; }
      if (ids.has(group.id)) errors.push(`分類 ID 重複：${group.id}`);
      ids.add(group.id);
      if (!Array.isArray(group.codes) || !group.codes.length) { errors.push(`${group.label} 至少需要一個代碼。`); continue; }
      for (const code of group.codes) {
        if (!safeName(code)) { errors.push(`${group.label} 代碼不可空白。`); continue; }
        const normalized = normalizeCode(code);
        if (codes.has(normalized)) errors.push(`診斷代碼重複：${code}`);
        codes.add(normalized);
      }
      if (key === "smearGroups" && (typeof group.abnormal !== "boolean" || typeof group.sil !== "boolean")) errors.push(`${group.label} 需設定異常及 SIL 勾選值。`);
      if (key === "tissueGroups" && (!Number.isInteger(group.priority) || group.priority < 0 || group.priority > 100)) errors.push(`${group.label} 優先序須為 0–100 整數。`);
    }
  }
  if (!isRecord(rules.comparison) || !["concordant", "discordant", "review"].includes(rules.comparison.default) || !isRecord(rules.comparison.matrix)) errors.push("比對矩陣設定錯誤。");
  else for (const [smear, row] of Object.entries(rules.comparison.matrix)) {
    if (!Array.isArray(rules.smearGroups) || !rules.smearGroups.some(g => g?.id === smear) || !isRecord(row)) { errors.push(`矩陣抹片分類無效：${smear}`); continue; }
    for (const [tissue, result] of Object.entries(row)) if (!Array.isArray(rules.tissueGroups) || !rules.tissueGroups.some(g => g?.id === tissue) || !["concordant", "discordant", "review"].includes(result)) errors.push(`矩陣設定無效：${smear} / ${tissue}`);
  }
  if (!Array.isArray(rules.metrics) || rules.metrics.length > 20) errors.push("指標須為陣列，上限 20 項。");
  else {
    const ids = new Set();
    for (const metric of rules.metrics) {
      if (!isRecord(metric) || !/^[A-Za-z0-9_-]+$/.test(metric.id) || ids.has(metric.id) || !safeName(metric.label)) { errors.push("指標名稱／ID 無效或重複。"); continue; }
      ids.add(metric.id);
      if (!["percent", "ratio"].includes(metric.scale)) errors.push(`${metric.label} 顯示方式無效。`);
      if (metric.alertAbove !== null && (typeof metric.alertAbove !== "number" || !Number.isFinite(metric.alertAbove) || metric.alertAbove < 0)) errors.push(`${metric.label} 提醒值必須為非負數或留空。`);
      for (const key of ["numerator", "denominator"]) {
        const scope = metric[key];
        if (!isRecord(scope) || scope.domain !== "pas" || !Object.hasOwn(FILTERS, scope.filter) || !Array.isArray(scope.codes) || scope.codes.some(v => !safeName(v))) errors.push(`${metric.label} 的計算條件無效。`);
      }
    }
  }
  return errors;
}
export function inferMapping(headers, aliases) {
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => {
    const found = headers.filter(header => names.some(name => normalizeId(name) === normalizeId(header)));
    return [field, found.length === 1 ? found[0] : ""];
  }));
}
export function requiredFields(kind, rules) {
  return ["personId", "sampleDate", "diagnosis", ...(kind === "path" ? ["site", ...(rules.matching.dateField === "reportDate" ? ["reportDate"] : [])] : [])];
}
export function normalizeDataset(rows, mapping, kind, rules, cutoff) {
  const issues = [], records = [], seen = new Map(), conflicting = new Set();
  const groups = kind === "pas" ? rules.smearGroups : rules.tissueGroups;
  const lookup = new Map(groups.flatMap(g => g.codes.map(c => [normalizeCode(c), g])));
  for (const [index, row] of rows.entries()) {
    const record = { row: index + 2, kind };
    for (const field of Object.keys(rules.columns[kind])) record[field] = normalizeText(row[mapping[field]]);
    record.personId = normalizeId(record.personId);
    record.sampleDate = parseDate(record.sampleDate);
    record.reportDate = parseDate(record.reportDate);
    record.diagnosis = normalizeCode(record.diagnosis);
    record.site = normalizeId(record.site);
    const fail = message => issues.push({ kind, row: record.row, level: "error", message });
    if (!record.personId || !record.sampleDate || !record.diagnosis || (kind === "path" && !record.site)) { fail("缺少識別碼、有效採檢日期、診斷代碼或切片部位；本列排除。"); continue; }
    if (record.sampleDate > cutoff) { fail("採檢日期晚於資料完整截止日；本列排除。"); continue; }
    if (kind === "path" && rules.matching.dateField === "reportDate" && !record.reportDate) { fail("使用報告日期配對，但本列報告日期無效；本列排除。"); continue; }
    if (record.reportDate && record.reportDate < record.sampleDate) { fail("報告日期早於採檢日期；本列排除。"); continue; }
    record.group = lookup.get(record.diagnosis)?.id ?? null;
    record.abnormal = lookup.get(record.diagnosis)?.abnormal ?? false;
    record.sil = lookup.get(record.diagnosis)?.sil ?? false;
    record.priority = lookup.get(record.diagnosis)?.priority ?? -1;
    const signature = JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "row")));
    const key = record.sampleId ? `${record.personId}\u0000${record.sampleId}` : signature;
    const previous = seen.get(key);
    if (previous) {
      if (previous.signature === signature) issues.push({ kind, row: record.row, level: "warning", message: `與第 ${previous.record.row} 列重複；本列排除。` });
      else { conflicting.add(key); fail(`相同個案與檢體編號的內容不一致（第 ${previous.record.row} 列）；相關列全部排除。`); }
      continue;
    }
    seen.set(key, { record, signature });
    records.push({ key, record });
    if (!record.group) issues.push({kind, row:record.row, level:"warning", message:`未知診斷代碼「${record.diagnosis}」；保留於清冊，列為未分類。`});
    if (kind === "path" && !rules.matching.sites.map(normalizeId).includes(record.site)) issues.push({kind, row:record.row, level:"info",message:`部位「${record.site}」不在統計範圍；僅列入個案候選清冊。`});
    if (kind === "pas" && !["1","2","3"].includes(record.quality)) issues.push({kind, row:record.row, level:"warning",message:"品質未填或代碼不是 1、2、3；不納入品質指標分母。"});
  }
  return { records: records.filter(item => !conflicting.has(item.key)).map(item => item.record), issues, rejected: rows.length - records.filter(item => !conflicting.has(item.key)).length };
}
export function evaluateScope(cases, scope) {
  const codes = new Set(scope.codes.map(normalizeCode));
  return cases.filter(c => {
    if (codes.size && !codes.has(c.smear.diagnosis)) return false;
    switch (scope.filter) {
      case "known": return c.smear.group !== null;
      case "abnormal": return c.smear.abnormal;
      case "sil": return c.smear.sil;
      case "matched": return c.selected !== null;
      case "comparable": return ["concordant", "discordant"].includes(c.outcome);
      case "discordant": return c.outcome === "discordant";
      case "mature": return c.mature;
      case "matureAbnormal": return c.mature && c.smear.abnormal;
      case "matureAbnormalMatched": return c.mature && c.smear.abnormal && c.selected !== null;
      case "unsatisfactory": return c.smear.quality === "3";
      case "knownQuality": return ["1","2","3"].includes(c.smear.quality);
      default: return true;
    }
  }).length;
}
export function analyze(input) {
  const { rules, options } = input;
  const errors = validateRules(rules);
  if (errors.length) throw new Error(errors.join("\n"));
  const cutoff = parseDate(options.cutoff);
  if (!cutoff) throw new Error("請填寫有效的資料完整截止日。");
  if (![6,12,null].includes(options.registryMonths)) throw new Error("清冊期間設定無效。");
  for (const kind of ["pas", "path"]) for (const field of requiredFields(kind, rules)) {
    const mapped = input[kind].mapping[field];
    if (!mapped || !input[kind].headers.includes(mapped)) throw new Error(`${kind.toUpperCase()} 尚未對應「${FIELD_LABELS[field]}」欄位。`);
  }
  const pas = normalizeDataset(input.pas.rows, input.pas.mapping, "pas", rules, cutoff);
  const path = normalizeDataset(input.path.rows, input.path.mapping, "path", rules, cutoff);
  if (!pas.records.length) throw new Error("PAS 沒有有效資料；請檢查欄位對應、日期、識別碼及重複編號。");
  const pathIndex = new Map();
  for (const record of path.records) {
    if (!pathIndex.has(record.personId)) pathIndex.set(record.personId, []);
    pathIndex.get(record.personId).push(record);
  }
  const sites = new Set(rules.matching.sites.map(normalizeId));
  const cases = pas.records.map((smear, index) => {
    const end = addMonths(smear.sampleDate, rules.matching.windowMonths);
    const after = date => rules.matching.includeSameDay ? date >= smear.sampleDate : date > smear.sampleDate;
    const all = pathIndex.get(smear.personId) ?? [];
    const eligible = all.filter(tissue => {
      const date = tissue[rules.matching.dateField];
      return date && after(date) && date <= end && date <= cutoff && tissue.sampleDate >= smear.sampleDate && sites.has(tissue.site);
    }).sort((a, b) => {
      if (rules.matching.selection === "highestPriority" && b.priority !== a.priority) return b.priority - a.priority;
      return a[rules.matching.dateField].localeCompare(b[rules.matching.dateField]) || a.sampleId.localeCompare(b.sampleId) || a.row - b.row;
    });
    const selected = eligible[0] ?? null;
    const registryEnd = options.registryMonths === null ? cutoff : addMonths(smear.sampleDate, options.registryMonths);
    const registry = all.filter(tissue => after(tissue.sampleDate) && tissue.sampleDate <= registryEnd && tissue.sampleDate <= cutoff).sort((a,b) => a.sampleDate.localeCompare(b.sampleDate) || a.row - b.row);
    let outcome = "unmatched";
    if (selected) outcome = !smear.group || !selected.group ? "unclassified" : rules.comparison.matrix[smear.group]?.[selected.group] ?? rules.comparison.default;
    return {id:`case-${index + 1}`, smear, selected, candidates:eligible, registry, outcome, end, mature:end <= cutoff, reviewStatus:"pending", note:""};
  });
  const metrics = rules.metrics.map(metric => {
    const numerator = evaluateScope(cases, metric.numerator), denominator = evaluateScope(cases, metric.denominator);
    const value = denominator ? numerator / denominator * (metric.scale === "percent" ? 100 : 1) : null;
    return {...metric, numeratorCount:numerator, denominatorCount:denominator, value, alert:value !== null && metric.alertAbove !== null && value > metric.alertAbove};
  });
  const cross = Object.fromEntries(rules.smearGroups.map(s => [s.id, Object.fromEntries(rules.tissueGroups.map(t => [t.id, 0]))]));
  for (const item of cases) if (item.smear.group && item.selected?.group) cross[item.smear.group][item.selected.group]++;
  return {
    id:crypto.randomUUID(), createdAt:new Date().toISOString(), rules:structuredClone(rules), options:structuredClone(options),
    files:{pas:input.pas.filename,path:input.path.filename}, cases, metrics, cross,
    issues:[...pas.issues,...path.issues],
    totals:{pas:cases.length,path:path.records.length,matched:cases.filter(c=>c.selected).length,unmatched:cases.filter(c=>!c.selected).length,discordant:cases.filter(c=>c.outcome === "discordant").length,pending:cases.filter(c=>["review","unclassified"].includes(c.outcome)).length,rejectedPas:pas.rejected,rejectedPath:path.rejected},
    period:{start:pas.records.reduce((v,r)=>r.sampleDate < v ? r.sampleDate : v,cutoff),end:pas.records.reduce((v,r)=>r.sampleDate > v ? r.sampleDate : v,"1912-01-01")}
  };
}
