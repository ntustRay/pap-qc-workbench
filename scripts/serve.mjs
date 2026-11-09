import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../dist/",import.meta.url));
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".csv":"text/csv; charset=utf-8",".svg":"image/svg+xml"};
const port=Number(process.env.PAP_QC_PORT??5175);
const server=createServer(async(req,res)=>{
  try{
    const requestPath=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const target=path.resolve(root,`.${requestPath==="/"?"/index.html":requestPath}`);
    if(!target.startsWith(root)||!(await stat(target)).isFile()){res.writeHead(404);res.end("Not found");return;}
    res.writeHead(200,{"Content-Type":types[path.extname(target)]??"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});res.end(await readFile(target));
  }catch{res.writeHead(404);res.end("Not found");}
});
server.listen(port,"127.0.0.1",()=>process.stdout.write(`PAP QC local preview: http://127.0.0.1:${port}\n`));
process.on("SIGINT",()=>server.close(()=>process.exit(0)));
