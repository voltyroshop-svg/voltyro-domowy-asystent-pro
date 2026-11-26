import {maxFile,sniff} from './model.js';
import {importArchive,validateArchive} from './storage.js';

const format='voltyro-domowy-multipart';
const version=4;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const metadataLimit=64*1024*1024;
const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),
  byte=>byte.toString(16).padStart(2,'0')).join('');
const invalid=()=>Error('Kopia jest uszkodzona lub niekompletna. Wybierz manifest i wszystkie części z tego samego eksportu. Bieżące dane pozostały bez zmian.');

async function mapDocuments(snapshot,convert){
  const docs=async list=>{
    const result=[];
    for(const document of list)result.push(await convert(document));
    return result;
  };
  const products=[],receipts=[];
  for(const {docs:documents,history,revision,...product} of snapshot.products){
    const cases=[];
    for(const {docs:attachments,...entry} of history)cases.push({...entry,docs:await docs(attachments)});
    products.push({...product,docs:await docs(documents),history:cases});
  }
  for(const {docs:documents,revision,...receipt} of snapshot.receipts)
    receipts.push({...receipt,docs:await docs(documents)});
  return {products,receipts,categories:snapshot.categories};
}

export async function prepareBackup(snapshot){
  const bundle=crypto.randomUUID();
  const name='VOLTYRO-'+new Date().toISOString().slice(0,10)+'-'+bundle;
  const parts=[];
  const records=await mapDocuments(snapshot,async({blob,...document})=>{
    const number=parts.length+1;
    parts.push({number,blob});
    return {...document,part:number,size:blob.size,mime:blob.type,digest:await hash(blob)};
  });
  const payload=JSON.stringify({bundle,partCount:parts.length,...records});
  const digest=await hash(new Blob([payload]));
  const manifest=new Blob([JSON.stringify({format,version,digest,payload})],{type:'application/json'});
  if(manifest.size>metadataLimit)throw Error('Metadane kopii przekraczają obsługiwany rozmiar.');
  return [{name:name+'.json',blob:manifest},...parts.map(({number,blob})=>({
    name:name+'-'+String(number).padStart(5,'0')+'.vpart',
    blob:new Blob([encoder.encode(bundle+':'+number+'\n'),blob],{type:'application/octet-stream'})
  }))];
}

export async function restoreBackup(files){
  if(files.length===1&&files[0].name?.toLowerCase().endsWith('.json')){
    if(files[0].size>metadataLimit)return importArchive(files[0]);
    const prefix=await files[0].slice(0,256).text();
    if(!prefix.includes(format))return importArchive(files[0]);
  }
  try{
    const manifests=files.filter(file=>file.name.toLowerCase().endsWith('.json'));
    if(manifests.length!==1||manifests[0].size>metadataLimit)throw invalid();
    const envelope=JSON.parse(await manifests[0].text());
    if(envelope.format!==format||envelope.version!==version||typeof envelope.payload!=='string'||
      await hash(new Blob([envelope.payload]))!==envelope.digest)throw invalid();
    const manifest=JSON.parse(envelope.payload);
    const {bundle,partCount}=manifest;
    if(!/^[0-9a-f-]{36}$/.test(bundle)||
      !Number.isSafeInteger(partCount)||partCount<0||files.length!==partCount+1)throw invalid();
    const parts=new Map();
    for(const file of files){
      if(file===manifests[0])continue;
      if(!file.name.toLowerCase().endsWith('.vpart')||file.size>maxFile+64)throw invalid();
      const header=await file.slice(0,64).arrayBuffer();
      const bytes=new Uint8Array(header);
      const end=bytes.indexOf(10);
      if(end<0)throw invalid();
      const [owner,index,...rest]=decoder.decode(bytes.subarray(0,end)).split(':');
      const number=Number(index);
      if(owner!==bundle||rest.length||!Number.isInteger(number)||number<1||number>partCount||parts.has(number))throw invalid();
      parts.set(number,file.slice(end+1));
    }
    const unpacked=await mapDocuments(manifest,async({part,size,mime,digest,id,name,kind})=>{
      const file=parts.get(part);
      if(!file||file.size!==size||size>maxFile||await sniff(file)!==mime||await hash(file)!==digest)throw invalid();
      parts.delete(part);
      return {id,name,kind,blob:file.slice(0,file.size,mime)};
    });
    if(parts.size)throw invalid();
    return validateArchive(unpacked.products,unpacked.receipts,unpacked.categories);
  }catch{throw invalid();}
}

export const documentCount=({products,receipts})=>products.reduce((sum,p)=>sum+p.docs.length+
  p.history.reduce((count,h)=>count+h.docs.length,0),0)+receipts.reduce((sum,r)=>sum+r.docs.length,0);
