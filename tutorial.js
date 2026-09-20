/* Local-only help. Opening the tutorial never imports, edits, or uploads files. */
window.SceneTutorial=(()=>{
 const key='scene-box-tutorial-seen-v1';
 const steps=[
  {title:'내 사진을 모으는 SCENE BOX',lead:'사진과 영상을 등록하고, 멤버와 행사별로 정리해 보세요.',sample:'등록 → 분류 → 이름 정리 → 백업',body:'사진은 현재 기기의 브라우저에 저장됩니다. 다른 기기에 자동으로 나타나지는 않아요. 처음에는 사진 몇 장으로 시작해 보세요.'},
  {title:'사진·영상 등록',lead:'화면 위쪽의 사진·GIF·영상 추가 영역을 눌러주세요.',sample:'여러 파일 선택 → 멤버·촬영일·활동 입력 → 저장',body:'컴퓨터에서는 파일을 끌어다 놓아도 됩니다. 멤버는 여러 명을 선택할 수 있고, 단체도 지정할 수 있어요. 나중에 분류를 바꿔도 됩니다.'},
  {title:'멤버와 자료 분류',lead:'멤버와 자료 분류는 따로 선택합니다.',sample:'멤버: 메이  /  자료 분류: 버블  /  활동: TMA',body:'자료 분류 끝의 +로 원하는 분류를 추가하세요. 관리 → 자료 분류 관리에서 이름 변경·삭제와 ↑↓ 순서 변경을 할 수 있어요. 사진을 누르면 크게 보고, 사진 아래 제목 영역을 누르면 정보를 수정합니다.'},
  {title:'여러 장을 한 번에 수정',lead:'사진의 체크박스를 누르거나 사진을 길게 눌러 선택하세요.',sample:'자료 선택 → 하단 메뉴 → 날짜·행사 지정',body:'이후 다른 사진을 누르면 추가로 선택됩니다. 멤버·자료 분류도 하단 메뉴에서 바꿀 수 있어요. 날짜·행사 지정은 입력한 항목만 변경하고, 빈 항목은 기존 값을 유지합니다. 취소를 누르면 선택을 끝냅니다.'},
  {title:'분류한 뒤 이름 정리',lead:'메인 맨 위의 이름 바꾸기를 눌러주세요.',sample:'260919_TMA_메이_001.jpg',body:'선택 여부와 관계없이 전체 자료의 날짜·행사·멤버로 이름을 만들어요. 행사가 없으면 일반, 촬영일이 없으면 등록일을 사용합니다. 미리보기를 확인한 뒤 전체 적용을 누르세요. Drive가 연결되어 있으면 이름도 맞춥니다.'},
  {title:'찾기·공유·내려받기',lead:'검색과 멤버·자료 분류 버튼으로 원하는 사진을 찾아보세요.',sample:'선택 공유  /  선택 다운  /  ★ 최애',body:'사진 랜덤으로 순서를 섞을 수 있어요. 선택 공유는 지원되는 휴대폰에서 카톡 등으로 원본을 보냅니다. 선택 다운은 선택한 자료를 ZIP으로 저장해요. 별을 누르면 최애로 모아 볼 수 있습니다.'},
  {title:'백업하고 오래 보관하기',lead:'관리 → 전체 백업으로 원본과 분류를 함께 저장하세요.',sample:'전체 백업 = 원본 + 분류  /  목록 CSV = 목록만',body:'백업 복원으로 저장한 자료를 다시 불러올 수 있습니다. 앱 삭제나 브라우저 사이트 데이터 삭제 전에 백업을 보관하세요. 화면 오른쪽 위 저장 용량은 등록한 원본 사진·영상의 합계입니다.'},
  {title:'Google Drive는 원할 때 연결',lead:'관리 → Google Drive 동기화에서 본인 계정으로 연결하세요.',sample:'SCENE BOX → 내 Drive · 최대 20개 동시 업로드',body:'기존 자료도 자동 업로드됩니다. 앱을 화면에 열어두어야 진행되며, 돌아오면 재개합니다. 연결이 만료되면 재연결, 실패 항목은 재시도를 누르세요. 로컬 삭제는 Drive 삭제로 이어지지 않아요. SCENE BOX 폴더를 지우면 앱이 복구합니다. Drive에서 사진을 가져오는 기능은 아닙니다.'}
 ];
 let page=0,dialog;
 const el=id=>document.getElementById(id);
 function render(){const s=steps[page];el('tutorialProgress').textContent=(page+1)+' / '+steps.length;el('tutorialTitle').textContent=s.title;el('tutorialLead').textContent=s.lead;el('tutorialSample').textContent=s.sample;el('tutorialBody').textContent=s.body;el('tutorialPrev').disabled=page===0;el('tutorialNext').textContent=page===steps.length-1?'시작하기':'다음';el('tutorialContent').scrollTop=0}
 function mark(){try{localStorage.setItem(key,'yes')}catch{}}
 function open(){page=0;render();dialog.showModal();mark()}
 function init(isEmpty){
  dialog=el('tutorialDialog');el('tutorialBtn').onclick=open;
  el('tutorialPrev').onclick=()=>{if(page>0){page--;render()}};
  el('tutorialNext').onclick=()=>{if(page<steps.length-1){page++;render()}else dialog.close()};
  el('tutorialClose').onclick=()=>dialog.close();
  let seen=true;try{seen=!!localStorage.getItem(key)}catch{}
  if(isEmpty&&!seen)open();
 }
 return {init,open};
})();
