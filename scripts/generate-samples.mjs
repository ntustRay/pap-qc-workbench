import {writeFile} from "node:fs/promises";
import {toCsv} from "../dist/io/csv.js";
const pas=[],path=[];
const codes=["01","02","03","04","04","16","06","07","08","09","10","05","15","18","11","12"];
const tissue={"01":"BENIGN","02":"BENIGN","03":"BENIGN","04":"CIN1","16":"CIN2","06":"CIN1","07":"CIN1","08":"CIN2","09":"CIN3","10":"CIN3","05":"BENIGN","15":"AIS","18":"AIS","11":"SCC","12":"ADENOCARCINOMA"};
for(let i=0;i<160;i++){
  const id=`DEMO${String(i+1).padStart(4,"0")}`,code=codes[i%codes.length];
  const date=new Date(Date.UTC(2026,i%10,(i%25)+1)).toISOString().slice(0,10);
  pas.push([id,`示範個案${String(i+1).padStart(3,"0")}`,`P26-${String(i+1).padStart(4,"0")}`,date,code,i%19===0?"3":"1",i%2?"示範甲":"示範乙"]);
  if(i%4!==3){
    const sample=new Date(Date.parse(`${date}T00:00:00Z`)+((i%75)+7)*86400000).toISOString().slice(0,10);
    const report=new Date(Date.parse(`${sample}T00:00:00Z`)+3*86400000).toISOString().slice(0,10);
    path.push([id,`示範個案${String(i+1).padStart(3,"0")}`,`T26-${String(i+1).padStart(4,"0")}`,sample,report,i%17===0?"CIN3":i%13===0?"UNKNOWN":tissue[code],i%14===0?"ENDOMETRIUM":"CERVIX"]);
    if(i%12===0){const next=new Date(Date.parse(`${sample}T00:00:00Z`)+14*86400000).toISOString().slice(0,10);path.push([id,`示範個案${i+1}`,`T26-${i+1}-B`,next,next,"CIN3","CERVIX"]);}
  }
}
await writeFile(new URL("../dist/samples/PAS_DEMO_1150101_1151031.csv",import.meta.url),toCsv(["person_id","name","sample_id","sample_date","diagnosis","quality","reviewer"],pas));
await writeFile(new URL("../dist/samples/PATH_DEMO.csv",import.meta.url),toCsv(["person_id","name","sample_id","sample_date","report_date","diagnosis","site"],path));
process.stdout.write(`Generated synthetic samples: PAS ${pas.length}, PATH ${path.length}\n`);
