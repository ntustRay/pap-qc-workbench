import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {analyze,addMonths,parseDate,validateRules,inferMapping} from "../dist/domain/engine.js";
import {parseDelimited,tabularRows,toCsv} from "../dist/io/csv.js";
const defaults=JSON.parse(await readFile(new URL("../dist/config/rules.json",import.meta.url),"utf8"));
function input(pasRows,pathRows=[],edit=()=>{}){
  const rules=structuredClone(defaults);edit(rules);
  const pas={headers:["id","date","dx","quality","no"],rows:pasRows,mapping:{personId:"id",sampleDate:"date",diagnosis:"dx",quality:"quality",sampleId:"no"},filename:"PAS.csv"};
  const path={headers:["id","date","report","dx","site","no"],rows:pathRows,mapping:{personId:"id",sampleDate:"date",reportDate:"report",diagnosis:"dx",site:"site",sampleId:"no"},filename:"PATH.csv"};
  return {rules,options:{cutoff:"2026-11-09",registryMonths:6,institution:"Test",persist:false},pas,path};
}
const smear=(overrides={})=>({id:"001",date:"2026-01-31",dx:"04",quality:"1",no:"P1",...overrides});
const tissue=(overrides={})=>({id:"001",date:"2026-02-01",report:"2026-02-03",dx:"CIN1",site:"CERVIX",no:"T1",...overrides});
test("default profile validates and remains an explicitly unreviewed example",()=>{assert.deepEqual(validateRules(defaults),[]);assert.equal(defaults.profile.status,"draft");});
test("valid ROC and Gregorian dates; invalid dates never roll into another month",()=>{
  for(const value of["1150131","115/01/31","20260131","2026-01-31","２０２６/０１/３１"])assert.equal(parseDate(value),"2026-01-31");
  for(const value of["2026-02-29","1150230","01/02/26","","2026-13-01","2026-01-31T00:00:00Z"])assert.equal(parseDate(value),null);
  assert.equal(parseDate("1130229"),"2024-02-29");
});
test("calendar-month boundaries clamp month end and preserve leap years",()=>{
  assert.equal(addMonths("2025-08-31",6),"2026-02-28");assert.equal(addMonths("2023-08-31",6),"2024-02-29");assert.equal(addMonths("2026-01-31",6),"2026-07-31");
});
test("same person, allowed site, inclusive day and inclusive end date",()=>{
  const r=analyze(input([smear()],[tissue({date:"2026-07-31",report:"2026-08-01"})]));assert.equal(r.totals.matched,1);
  assert.equal(analyze(input([smear()],[tissue({date:"2026-08-01",report:"2026-08-03"})])).totals.matched,0);
  assert.equal(analyze(input([smear()],[tissue({date:"2026-01-31"})])).totals.matched,1);
  assert.equal(analyze(input([smear()],[tissue({date:"2026-01-31"})],r=>r.matching.includeSameDay=false)).totals.matched,0);
});
test("IDs preserve leading zero; normalize case/full width; never join missing IDs",()=>{
  assert.equal(analyze(input([smear({id:" ａｂ００１ "})],[tissue({id:"AB001"})])).totals.matched,1);
  assert.equal(analyze(input([smear({id:"001"})],[tissue({id:"1"})])).totals.matched,0);
  assert.equal(analyze(input([smear(),smear({id:"",no:"P2"})],[tissue({id:""})])).totals.pas,1);
});
test("only exact site and exact diagnosis codes; unknown never becomes benign",()=>{
  const r=analyze(input([smear({dx:"???"})],[tissue({dx:"CIN3 suspected"})]));assert.equal(r.cases[0].outcome,"unclassified");assert.equal(r.metrics[0].denominatorCount,0);assert.equal(r.metrics[0].value,null);
  const other=analyze(input([smear()],[tissue({site:"NOT CERVIX"})]));assert.equal(other.totals.matched,0);assert.equal(other.cases[0].registry.length,1);
});
test("multiple candidates select earliest or explicit priority; no severity inference across lineages",()=>{
  const paths=[tissue(),tissue({date:"2026-03-01",report:"2026-03-02",dx:"CIN3",no:"T2"})];
  assert.equal(analyze(input([smear()],paths)).cases[0].selected.diagnosis,"CIN1");
  assert.equal(analyze(input([smear()],paths,r=>r.matching.selection="highestPriority")).cases[0].selected.diagnosis,"CIN3");
  assert.equal(analyze(input([smear()],paths)).cases[0].outcome,"review");
});
test("quality window is independent of registry period; pre-smear biopsies never match",()=>{
  const i=input([smear()],[tissue({date:"2026-09-01",report:"2026-09-02"}),tissue({date:"2026-01-20",report:"2026-02-05",no:"T0"})]);i.options.registryMonths=12;
  const r=analyze(i);assert.equal(r.totals.matched,0);assert.equal(r.cases[0].registry.length,1);
  i.rules.matching.dateField="reportDate";assert.equal(analyze(i).totals.matched,0);
});
test("maturity uses complete-data cutoff, future and invalid rows excluded",()=>{
  const r=analyze(input([smear(),smear({date:"2026-10-01",no:"P2"}),smear({date:"2026-12-01",no:"P3"}),smear({date:"2026-02-30",no:"P4"})]));
  assert.equal(r.cases.length,2);assert.equal(r.cases[0].mature,true);assert.equal(r.cases[1].mature,false);assert.equal(r.totals.rejectedPas,2);assert.equal(r.metrics.find(m=>m.id==="followup").denominatorCount,1);
});
test("report date selection rejects missing dates and report-before-sampling; never beyond cutoff",()=>{
  assert.equal(analyze(input([smear()],[tissue({report:""})],r=>r.matching.dateField="reportDate")).totals.matched,0);
  assert.equal(analyze(input([smear()],[tissue({report:"2026-01-01"})])).totals.matched,0);
  const i=input([smear({date:"2026-10-01"})],[tissue({date:"2026-10-15",report:"2026-11-10"})],r=>r.matching.dateField="reportDate");assert.equal(analyze(i).totals.matched,0);
});
test("exact duplicates excluded once; conflicting duplicate specimen records all quarantined",()=>{
  const deduped=analyze(input([smear(),smear()]));assert.equal(deduped.totals.pas,1);assert.equal(deduped.totals.rejectedPas,1);
  const conflict=analyze(input([smear(),smear({dx:"08"}),smear({id:"002",no:"P2"})]));assert.equal(conflict.totals.pas,1);assert.equal(conflict.cases[0].smear.personId,"002");assert.equal(conflict.totals.rejectedPas,2);
});
test("unknown/empty quality excluded from denominator; zero denominator is null",()=>{
  const r=analyze(input([smear({quality:""})]));assert.equal(r.metrics.find(m=>m.id==="unsatisfactory").value,null);assert.equal(r.metrics.find(m=>m.id==="ascsil").value,null);
});
test("declarative metric code filters and ratio formula; denominator is actual count",()=>{
  const r=analyze(input([smear(),smear({dx:"16",no:"P2"}),smear({dx:"06",no:"P3"}),smear({dx:"08",no:"P4"})]));assert.equal(r.metrics.find(m=>m.id==="ascsil").value,1);assert.equal(r.metrics.find(m=>m.id==="abnormal").value,100);
});
test("matrix explicitly decides; modifying config doesn't change an old result snapshot",()=>{
  const i=input([smear({dx:"01"})],[tissue({dx:"CIN3"})]);const r=analyze(i);assert.equal(r.cases[0].outcome,"discordant");i.rules.comparison.matrix.NILM.CIN3="review";assert.equal(r.rules.comparison.matrix.NILM.CIN3,"discordant");assert.equal(analyze(i).cases[0].outcome,"review");
});
test("rules reject ambiguous codes, malformed formulas and incomplete review records",()=>{
  const r=structuredClone(defaults);r.smearGroups[1].codes.push("1");assert.ok(validateRules(r).some(e=>e.includes("重複")));
  r.smearGroups[1].codes.pop();r.profile.status="reviewed";assert.ok(validateRules(r).some(e=>e.includes("覆核者")));
  r.profile.status="draft";r.metrics[0].denominator.filter="eval(js)";assert.ok(validateRules(r).length);
});
test("automatic mapping refuses ambiguous aliases",()=>{assert.deepEqual(inferMapping(["ID","person_id"],{personId:["ID","person_id"]}),{personId:""});assert.deepEqual(inferMapping(["ＳＭＥＡＲ＿ＤＸ"],{diagnosis:["SMEAR_DX"]}),{diagnosis:"ＳＭＥＡＲ＿ＤＸ"});});
test("CSV parses quoted commas, CRLF, escaped quotes, multiline, BOM and TSV",()=>{
  assert.deepEqual(parseDelimited('\uFEFFid,note\r\n001,"a,b\n""c"""\r\n'),[["id","note"],["001",'a,b\n"c"']]);
  assert.deepEqual(parseDelimited("id\tdx\n001\t04"),[["id","dx"],["001","04"]]);assert.throws(()=>parseDelimited('a,b\n1,"oops'));
});
test("tabular input rejects duplicate/empty headers and too many cells",()=>{assert.throws(()=>tabularRows([["ID","id"],["1","2"]]));assert.throws(()=>tabularRows([["ID",""],["1","2"]]));assert.throws(()=>tabularRows([["ID"],["1","extra"]]));});
test("CSV export neutralizes spreadsheet formulas, including whitespace prefixes",()=>{const text=toCsv(["x"],[["=1+1"],[" +SUM(A1)"],["@cmd"],["\tHYPERLINK"],["normal"]]);assert.ok(text.includes('"\'=1+1"'));assert.ok(text.includes('"\' +SUM'));assert.ok(text.includes('"\'@cmd"'));assert.ok(text.includes('"normal"'));});

test("ambiguous OTHER and ungraded tissue HSIL stay unclassified",()=>{
  const r=analyze(input([smear({dx:"14"})],[tissue({dx:"HSIL"})]));assert.equal(r.cases[0].smear.group,null);assert.equal(r.cases[0].selected.group,null);assert.equal(r.cases[0].outcome,"unclassified");assert.equal(r.metrics[0].denominatorCount,0);
});
