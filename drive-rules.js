window.SceneDriveRules=(()=>{
 const order=['원이','리브','미나미','메이','제나'];
 const safe=s=>String(s||'').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,'').replace(/[. ]+$/g,'').slice(0,80)||'기타';
 function members(x){const m=Array.isArray(x.members)?x.members:[x.member];return order.filter(v=>m.includes(v))}
 function group(x){return x.group===true||x.member==='단체'||x.members?.includes('단체')||members(x).length===5}
 function memberName(x){return group(x)?'단체':members(x).join('+')||'기타'}
 function route(x,categories){
  const category=(x.categoryIds||[]).map(id=>categories.find(c=>c.id===id)).find(Boolean);
  if(category)return category.id==='category-other'?[{key:'other',name:'기타'}]:[{key:'category:'+category.id,name:category.name}];
  if(group(x))return [{key:'group',name:'단체'}];
  const m=members(x);if(m.length>1)return [{key:'multi',name:'2인 이상'},{key:'combo:'+m.join('+'),name:m.join('+')}];
  return m.length?[{key:'member:'+m[0],name:m[0]}]:[{key:'other',name:'기타'}];
 }
 function dateString(value){
  if(typeof value==='string'){const m=value.match(/^(\d{4})[-:](\d{2})[-:](\d{2})/);if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);if(d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3])return m[1].slice(-2)+m[2]+m[3]}}
  if(typeof value==='number'&&Number.isFinite(value)&&value>0){const d=new Date(value);if(!Number.isNaN(d.getTime()))return String(d.getFullYear()).slice(-2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')}
  return null;
 }
 function nameParts(x,categories,capturedAt,firstSyncAt){
  const actual=dateString(capturedAt)||dateString(x.capturedAt)||dateString(x.date);
  const date=actual||'등록일'+(dateString(x.addedAt)||dateString(firstSyncAt));
  const c=(x.categoryIds||[]).map(id=>categories.find(c=>c.id===id)).find(Boolean);
  const category=c?c.name:(members(x).length||group(x)?'일반':'기타');
  const ext=(x.originalName||'').match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]||({'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'}[x.blob?.type])||'bin';
  return {prefix:`${date}_${safe(category)}_${safe(memberName(x))}_`,ext};
 }
 // JPEG/PNG EXIF DateTimeOriginal; bounded metadata read (never decode the original image).
 function exifDate(bytes,base){
  try{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),little=v.getUint16(base)===0x4949;
   const u16=p=>v.getUint16(p,little),u32=p=>v.getUint32(p,little);if(u16(base+2)!==42)return null;
   const visited=new Set();function read(offset,depth=0){if(depth>3||visited.has(offset))return null;visited.add(offset);const p=base+offset,n=Math.min(u16(p),512);let fallback=null;
    for(let i=0;i<n;i++){const at=p+2+12*i,tag=u16(at),type=u16(at+2),len=u32(at+4);
     if(tag===0x8769){const found=read(u32(at+8),depth+1);if(found)return found}
     if([0x9003,0x9004,0x132].includes(tag)&&type===2&&len>=10&&len<100){const pos=len<=4?at+8:base+u32(at+8),str=new TextDecoder().decode(bytes.slice(pos,pos+len)).replace(/\0/g,'');if(dateString(str)){if(tag===0x9003)return str;fallback=str}}
    }return fallback;
   }return read(u32(base+4));
  }catch{return null}
 }
 async function captureDate(blob){
  try{
   const b=new Uint8Array(await blob.slice(0,512*1024).arrayBuffer());
   if(b[0]===255&&b[1]===216){let p=2;while(p+4<b.length){if(b[p]!==255)break;const marker=b[p+1],length=(b[p+2]<<8)|b[p+3];if(marker===0xda||marker===0xd9||length<2)break;if(marker===0xe1&&String.fromCharCode(...b.slice(p+4,p+8))==='Exif'){const d=exifDate(b,p+10);if(d)return d}p+=2+length}}
   if(b[0]===137&&b[1]===80){const v=new DataView(b.buffer);let p=8;while(p+12<b.length){const len=v.getUint32(p),type=String.fromCharCode(...b.slice(p+4,p+8));if(type==='eXIf')return exifDate(b,p+8);p+=len+12}}
   if(blob.type.startsWith('video/')||String.fromCharCode(...b.slice(4,8))==='ftyp'){
    async function boxes(start,end,depth){let at=start,count=0;while(at+8<=end&&count++<1000){const head=new DataView(await blob.slice(at,at+48).arrayBuffer());if(head.byteLength<8)return null;let size=head.getUint32(0),header=8;const type=String.fromCharCode(head.getUint8(4),head.getUint8(5),head.getUint8(6),head.getUint8(7));if(size===1){size=Number(head.getBigUint64(8));header=16}else if(size===0)size=end-at;if(size<header||at+size>end)return null;
      if(type==='mvhd'){const version=head.getUint8(header),seconds=version===1?Number(head.getBigUint64(header+4)):head.getUint32(header+4);if(seconds>2082844800){const d=new Date((seconds-2082844800)*1000);if(d.getUTCFullYear()<=new Date().getFullYear()+1)return d.toISOString().slice(0,10)}}
      if(type==='moov'&&depth<2){const found=await boxes(at+header,at+size,depth+1);if(found)return found}at+=size;
    }return null;}return await boxes(0,blob.size,0);
   }
  }catch{}return null;
 }
 return {order,safe,members,group,memberName,route,dateString,nameParts,captureDate};
})();
