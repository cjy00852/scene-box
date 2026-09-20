SCENE BOX v12 — GitHub Pages용

추가 기능
- 사진/JPG/PNG/WEBP/GIF 업로드
- 동영상 MP4/WEBM/MOV/M4V 업로드 및 재생
- 사진/GIF/동영상 필터
- 동영상 원본 다운로드, ZIP 백업/복원
- 페이지당 50/100/200개 표시

GitHub 저장소 루트에 이 압축 안의 파일을 덮어쓰기 업로드한 뒤 Commit changes를 누르세요.

저장 용량 · 사용자 분류 · Drive 자동 업로드
- 우측 상단에 등록된 원본 파일의 총용량 표시
- 관리 메뉴에서 사용자 분류 추가/이름 변경/삭제
- Google Drive 연결 후 앱이 열려 있는 동안 자동 업로드 및 중단 작업 재개
- 기존 IndexedDB 자료와 분류는 최초 실행 시 보존하여 마이그레이션
- Google 설정 방법과 동작 범위: GOOGLE_DRIVE_SETUP.md
- 클라이언트 ID 입력 위치: google-config.js
- 핵심 브라우저 테스트: npm install 후 npm test (상세 실행 방법은 설정 문서 참고)

분류 빠른 추가 · 날짜/행사 일괄 수정
- 플챗 멤버십 옆 + 버튼으로 사용자 분류 추가 (이름 변경/삭제는 관리 메뉴)
- 복수 선택 → 전체 선택 또는 개별 선택 → 일괄 수정
- 전체 선택은 현재 검색/분류 결과의 모든 페이지를 대상으로 함
- 날짜/행사 중 입력한 값만 변경하며 비워 둔 항목은 기존 값 유지
- Google 연결 없는 해당 기능 테스트: npm run test:local-edit
