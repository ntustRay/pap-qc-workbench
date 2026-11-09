import test from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {unzipEntries,crc32} from "../dist/io/xlsx.js";
function zip(files,options={}){
  const locals=[],directory=[];let offset=0;
  for(const[name,text]of files){
    const nameBytes=Buffer.from(name),raw=Buffer.from(text),data=options.stored?raw:deflateRawSync(raw),local=Buffer.alloc(30),entry=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(options.encrypted?1:0,6);local.writeUInt16LE(options.stored?0:8,8);local.writeUInt32LE(crc32(raw),14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(nameBytes.length,26);
    entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(options.encrypted?1:0,8);entry.writeUInt16LE(options.stored?0:8,10);entry.writeUInt32LE(crc32(raw),16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(options.expanded??raw.length,24);entry.writeUInt16LE(nameBytes.length,28);entry.writeUInt32LE(offset,42);
    locals.push(local,nameBytes,data);directory.push(entry,nameBytes);offset+=local.length+nameBytes.length+data.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  const output=Buffer.concat([...locals,central,end]);return output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength);
}
test("ZIP adapter indexes stored and compressed Excel XML only",async()=>{
  for(const stored of[false,true]){const files=await unzipEntries(zip([["xl/workbook.xml","<workbook/>"],["../outside.txt","no"]],{stored}));assert.equal(files.size,1);assert.ok(files.has("xl/workbook.xml"));assert.equal(files.get("xl/workbook.xml").method,stored?0:8);assert.equal(files.get("xl/workbook.xml").crc,crc32(Buffer.from("<workbook/>")));}
});
test("CRC32 matches the standard reference",()=>{assert.equal(crc32(Buffer.from("123456789")),0xcbf43926);});
test("reject non-XLSX, encrypted, duplicate, truncated and over-expanded files",async()=>{
  await assert.rejects(()=>unzipEntries(new ArrayBuffer(10)));
  await assert.rejects(()=>unzipEntries(zip([["xl/workbook.xml","x"]],{encrypted:true})),/加密/);
  await assert.rejects(()=>unzipEntries(zip([["xl/workbook.xml","a"],["xl/workbook.xml","b"]])),/重複/);
  await assert.rejects(()=>unzipEntries(zip([["xl/workbook.xml","x"]],{expanded:40*1024*1024})),/過大/);
  await assert.rejects(()=>unzipEntries(zip([["xl/workbook.xml","x"]]).slice(0,30)));
});
export {zip};
