// Used by the release process to send an explicit allowlist to the GitHub API.
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const files=[];
for(const directory of["dist","docs","scripts","tests",".github"]){
  for(const file of await readdir(path.join(root,directory),{recursive:true,withFileTypes:true})){
    if(!file.isFile())continue;
    const full=path.join(file.parentPath,file.name),relative=path.relative(root,full).replaceAll("\\","/");
    if(!/\.(js|mjs|json|html|css|md|svg|csv|yml)$/.test(relative)&&file.name!==".nojekyll")continue;
    files.push({path:relative,mode:"100644",type:"blob",content:await readFile(full,"utf8")});
  }
}
for(const file of["README.md","package.json",".gitignore"])files.push({path:file,mode:"100644",type:"blob",content:await readFile(path.join(root,file),"utf8")});
process.stdout.write(JSON.stringify(files));
