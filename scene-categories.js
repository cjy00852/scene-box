window.SceneCategories=(()=>{
 let categories=[];
 const el=id=>document.getElementById(id),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const all=()=>categories.map(c=>({...c}));
 const ids=x=>Array.isArray(x.categoryIds)?x.categoryIds:SceneData.legacyCategories(x);
 const names=x=>ids(x).map(id=>categories.find(c=>c.id===id)?.name).filter(Boolean);
 function options(selected=[]){return categories.map(c=>`<option value="${escape(c.id)}" ${selected.includes(c.id)?'selected':''}>${escape(c.name)}</option>`).join('')}
 function fill(id,selected=[]){el(id).innerHTML=options(selected)}
 function read(id){return [...el(id).selectedOptions].map(o=>o.value)}
 function refresh(){
  MEMBER_FILTERS=['미분류',...ASSIGNABLE,'단체',...categories.map(c=>'category:'+c.id)];
  const selected=el('categoryView').value;
  el('categoryView').innerHTML='<option value="all">모든 자료 분류</option><option value="none">사용자 분류 없음</option>'+categories.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option><option value="exclude:${escape(c.id)}">${escape(c.name)} 제외</option>`).join('');
  if([...el('categoryView').options].some(o=>o.value===selected))el('categoryView').value=selected;
  for(const id of ['importCategories','editCategories','bulkCategories'])fill(id,read(id));
  el('categoryList').innerHTML=categories.map(c=>`<div class="category-row" data-category-id="${escape(c.id)}"><span>${escape(c.name)}</span>${c.id==='category-other'?'<small>기본 분류</small>':'<button class="btn" data-action="rename">이름 변경</button><button class="btn danger" data-action="delete">삭제</button>'}</div>`).join('');
 }
 function label(filter){return filter.startsWith('category:')?categories.find(c=>c.id===filter.slice(9))?.name||'기타':filter}
 function validName(name,except){
  name=String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ');
  if(!name||name.length>60)throw Error('분류 이름을 1~60자로 입력해주세요.');
  if(/[\\/\u0000-\u001f]/.test(name))throw Error('분류 이름에는 슬래시나 제어 문자를 사용할 수 없습니다.');
  if(categories.some(c=>c.id!==except&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('같은 이름의 분류가 있습니다.');
  if(['SCENE BOX','2인 이상','원이','리브','미나미','메이','제나','단체'].includes(name))throw Error('멤버·기본 폴더와 다른 이름을 사용해주세요.');
  return name;
 }
 async function commit(next,deleted){await SceneData.saveCategories(next,deleted);categories=next;refresh();await load()}
 async function quickAdd(){const entered=prompt("새 사용자 분류 이름");if(entered===null)return;try{const name=validName(entered);await commit([...categories,{id:crypto.randomUUID(),name}])}catch(e){alert(e.message)}}
 async function init(){
  categories=await SceneData.setting(SceneData.categoryKey);refresh();
  el('categoryManagerBtn').onclick=()=>{refresh();el('categoryDialog').showModal()};
  el('closeCategories').onclick=()=>el('categoryDialog').close();
  el('addCategory').onclick=async()=>{try{const name=validName(el('categoryName').value);await commit([...categories,{id:crypto.randomUUID(),name}]);el('categoryName').value=''}catch(e){alert(e.message)}};
  el('categoryList').onclick=async e=>{
   const action=e.target.dataset.action,row=e.target.closest('[data-category-id]');if(!action||!row)return;
   const c=categories.find(c=>c.id===row.dataset.categoryId);if(!c||c.id==='category-other')return;
   try{if(action==='rename'){const entered=prompt('새 분류 이름',c.name);if(entered===null)return;const name=validName(entered,c.id);await commit(categories.map(v=>v.id===c.id?{...v,name}:v))}
    else if(confirm(`‘${c.name}’ 분류를 삭제할까요? 원본 사진·영상은 유지하고 이 분류를 ‘기타’로 바꿉니다. Drive 파일은 삭제하지 않습니다.`)){memberFilters.delete('category:'+c.id);await commit(categories.filter(v=>v.id!==c.id),c.id)}
   }catch(err){alert(err.message)}
  };
  el('bulkApplyCategories').onclick=async()=>{for(const id of selected){const x=items.find(v=>v.id===id);if(x){x.categoryIds=read('bulkCategories');x.bubble=false;x.membership=false;await put(x)}}selected.clear();await load()};
 }
 async function restore(incoming){
  const map={},next=all();if(!Array.isArray(incoming))return map;
  for(const c of incoming){if(!c||typeof c.id!=='string'||typeof c.name!=='string')continue;
   const normalized=c.name.normalize('NFKC').trim().replace(/\s+/g,' ');
   const byId=next.find(v=>v.id===c.id),byName=next.find(v=>v.name.normalize('NFKC').toLocaleLowerCase()===normalized.toLocaleLowerCase());
   if(byId){map[c.id]=byId.id;continue}if(byName){map[c.id]=byName.id;continue}
   const name=validName(c.name);next.push({id:c.id,name});map[c.id]=c.id;
  }
  await SceneData.saveCategories(next);categories=next;refresh();return map;
 }
 return {init,quickAdd,all,ids,names,fill,read,label,restore,refresh,validName};
})();
