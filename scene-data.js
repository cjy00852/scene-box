/* IndexedDB accounting, migration, and durable sync queue. No network access. */
window.SceneData = (() => {
 let db;
 const statsKey='original-file-bytes-v1', categoryKey='custom-categories-v1';
 const defaults=[{id:'legacy-bubble',name:'버블'},{id:'legacy-membership',name:'플챗 멤버십'},{id:'category-other',name:'기타'}];
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 const complete=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error||Error('저장 작업 취소'));t.onerror=()=>reject(t.error)});
 const emit=()=>window.dispatchEvent(new Event('scene-data-change'));
 function formatBytes(bytes){const gb=1024**3;return (bytes/(bytes>=gb?gb:1024**2)).toLocaleString('ko-KR',{maximumFractionDigits:2})+(bytes>=gb?'GB':'MB')}
 function legacyCategories(x){return [...(x.bubble?['legacy-bubble']:[]),...(x.membership?['legacy-membership']:[])]}
 async function setting(key){return (await request(db.transaction('settings').objectStore('settings').get(key)))?.value}
 async function setSetting(key,value){const t=db.transaction('settings','readwrite'),done=complete(t);t.objectStore('settings').put({key,value});await done}
 function queued(old,id,kind){return {...old,id,kind,revision:(old?.revision||0)+1,state:'pending',attempts:0,nextAt:0,error:'',updatedAt:Date.now()}}
 async function init(database){
  db=database;
  const t=db.transaction(['photos','settings','driveJobs'],'readwrite'),done=complete(t),settings=t.objectStore('settings'),photos=t.objectStore('photos'),jobs=t.objectStore('driveJobs');
  const statsReq=settings.get(statsKey);
  statsReq.onsuccess=()=>{
   if(statsReq.result)return;
   let bytes=0,count=0;const cursor=photos.openCursor();
   cursor.onsuccess=()=>{const c=cursor.result;if(!c){settings.put({key:statsKey,value:{bytes,count}});return}
    const x=c.value;x.fileSize=x.blob?.size||0;bytes+=x.fileSize;count++;
    x.categoryIds=Array.isArray(x.categoryIds)?x.categoryIds:legacyCategories(x);
    x.contentVersion=x.contentVersion||crypto.randomUUID();x.syncRevision=x.syncRevision||1;
    c.update(x);jobs.put(queued(null,x.id,'file'));c.continue();
   };
  };
  const cats=settings.get(categoryKey);cats.onsuccess=()=>{if(!cats.result){settings.put({key:categoryKey,value:defaults});for(const c of defaults)jobs.put(queued(null,'category:'+c.id,'category'))}};
  await done;
  await refreshUsage();
 }
 async function refreshUsage(){const value=await setting(statsKey);const el=document.getElementById('storageUsage');if(el)el.textContent='저장 용량 '+formatBytes(value?.bytes||0);return value}
 async function put(item){
  const t=db.transaction(['photos','settings','driveJobs'],'readwrite'),done=complete(t),photos=t.objectStore('photos'),settings=t.objectStore('settings'),jobs=t.objectStore('driveJobs');
  const previous=photos.get(item.id),stats=settings.get(statsKey),job=jobs.get(item.id),cats=settings.get(categoryKey);let ready=0;
  const finish=()=>{if(++ready!==4)return;const old=previous.result;
   const known=new Set((cats.result?.value||defaults).map(c=>c.id));
   const categoryIds=[...new Set((Array.isArray(item.categoryIds)?item.categoryIds:legacyCategories(item)).map(id=>known.has(id)?id:'category-other'))];
   const row={...item,fileSize:item.blob?.size||0,categoryIds,contentVersion:item.contentVersion||crypto.randomUUID(),syncRevision:(old?.syncRevision||0)+1};
   const value=stats.result?.value||{bytes:0,count:0};value.bytes=Math.max(0,value.bytes-(old?.fileSize??old?.blob?.size??0)+row.fileSize);value.count+=old?0:1;
   photos.put(row);settings.put({key:statsKey,value});jobs.put(queued(job.result,item.id,'file'));Object.assign(item,row);
  };previous.onsuccess=finish;stats.onsuccess=finish;job.onsuccess=finish;cats.onsuccess=finish;
  await done;await refreshUsage();emit();
 }
 async function del(id){
  const t=db.transaction(['photos','settings','driveJobs'],'readwrite'),done=complete(t),photos=t.objectStore('photos'),settings=t.objectStore('settings');
  const row=photos.get(id),stats=settings.get(statsKey);let ready=0;
  const finish=()=>{if(++ready!==2)return;if(row.result){const v=stats.result.value;v.bytes=Math.max(0,v.bytes-(row.result.fileSize??row.result.blob?.size??0));v.count=Math.max(0,v.count-1);settings.put({key:statsKey,value:v});photos.delete(id)}t.objectStore('driveJobs').delete(id)};
  row.onsuccess=finish;stats.onsuccess=finish;await done;await refreshUsage();emit();
 }
 async function jobs(){return request(db.transaction('driveJobs').objectStore('driveJobs').getAll())}
 async function photo(id){return request(db.transaction('photos').objectStore('photos').get(id))}
 async function patchJob(id,change){
  const t=db.transaction('driveJobs','readwrite'),done=complete(t),store=t.objectStore('driveJobs'),req=store.get(id);let result;
  req.onsuccess=()=>{if(!req.result)return;result=change(req.result)||req.result;store.put(result)};await done;emit();return result;
 }
 async function queueCategory(id){const key='category:'+id,t=db.transaction('driveJobs','readwrite'),done=complete(t),store=t.objectStore('driveJobs'),r=store.get(key);r.onsuccess=()=>store.put(queued(r.result,key,'category'));await done;emit()}
 async function saveCategories(categories,deletedId){
  const t=db.transaction(['settings','photos','driveJobs'],'readwrite'),done=complete(t),p=t.objectStore('photos'),j=t.objectStore('driveJobs');
  t.objectStore('settings').put({key:categoryKey,value:categories});
  if(deletedId)j.delete('category:'+deletedId);
  const cur=p.openCursor();cur.onsuccess=()=>{const c=cur.result;if(!c)return;const x=c.value;
   if(deletedId&&x.categoryIds?.includes(deletedId)){x.categoryIds=[...new Set(x.categoryIds.map(id=>id===deletedId?'category-other':id))];x.bubble=false;x.membership=false;c.update(x)}
   const req=j.get(x.id);req.onsuccess=()=>j.put(queued(req.result,x.id,'file'));c.continue();
  };await done;
  for(const c of categories)await queueCategory(c.id);
  emit();
 }
 return {init,put,del,setting,setSetting,refreshUsage,formatBytes,legacyCategories,jobs,photo,patchJob,queueCategory,saveCategories,categoryKey};
})();
