/* One-way, non-destructive local -> Google Drive synchronization. */
window.SceneDrive=(()=>{
 const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3';
 const SCOPE='https://www.googleapis.com/auth/drive.file',MAX_ATTEMPTS=5,CHUNK=4*1024*1024;
 const el=id=>document.getElementById(id),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let session=null,tokenClient=null,connected=false,running=false,timer=0,wake=null,controller=null,folders={},lastSync=0,statusMessage='',initialized=false,connecting=false;
 const valid=()=>connected&&session&&session.expiresAt>Date.now()+10000;
 const authError=()=>Object.assign(Error('Google 연결이 만료되었습니다. 재연결해주세요.'),{auth:true});
 const pauseError=()=>Object.assign(Error('화면으로 돌아오면 이어서 처리합니다.'),{paused:true});
 const quote=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
 function keepSession(){try{if(session)sessionStorage.setItem('scene-drive-session',JSON.stringify(session));else sessionStorage.removeItem('scene-drive-session')}catch{}}
 function expire(){session=null;keepSession();statusMessage='Google 연결이 만료되었습니다. 재연결하면 대기 작업을 이어갑니다.'}
 async function api(path,options={}){
  if(!valid())throw authError();if(document.hidden||!navigator.onLine)throw pauseError();
  const url=path.startsWith('https://')?path:API+path;
  if(!url.startsWith(API+'/')&&!url.startsWith(UPLOAD+'/'))throw Error('잘못된 Drive 요청 주소');
  controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),90000);
  try{
   const response=await fetch(url,{...options,headers:{Authorization:'Bearer '+session.accessToken,...options.headers},signal:controller.signal});
   if(response.status===401)throw authError();
   if(!response.ok&&response.status!==308){let message='Drive 요청 실패 ('+response.status+')';try{message=(await response.json()).error?.message||message}catch{}throw Object.assign(Error(message),{status:response.status})}
   return response;
  }catch(err){if(err.name==='AbortError'&&(document.hidden||!connected||!navigator.onLine))throw pauseError();throw err}
  finally{clearTimeout(timeout);controller=null}
 }
 async function json(path,options={}){const response=await api(path,options);return response.status===204?{}:response.json()}
 const metadata=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 async function list(q,fields='id,name,parents,appProperties,trashed'){
  const all=[];let next='';do{const p=new URLSearchParams({q,spaces:'drive',pageSize:'1000',fields:`nextPageToken,files(${fields})`});if(next)p.set('pageToken',next);const r=await json('/files?'+p);all.push(...(r.files||[]));next=r.nextPageToken||''}while(next);return all;
 }
 async function newId(){return (await json('/files/generateIds?count=1&space=drive&type=files')).ids[0]}
 async function getFile(id){try{return await json('/files/'+encodeURIComponent(id)+'?fields=id,name,parents,trashed,appProperties')}catch(e){if(e.status===404)return null;throw e}}
 async function persistFolders(){await SceneData.setSetting('drive-folders:'+session.accountId,folders)}
 async function folder(key,name,parent){
  let state=folders[key],file=state?.confirmed?{id:state.id,name:state.name}:null;
  if(!file){
   if(state?.id)file=await getFile(state.id);
   if(!file){const found=await list(`trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='sceneBoxFolder' and value='${quote(key)}' }${parent?` and '${quote(parent)}' in parents`:''}`);file=found[0]}
   if(!file){const id=state?.id||await newId();folders[key]={id,name,confirmed:false};await persistFolders();try{file=await json('/files?fields=id,name',metadata('POST',{id,name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{}),appProperties:{sceneBoxFolder:key}}))}catch(e){if(e.status===409)file=await getFile(id);else throw e}}
  }
  if(!file||file.trashed)throw Error('Drive 폴더가 휴지통에 있습니다. 복원 후 다시 시도해주세요.');
  if(file.name!==name)await json('/files/'+file.id+'?fields=id,name',metadata('PATCH',{name}));
  folders[key]={id:file.id,name,confirmed:true};await persistFolders();return file.id;
 }
 async function baseFolders(){const root=await folder('root','SCENE BOX');for(const name of SceneDriveRules.order)await folder('member:'+name,name,root);await folder('group','단체',root);await folder('multi','2인 이상',root);await folder('other','기타',root);return root}
 async function remotePatch(id,values){if(!session||!connected)throw pauseError();const account=session.accountId;await SceneData.patchJob(id,j=>({...j,remotes:{...j.remotes,[account]:{...j.remotes?.[account],...values}}}))}
 async function chooseName(x,remote,parent,capturedAt,firstSyncAt){
  const {prefix,ext}=SceneDriveRules.nameParts(x,SceneCategories.all(),capturedAt,firstSyncAt);
  if(remote.name&&remote.nameKey===prefix+'.'+ext&&remote.parent===parent)return remote.name;
  const files=await list(`trashed = false and '${quote(parent)}' in parents`,'id,name');const names=new Set(files.filter(f=>f.id!==remote.fileId).map(f=>f.name));
  let n=1,name;do{name=prefix+String(n++).padStart(3,'0')+'.'+ext}while(names.has(name));return name;
 }
 async function upload(job,x,remote,body){
  const version=x.hash||x.contentVersion;
  let url=remote.uploadVersion===version?remote.uploadUrl:null,offset=0;
  if(url){
   try{const probe=await api(url,{method:'PUT',headers:{'Content-Range':'bytes */'+x.blob.size}});if(probe.status===200||probe.status===201){await remotePatch(job.id,{uploadedVersion:version,uploadUrl:null});return}offset=Number(probe.headers.get('Range')?.match(/-(\d+)$/)?.[1]??-1)+1}
   catch(e){if(e.status===404||e.status===410)url=null;else throw e}
  }
  if(!url){
   const existing=await getFile(remote.fileId);if(existing?.trashed)throw Error('Drive 원본이 휴지통에 있습니다. 복원 후 다시 시도해주세요.');
   const method=existing?'PATCH':'POST',endpoint=existing?'/files/'+remote.fileId:'/files';
   const response=await api(UPLOAD+endpoint+'?uploadType=resumable&fields=id',{
    ...metadata(method,existing?{name:body.name,appProperties:body.appProperties}:{...body,id:remote.fileId}),
    headers:{'Content-Type':'application/json','X-Upload-Content-Type':x.blob.type||'application/octet-stream','X-Upload-Content-Length':String(x.blob.size)}
   });url=response.headers.get('Location');if(!url)throw Error('Drive 업로드 세션 주소를 받지 못했습니다.');
   await remotePatch(job.id,{uploadUrl:url,uploadVersion:version});
  }
  do{
   if(document.hidden||!connected||!navigator.onLine)throw pauseError();
   const end=Math.min(offset+CHUNK,x.blob.size),range=x.blob.size?`bytes ${offset}-${end-1}/${x.blob.size}`:'bytes */0';
   const r=await api(url,{method:'PUT',headers:{'Content-Type':x.blob.type||'application/octet-stream','Content-Range':range},body:x.blob.slice(offset,end)});
   if(r.status===200||r.status===201){await remotePatch(job.id,{uploadedVersion:version,uploadUrl:null});return}
   const next=Number(r.headers.get('Range')?.match(/-(\d+)$/)?.[1]??-1)+1;if(next<=offset)throw Error('Drive 업로드 진행 위치를 확인할 수 없습니다.');offset=next;
  }while(offset<x.blob.size);
  throw Error('Drive 업로드 완료 응답을 받지 못했습니다.');
 }
 async function syncFile(job,root){
  const x=await SceneData.photo(job.id);if(!x)return;
  const account=session.accountId;let remote=job.remotes?.[account]||{};
  const firstSyncAt=job.firstSyncAt||Date.now();await SceneData.patchJob(job.id,j=>({...j,firstSyncAt:j.firstSyncAt||firstSyncAt}));
  let parent=root;for(const route of SceneDriveRules.route(x,SceneCategories.all()))parent=await folder(route.key,route.name,parent);
  let file=remote.fileId?await getFile(remote.fileId):null;
  if(file?.trashed)throw Error('Drive 파일이 휴지통에 있습니다. 자동 재생성하지 않습니다. 복원 후 재시도해주세요.');
  if(!file&&!remote.fileId){const found=await list(`trashed = false and appProperties has { key='sceneBoxId' and value='${quote(x.id)}' }`);file=found[0];if(file){remote={...remote,fileId:file.id,uploadedVersion:file.appProperties?.sceneBoxContent};await remotePatch(job.id,remote)}}
  if(!remote.fileId){remote.fileId=await newId();await remotePatch(job.id,{fileId:remote.fileId})}
  const capturedAt=x.capturedAt||await SceneDriveRules.captureDate(x.blob);
  const name=await chooseName(x,remote,parent,capturedAt,firstSyncAt),parts=SceneDriveRules.nameParts(x,SceneCategories.all(),capturedAt,firstSyncAt);
  await remotePatch(job.id,{name,nameKey:parts.prefix+'.'+parts.ext,parent});
  const body={name,parents:[parent],appProperties:{sceneBoxId:x.id,sceneBoxContent:x.hash||x.contentVersion}};
  if(!file||remote.uploadedVersion!==(x.hash||x.contentVersion))await upload(job,x,remote,body);
  file=await getFile(remote.fileId);if(!file)throw Error('업로드된 Drive 파일을 확인하지 못했습니다.');
  const params=new URLSearchParams({fields:'id,name,parents'});
  if(!file.parents?.includes(parent)){params.set('addParents',parent);if(file.parents?.length)params.set('removeParents',file.parents.join(','))}
  await json('/files/'+remote.fileId+'?'+params,metadata('PATCH',{name,appProperties:body.appProperties}));
 }
 async function acquireWake(){try{if('wakeLock' in navigator&&!document.hidden)wake=await navigator.wakeLock.request('screen')}catch{}}
 async function releaseWake(){try{await wake?.release()}catch{}wake=null}
 async function renderStatus(){
  if(!initialized)return;const jobs=await SceneData.jobs(),files=jobs.filter(j=>j.kind==='file');
  const counts={pending:0,running:0,success:0,failed:0};for(const j of files)counts[j.state in counts?j.state:'pending']++;
  el('driveCounts').textContent=`대기 ${counts.pending} · 진행 중 ${counts.running} · 성공 ${counts.success} · 실패 ${counts.failed}`;
  el('driveLastSync').textContent='마지막 동기화: '+(lastSync?new Date(lastSync).toLocaleString('ko-KR'):'아직 없음');
  el('driveStatus').textContent=statusMessage||(!window.SCENE_GOOGLE_CLIENT_ID?'Google 클라이언트 ID 설정이 필요합니다. GOOGLE_DRIVE_SETUP.md를 확인해주세요.':valid()?`연결됨 · ${session.email||'Google Drive'}`:connected?'Google 재연결이 필요합니다. 대기열은 보존됩니다.':'Google Drive를 연결하면 자동 업로드를 시작합니다.');
  el('driveConnect').disabled=!tokenClient||connecting||running||valid();el('driveConnect').textContent=valid()?'Google Drive 연결됨':'Google Drive 연결 / 재연결';
  el('driveDisconnect').disabled=!connected&&!session;
  el('driveFailures').innerHTML=jobs.filter(j=>j.state==='failed').map(j=>`<li>${escape(j.kind==='category'?'분류 폴더':items.find(x=>x.id===j.id)?.name||j.id)}: ${escape(j.error||'오류')}</li>`).join('');
 }
 function schedule(delay=200){clearTimeout(timer);if(initialized&&!running&&valid()&&!document.hidden&&navigator.onLine)timer=setTimeout(run,delay)}
 async function processQueue(){
  let root=null;
  while(valid()&&!document.hidden&&navigator.onLine){
   const pending=(await SceneData.jobs()).filter(j=>j.state==='pending'&&(j.nextAt||0)<=Date.now());const job=pending.find(j=>j.kind==='category')||pending[0];if(!job)break;
   if(!wake)await acquireWake();
   await SceneData.patchJob(job.id,j=>({...j,state:'running'}));
   try{
    if(!root)root=await baseFolders();
    if(job.kind==='category'){const c=SceneCategories.all().find(c=>c.id===job.id.slice(9));if(c)await folder(c.id==='category-other'?'other':'category:'+c.id,c.name,root)}
    else await syncFile(job,root);
    lastSync=Date.now();await SceneData.setSetting('drive-last-sync',lastSync);
    const account=session.accountId;await SceneData.patchJob(job.id,j=>({...j,state:j.revision===job.revision?'success':'pending',completedAccount:account,attempts:0,error:'',completedAt:Date.now()}));
   }catch(e){
    if(e.auth){expire();await SceneData.patchJob(job.id,j=>({...j,state:'pending'}));break}
    if(e.paused||!navigator.onLine||document.hidden||!connected){await SceneData.patchJob(job.id,j=>({...j,state:'pending'}));break}
    await SceneData.patchJob(job.id,j=>{if(j.revision!==job.revision)return {...j,state:'pending'};const attempts=(j.attempts||0)+1;return {...j,attempts,state:attempts>=MAX_ATTEMPTS?'failed':'pending',nextAt:Date.now()+[5000,15000,45000,120000,300000][Math.min(attempts-1,4)],error:e.message}});
   }
  }
 }
 async function run(){
  if(running||!valid()||document.hidden||!navigator.onLine)return;running=true;
  try{if(navigator.locks)await navigator.locks.request('scene-box-drive-upload',{ifAvailable:true},async lock=>{if(lock)await processQueue()});else await processQueue()}
  catch(e){statusMessage=e.message}
  finally{running=false;await releaseWake();await renderStatus();const jobs=await SceneData.jobs(),waiting=jobs.filter(j=>j.state==='pending');if(waiting.length&&valid())schedule(Math.max(1000,Math.min(...waiting.map(j=>j.nextAt||0))-Date.now()))}
 }
 async function acceptToken(response){
  connecting=false;if(response.error){statusMessage='Google 연결을 완료하지 못했습니다: '+response.error;await renderStatus();return}
  try{
   session={accessToken:response.access_token,expiresAt:Date.now()+Number(response.expires_in||3600)*1000,clientId:window.SCENE_GOOGLE_CLIENT_ID};connected=true;
   const about=await json('/about?fields=user(permissionId,emailAddress)');session.accountId=about.user.permissionId;session.email=about.user.emailAddress;
   await SceneData.setSetting('drive-enabled',true);keepSession();folders=await SceneData.setting('drive-folders:'+session.accountId)||{};
   for(const value of Object.values(folders))value.confirmed=false;
   for(const j of await SceneData.jobs())if(j.completedAccount!==session.accountId||j.state==='running')await SceneData.patchJob(j.id,x=>({...x,state:'pending',attempts:0,nextAt:0}));
   statusMessage='';schedule();
  }catch(e){session=null;keepSession();statusMessage='Google 연결 확인 실패: '+e.message}
  await renderStatus();
 }
 function loadGoogle(){
  if(!window.SCENE_GOOGLE_CLIENT_ID)return;
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{tokenClient=google.accounts.oauth2.initTokenClient({client_id:window.SCENE_GOOGLE_CLIENT_ID,scope:SCOPE,callback:acceptToken,error_callback:e=>{connecting=false;statusMessage='Google 연결이 취소되었거나 창을 열지 못했습니다.';renderStatus()}});renderStatus()};
  script.onerror=()=>{statusMessage='Google 로그인 모듈을 불러오지 못했습니다. 인터넷 연결 후 앱을 다시 열어주세요.';renderStatus()};document.head.append(script);
 }
 async function init(){
  initialized=true;connected=!!await SceneData.setting('drive-enabled');lastSync=await SceneData.setting('drive-last-sync')||0;
  try{const cached=JSON.parse(sessionStorage.getItem('scene-drive-session')||'null');if(cached?.clientId===window.SCENE_GOOGLE_CLIENT_ID&&cached.expiresAt>Date.now()+10000&&cached.accountId)session=cached}catch{}
  if(session){folders=await SceneData.setting('drive-folders:'+session.accountId)||{};for(const f of Object.values(folders))f.confirmed=false}
  for(const j of await SceneData.jobs())if(j.state==='running')await SceneData.patchJob(j.id,x=>({...x,state:'pending'}));
  el('driveSyncBtn').onclick=()=>{renderStatus();el('driveDialog').showModal()};el('closeDrive').onclick=()=>el('driveDialog').close();
  el('driveConnect').onclick=()=>{if(!tokenClient||connecting)return;connecting=true;statusMessage='Google 연결 중…';renderStatus();tokenClient.requestAccessToken({prompt:'',...(session?.email?{hint:session.email}:{})})};
  el('driveDisconnect').onclick=async()=>{connected=false;clearTimeout(timer);controller?.abort();session=null;keepSession();await SceneData.setSetting('drive-enabled',false);statusMessage='연결을 해제했습니다. 로컬 자료와 Drive 파일은 유지됩니다.';await releaseWake();renderStatus()};
  el('driveRetry').onclick=async()=>{for(const j of await SceneData.jobs())if(j.state==='failed')await SceneData.patchJob(j.id,x=>({...x,state:'pending',attempts:0,nextAt:0,error:''}));statusMessage='';schedule();renderStatus()};
  window.addEventListener('scene-data-change',()=>{renderStatus();schedule()});window.addEventListener('online',()=>{statusMessage='';schedule()});window.addEventListener('offline',()=>controller?.abort());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){controller?.abort();releaseWake()}else{schedule();renderStatus()}});
  loadGoogle();await renderStatus();schedule();
 }
 return {init,renderStatus,run};
})();
