import {spawnSync} from "node:child_process";
import {readdir} from "node:fs/promises";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
for(const file of await readdir(path.join(root,"dist"),{recursive:true})){
  if(!file.endsWith(".js"))continue;
  const check=spawnSync(process.execPath,["--check",path.join(root,"dist",file)],{stdio:"inherit"});
  if(check.status!==0)process.exit(check.status??1);
}
const result=spawnSync(process.execPath,["--test","tests/*.test.mjs"],{cwd:root,stdio:"inherit"});
process.exit(result.status??1);
