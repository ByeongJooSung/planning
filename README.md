# Planning Studio

요구사항에서 출발해 서비스 기획 산출물(기획안 → 정보구조도 → 다이어그램 → 스토리보드 → 프로토타입)을 프로젝트 단위로 만들고 관리하는 도구입니다.

## 문서
- [PRD (제품 요구사항 정의서)](docs/PRD.md)
- [작업 계획서](docs/WORK_PLAN.md)
- [ADR-001 P0 기반 구조 결정](docs/decisions/ADR-001-p0-foundation.md)
- [ADR-002 참조자료·Task 자동 생성·디자인 시스템·뷰어](docs/decisions/ADR-002-knowledge-design-viewer.md)
- [ADR-003 웹 서비스 — 계정·프로젝트 멤버·AI 호출 설정](docs/decisions/ADR-003-web-service.md)

## 현재 단계: P0 완료 + 선행 1~3
- 기획 데이터 모델(시스템 구분·요구사항·Task·디자인 시스템)과 JSON Schema
- 파일 기반 프로젝트, 시스템 구분 프리셋, 버전 스냅샷·Diff
- 요구사항 추적표(RTM): 요구사항별 / 요구사항 × 시스템 / 화면 역추적, 단계별 누락·근거 없는 산출물 검사
- 참조자료 지식베이스: 파일 올리기·색인·검색 (txt, md, csv, json, html, eml, docx, pdf)
- 요구사항 등록 시 시스템별 Task 자동 생성(규칙 기반) 또는 수동 생성
- 시스템별 디자인 시스템: 컨셉 3종 제안 → 선택 → 생성 → 컴포넌트 추가
- 뷰어: 프로젝트 목록 → 프로젝트 상세 → Task 상세(플로우·화면설계서·프로토타입), 통합 산출물
- 설계 화면 실제 규격(1920×1080) 고정 배치 후 축소 표시 — 줄바꿈 없음
- AI 요청: 화면설계서·정보구조도·프로토타입·디자인 시스템별 Figma 그리기 / Claude 요청 프롬프트(참조 URL·참조자료 근거 포함)
- AI 생성·미세조정: 정보구조도·화면설계서·프로세스 플로우 1차 생성 → 후속 프롬프트로 미세조정 → 적용. 디자인 시스템 미세조정은 이를 쓰는 모든 화면에 컴포넌트 단위로 일괄 반영
- Gemini(Google Cloud OAuth): AI 연결 종류 ‘Gemini · Google OAuth’ — 내 Google Cloud 프로젝트의 OAuth 클라이언트로 로그인해 Gemini API 호출(리프레시 토큰·시크릿 암호화 저장, 사용량은 그 프로젝트 기준). 준비 단계와 리디렉션 URI는 연결 화면에 표시. 일반 API 키 방식(Gemini 프리셋)도 지원
- 프로세스 플로우 캔버스: 전체 화면 편집기(도형 7종·연결·레인 도구, 끌어 옮기기, 두 번 눌러 글자 고치기, 되돌리기, 자동 정렬) · 글자 수에 맞춘 도형 크기·직각 연결선·범례 · ‘✦ AI’ 탭에서 AI가 같은 도구로 그리기·고치기 · PDF/PPTX(편집 가능)/PNG/SVG 내보내기, Figma용 SVG·AI 프롬프트 복사
- 산출물 작업 상태: 정보구조도·화면설계서·프로세스 플로우·디자인 시스템마다 미진행 → 진행중(AI 생성·적용 포함) → 완료(작업자 검토) → 재검토 필요(완료 후 요구사항·기능 명세·디자인 개정이 바뀌면 자동). RTM 설계완료는 완료된 화면설계서만 셈
- 프로토타입 통합본: 시스템 구분별로 모든 화면을 메뉴 순서대로 이어 클릭해 보고, 아래에 진행 순서(요구사항 → 정보구조도 → 디자인 → 화면설계서 → 플로우 → 통합본)와 지금 할 일·재검토 목록
- 기능 명세 편집: 요구사항·Task 화면과 요구사항 추적표에서 요구사항별 기능 명세를 보고 저장(참조자료 초안 넣기). 화면설계서 항목은 직접 편집·추가·삭제하고, ‘AI 설명’으로 항목 하나 또는 화면 전체의 설명·옵션·유효성만 다시 쓰기(항목·와이어프레임은 유지)
- 디자인 시스템 AI 제안: 시스템 성격·사용자·참조 URL·참조자료·다른 시스템 디자인을 읽고 컨셉 3종을 생성(값 검증·글자 대비 자동 보정). 확정 후에는 후보로 추가하고 ‘이 컨셉으로 교체’로 바꿀 수 있음. 섹션별 조정은 값 형식 안내를 넣고, 바뀌는 것이 없으면 이유를 알려 한 번 더 받아 옴
- 샘플 프로젝트: 카드에 ‘샘플’ 표시, 운영자는 카드에서 삭제하거나 샘플을 한 번에 삭제(삭제한 샘플은 다시 생기지 않음)
- 정보구조도 캔버스: 시스템별 전체 화면 사이트맵(메뉴·화면·팝업, 화면 ID·Task 수·화면설계서 상태 표시) · 끌어서 하위로 옮기기·순서 바꾸기, 두 번 눌러 이름 고치기, 접기·펼치기, 되돌리기 · 새 화면 ID는 저장할 때 화면 ID 규칙으로 부여 · 화면마다 Task 체크로 직접 연결 · ‘✦ AI’ 탭으로 구조 고치기 · PDF/PNG/SVG 내보내기
- 정보구조도 표(엑셀) 보기: 트리 ↔ 표 전환, 1~N Depth·화면기능·구분·화면 ID·게시판 유형·로그인·페이지 본수·기획/디자인/퍼블/개발 진행·개발 필요·비고·의사결정을 칸에서 바로 편집, 시스템별 시트로 .xlsx 내려받기
- 채널 관리: 웹(PC)·모바일·태블릿(추가·변경 가능)을 표 오른쪽에 고정해 화면마다 지원 여부와 채널별 테스트 결과(통과/전체)를 함께 관리 · 캔버스 속성 패널에서도 지정
- 테스트: 정보구조도 화면 기준 테스트 케이스(기능·UI·예외·권한·연계) · 화면설계서(필수·길이·형식·메시지·선택지·이동)와 Task로 초안 생성, ✦ AI 케이스 작성 · 채널별 결과(통과·실패·보류·해당없음)와 담당자·일시 기록 · 채널별 진척 현황판 · 테스트 시트 .xlsx 내려받기
- 시스템별 테스트 기기(옵션): 시스템마다 테스트할 기기를 고르거나(예: 대국민 웹·모바일·태블릿, 관리자 웹만) ‘기기 구분 없이’ 결과 한 칸으로 기록
- Task·요구사항 수정: 요구사항 화면의 ✎로 Task의 시스템·행위자·처리 내용·선행·상태·화면 없는 사유를 고치고(ID·화면 연결 유지), 요구사항 제목·설명도 수정
- 화면설계서 AI 미세조정: 모델이 바뀐 항목만 보내거나 한 겹 싸서 보내도 components로 모아 이전 버전에 합치고, 배열이 없으면 한 번 다시 받음 (빈 버전을 저장하지 않음)
- 화면설계서 화면 표현: 본문 영역 기준으로 잘라 크게 표시, 이어지는 입력 항목은 실제 신청 화면처럼 항목명·입력칸 폼 표로, 제목 줄 버튼(placement:"title"), 목록 표/카드 항목별 선택(view) · 설명 번호는 화면 배율에 맞춰 크기가 바뀜 · Description 패널(번호·항목·설명, 옵션·유효성은 설명 아래) · AI 결과 미리보기도 같은 캔버스로
- 디자인 시스템 미선택 시 화면설계서: 미리보기·AI 요청은 기본 컨셉(첫 제안)으로 그리고, 적용·항목 저장·빈 화면설계서 만들기 때 그 컨셉으로 디자인 시스템을 자동 선택(안내 표시, 나중에 변경 가능) · AI가 디자인 시스템에 없는 컴포넌트 이름(Table, text_field 등)을 쓰면 가까운 컴포넌트로 바꾸고, 못 찾은 항목만 글로 표시(화면 전체 반영을 막지 않음)
- Claude로 만들기: AI 설정의 ‘Claude (API 키)’ 연결(기본 claude-opus-5, 추론·스트리밍)로 버튼 한 번에 생성하거나, Claude Pro·Max 구독은 AI 생성 창의 ‘Claude 구독(claude.ai)으로 만들기’로 프롬프트 복사 → claude.ai에서 생성 → 답 붙여넣기(코드 블록·설명이 섞여도 JSON만 꺼내 새 버전으로). 구독 로그인 연동은 Anthropic 정책상 지원하지 않음
- Task 없이 만들기: 정보구조도는 시스템 설명·요구사항·참조자료로 메뉴를 설계(taskIds 비움), 프로세스 플로우는 Task 없는 요구사항에서도 캔버스로 그리거나 AI로 생성, 디자인 컨셉·화면설계서는 Task와 무관
- 디자인 시스템 직접 편집: 색 11종·글꼴(Pretendard 등)·글자 크기·모서리·입력칸/표 행 높이·본문 폭·그림자·레이아웃 8항목을 폼으로 바꿔 새 개정(이력 ‘직접 편집’)
- 디자인 시스템 프레임 편집기(피그마식): 프레임(오토 레이아웃 가로·세로·간격·패딩·정렬·줄바꿈 / 위치 지정)·텍스트·사각형·원·선·아이콘·인스턴스, 크기 고정·내용에 맞춤·채우기, 색·글자 크기·모서리를 디자인 토큰에 연결, 텍스트 props 연결(label·title 등), 레이어 패널·끌어 옮기기/순서 바꾸기·크기 손잡이·되돌리기 · 저장한 컴포넌트는 화면설계서·프로토타입에서 바로 사용, 기본 컴포넌트 모양도 바꾸거나 되돌릴 수 있음
- Figma로 내보내기: 토큰 → Figma 변수, 프레임 컴포넌트 → 오토 레이아웃·변수가 연결된 Figma 컴포넌트(Scripter용 스크립트 · 내려받는 플러그인 · Figma MCP용 Claude 프롬프트), 토큰 JSON(DTCG)
- 프레임 편집기 확장: 변형(기본·비활성·오류 등 이름별 모양, 화면설계서 항목에서 변형 선택), 인스턴스 덮어쓰기(변형·글자 props·채우기), 레이어 숨김, 여러 개 선택(Shift — 묶기·복제·삭제·정렬·색 한꺼번에), ✦ AI로 컴포넌트 그리기·고치기(토큰·컴포넌트·아이콘 규칙 포함, claude.ai 붙여넣기 지원)
- 화면설계서 캔버스 편집 도구: 화면의 항목을 누르면 편집 도구(✎ 모양 편집 · 내용 · 설명·컴포넌트 · 순서 · 복제 · 삭제), 두 번 누르면 바로 모양 편집 · 모양 편집은 지금 그려진 모양을 프레임(오토 레이아웃·토큰)으로 옮긴 초안에서 시작해 이 화면의 이 항목만 바꿈(ui.tree, 디자인 시스템은 그대로 · ‘기본 모양으로’ 되돌리기 · AI 재생성에도 유지) · 내용 편집은 표의 열·행, 탭·버튼·선택지 같은 값을 줄 단위로 · ‘+ 새 항목 그리기’로 빈 프레임부터 그려 항목 추가
- 수정 요청의 정확도(프레임 단위): 화면설계서 AI 미세조정에서 ‘고칠 항목’ 번호를 고르면 그 항목만 바뀌고 나머지는 이전 버전 그대로 잠금(새 항목은 요청에 ‘추가’가 있을 때만) · 캔버스 항목 도구 ‘✦ AI로 이 항목만’ · 프레임 편집기 ‘선택한 요소만 고치기’(그 요소 자리만 교체) · AI 결과의 null options·props·글자 번호도 서버와 같은 규칙으로 정리해 미리보기·검사가 깨지지 않음
- 기능 요구사항 충족 점검: 화면에 연결된 Task의 요구사항 기능 명세 줄과 Task 문장을 ‘요구 줄’로 삼아, 화면설계서 항목이 모두 반영했는지 표시(AI가 답한 coverage → 직접 지정 → 글자 겹침 자동 추정) · 미반영 줄은 ‘✦ 보완’으로 그 요구를 만족하는 항목을 추가·수정하는 AI 요청을 바로 열고, ‘지정’으로 반영 항목을 직접 매핑하거나 ‘해당 없음’ 표시 · 생성 결과 검사에도 미반영 건수 경고
- 정보구조도 캔버스 세로(사이트맵) 배치: 1단계 메뉴를 가로로, 하위 화면은 아래로 — 화면이 많아도 폭을 다 씀 · 가로/세로 전환 기억 · 폭 기준 맞춤 · 좁은 화면에서 캔버스가 전체 폭
- 디자인 시스템 프레임 편집: 기본 컴포넌트를 처음 열면 지금 그려지는 모양을 프레임 노드로 옮긴 초안에서 시작(요소 위치로 오토 레이아웃·간격·패딩·정렬 추정, 색·글자 크기·모서리는 토큰으로) · 내용에 맞춤(hug) 글자는 피그마 Auto width처럼 한 줄
- 대시보드 ‘지금 할 일’: 시스템마다 진행 순서에서 아직 끝나지 않은 첫 단계와 대상 화면을 보여 주고 바로 이동(재검토 필요는 강조)
- 산출물 내려받기: 요구사항 추적표 xlsx(요구사항별 Task · 요구사항×시스템 매트릭스) · 화면설계서 PPTX(화면 이미지 + 편집 가능한 Description 표, 화면마다 한 장, 항목이 많으면 계속 슬라이드, 표지 목차)·PDF·인쇄용 HTML(시스템 전체 또는 화면 하나) · 프로토타입 HTML 한 파일(메뉴 목록·클릭 이동·확인 창·오류 문구가 동작, 브라우저에서 바로 열기) · 대시보드 ‘산출물 내려받기’에서 시스템별 정보구조도 xlsx·화면설계서·프로토타입·테스트 xlsx·디자인 토큰을 한눈에, ‘패키지(zip)’로 플로우 PPTX·SVG까지 한 번에 묶기(README 포함)
- 디자인 시스템 단계: ① 톤앤매너·CSS(컨셉 글 · 색·글꼴·모서리·간격 토큰 · 이 시스템 와이어프레임에만 적용되는 추가 CSS, 저장 전 미리보기) ② UI·UX(컨셉 글·사용 원칙 · 메뉴·검색·목록·버튼·밀도 규칙 · 템플릿) ③ 컴포넌트 초안(제작 규칙 · 초안 생성기) ④ 검토·템플릿(댓글·전역 조정·이력) · 단계마다 컨셉을 따로 쓰고 다른 제안 컨셉의 톤이나 구성만 가져와 섞을 수 있음 · 단계별 ✦ AI(연결 또는 claude.ai 붙여넣기) · 단계 컨셉은 화면설계서·컴포넌트 AI 프롬프트에도 실림
- 컴포넌트 초안 생성기: 정보구조도·화면설계서에서 쓰는 요소와 화면 유형(목록·상세·등록·대시보드·메인·로그인·팝업)에 필요한 요소를 모아, 고른 요소를 ‘지금 모양으로’(현재 토큰·CSS 모양을 프레임으로) 또는 ‘✦ AI 초안’(단계 컨셉을 읽고 새로 디자인)으로 한꺼번에 만들기 · 초안 표시 → 프레임 편집기에서 저장하면 완성
- Figma 양방향: 플러그인 메뉴 2개(디자인 시스템을 Figma에 만들기 — 변형은 Component Set, 인스턴스 덮어쓰기 포함 / 선택한 프레임을 Planning Studio로 보내기), Scripter용 내보내기 스크립트, ‘Figma에서 가져오기’(이름·(id)로 맞춰 갱신, 변형 유지), Claude(Figma MCP)용 가져오기 프롬프트
- 화면설계서 메뉴: 시스템별 화면 목록(Task 없는 화면 표시) · 새 화면 추가 · 빈 화면설계서 만들기·항목 순서 바꾸기 · 전체 화면 편집(이전·다음 화면 이동)
- 화면 ↔ Task 수동 연결: 한 Task에 여러 화면(화면설계서), 한 화면에 여러 Task · Task가 없어도 화면 이름·메뉴 위치를 근거로 AI 화면설계서 생성
- 프로세스 플로우는 처음에 화면 폭에 맞춰(핏) 전체가 보이고, 누르면 전체 화면 캔버스로 확대
- 화면설계서 캔버스: 확대·축소, 설명 번호를 끌어 옮기면 위치 저장(연결선 표시), 번호를 누르면 설명 행 강조
- 디자인 시스템 조정: 섹션별(색상·글꼴·간격·모서리·컨트롤·레이아웃·템플릿·컴포넌트) 프롬프트, 이미지 클릭 핀·번호 라벨 댓글로 수정 요청, 전역 프롬프트는 새 컴포넌트용. 누적 적용·되돌리기

- 웹 서비스: 회원가입·로그인, 프로젝트를 만든 사람이 운영자 — 공동 작업자 초대(작업자·열람자·운영자), 화면에서 바로 편집, 프로젝트별·개인별 AI 호출 설정(Claude API 또는 로컬 LLM·OpenAI 호환 API, 키는 암호화·비공개)

## 웹 서비스로 실행
```bash
npm install && npm run build
PLANNING_SECRET=<긴 임의 문자열> node dist/cli.js --root /srv/planning serve --port 8080
# 개발 중: npm run planning -- --root projects serve
```
브라우저로 `http://<서버>:8080` → 회원가입. **첫 가입자**가 데이터 폴더에 이미 있는 프로젝트의 운영자가 됩니다.

| 환경변수 | 설명 |
|---|---|
| `PORT`, `HOST` | 기본 8080, 0.0.0.0 |
| `PLANNING_ROOT` | 데이터 폴더 (프로젝트 + `.service/` 계정·설정) |
| `PLANNING_SECRET` | AI 키 암호화 비밀값. 없으면 `.service/secret.key`를 만든다. 바꾸면 저장한 키를 다시 입력해야 함 |
| `PLANNING_SIGNUP=closed` | 초대받은 이메일만 가입 |
| `PLANNING_ADMINS` | 서비스 관리자 이메일(쉼표 구분). 첫 가입자는 항상 관리자 — 계정 관리 화면에서 회원 목록·삭제 |
| `ANTHROPIC_API_KEY`, `PLANNING_AI_MODEL` | 선택: 서버 기본 AI (프로젝트·개인 설정이 없을 때, 기본 모델 claude-opus-5) |
| `PUBLIC_URL` | 초대 링크 주소 (프록시 뒤에서) |
| `COOKIE_SECURE=1` | HTTPS 뒤에서 Secure 쿠키 |

**AI 연결** — 프로젝트 → 설정 → AI 설정(프로젝트 공통, 운영자가 관리) 또는 내 계정(개인). 연결을 여러 개 저장하고 드롭다운으로 바로 바꿉니다.
1. **+ 연결 추가** → 종류 선택: **NVIDIA**(`https://integrate.api.nvidia.com/v1`, 키 `nvapi-…`), **LM Studio**(`http://<주소>:1234/v1`, 키 없음), Ollama, Anthropic, 직접 입력(OpenAI 호환)
2. API 키는 선택(Anthropic만 필수) → **모델 불러오기** → 쓸 모델을 여러 개 체크(목록에 없으면 직접 입력) → 저장
3. 운영자는 모델 옆 **기본으로**로 프로젝트 기본을 정하고, 멤버는 **나만 바꾸기** 드롭다운이나 AI 생성 창의 드롭다운으로 자기만 바꿉니다.
- 키는 암호화 저장·화면에 다시 안 보임. 프로젝트 연결의 주소·키는 멤버에게 안 보이고 이름·모델만 보입니다.
- 인터넷 배포(Vercel)에서는 `localhost`에 닿지 않습니다. LM Studio·Ollama는 외부에서 접속 가능한 주소(포트 포워딩, cloudflared·ngrok 터널)를 넣거나, 같은 네트워크에서 `planning serve`로 띄우세요.
- 최대 출력 토큰은 연결마다 정할 수 있고(기본 8192), 모델이 그 값을 거부하면 빼고 다시 보냅니다.

**화면설계서 엑셀 양식(기관 제출용)** — 화면설계서 화면의 **엑셀 양식** 버튼, 대시보드 산출물 내려받기의 **xlsx**, 패키지(zip)에 포함. 시트는 화면 목록(시스템·ID·메뉴 위치·유형·템플릿·항목 수·작성/작업 상태·연결 Task·요구사항 ID·요구 반영 n/m), 시스템별 Description 상세(No·항목·유형·UI 컴포넌트·기획/고객 설명·옵션·유효성·안내 메시지·이동 화면), 기능 요구사항 반영 현황(요구 줄별 반영 여부·항목 번호·판정 근거)입니다.

**채널별 화면설계서(모바일·태블릿 뷰포트)** — 화면의 지원 채널(정보구조도 표의 채널 칸, 비어 있으면 시스템 테스트 기기 전부)에 모바일·태블릿이 있으면 캔버스 위에 **PC / 태블릿 / 모바일** 전환이 생깁니다. 같은 화면설계서(항목·설명)를 모바일 390px(햄버거 머리·세로 폼·1열 카드·가로 스크롤 표)·태블릿 1024px 레이아웃으로 다시 그리며, 실제 규격 미리보기·단일 화면 PPTX는 보고 있는 채널로, 화면설계서 메뉴의 **모바일 보기 / 태블릿 보기** PPTX·PDF는 그 채널을 지원하는 화면만 묶어 내보냅니다. 번호 위치 옮기기·새 항목 그리기는 PC 보기에서 합니다.

**버전 간 화면 비교** — 화면설계서 머리의 **⇄ 버전 비교**로 스냅샷 시점과 지금의 화면설계서를 나란히 봅니다(와이어프레임 두 장 + 항목별 추가·삭제·변경, 낱말 단위 <del>이전</del>→<ins>지금</ins>, 번호가 바뀐 항목은 이름으로 짝을 맞춤). 기준 스냅샷은 드롭다운으로 바꾸고, 공유 링크에서도 볼 수 있습니다. 스냅샷은 버전 이력 화면에서 찍습니다.

**읽기 전용 공유 링크** — 프로젝트 → 설정 → 멤버 화면에서 운영자가 **공유 링크 만들기**를 누르면 `/s/<토큰>` 주소가 생깁니다. 링크를 아는 사람은 로그인 없이 모든 산출물(정보구조도·화면설계서·프로토타입·플로우·테스트·버전 이력)과 PPTX·PDF·xlsx 내려받기를 쓸 수 있고, 편집·댓글·AI 생성은 할 수 없습니다. 프로젝트당 하나이며 **링크 새로 만들기**로 예전 링크를 끊거나 **공유 끊기**로 거둘 수 있습니다. 발주처·외부 검토자에게 보여 줄 때 쓰고, 끝나면 끊으세요.

**새 버전 알림** — 새 버전이 배포되면 열려 있는 화면 위에 "새 버전이 배포됐습니다. 작업 중인 내용을 먼저 저장한 뒤 새로고침하세요" 알림이 뜹니다(자동 새로고침 없음, 입력 중인 창이 있으면 한 번 더 확인). 서버가 SSE(`/api/events`)로 버전을 알려 주고 모든 API 응답 머리 `x-app-version`에도 버전이 실립니다. Vercel 함수는 WebSocket을 지원하지 않아 SSE를 씁니다. 탭이 숨겨졌거나 10분간 조작이 없으면 연결을 쉬고, 다시 돌아오면 버전부터 확인합니다. 버전은 Vercel이면 커밋, 그 밖에는 `PLANNING_VERSION` 또는 화면 내용 해시입니다.

### 배포
- **Vercel** (서버리스 + Upstash Redis):
  1. Vercel → Add New → Project → GitHub `byeongjoosung/planning` 가져오기 (Framework: Other — 나머지는 `vercel.json`이 정함)
  2. 프로젝트 → Storage → Marketplace에서 **Upstash for Redis** 만들기 → 이 프로젝트에 연결 (`KV_REST_API_URL`, `KV_REST_API_TOKEN`이 자동으로 들어감)
  3. 선택: Settings → Environment Variables에 `PLANNING_SECRET`(16자 이상, 없으면 첫 실행 때 만들어 Redis에 보관), `ANTHROPIC_API_KEY`, `PLANNING_SIGNUP=closed`
  4. Deployments → Redeploy → `https://<프로젝트>.vercel.app` 접속 → 첫 가입자가 샘플 프로젝트 2개의 운영자
  - 리전: `vercel.json`의 `regions`(현재 도쿄 `hnd1`)를 Upstash 주 저장소 지역과 맞춥니다. `/api/health`의 `kvMs`(Redis 왕복 ms)가 한 자릿수면 맞게 된 것입니다.
  - 한도: 참조자료 한 번에 3MB(Vercel 요청 4.5MB), AI 생성 최대 300초. 로컬 LLM은 Vercel에서 접속할 수 있는 공개 주소여야 합니다(사내망 주소 불가).
- **Docker**: `docker build -t planning-studio . && docker run -p 8080:8080 -v planning-data:/data -e PLANNING_SECRET=… planning-studio` — 데이터 볼륨이 비어 있으면 샘플 프로젝트 2개를 넣습니다(`SEED_EXAMPLES=0`이면 안 넣음).
- **Render**: 이 저장소를 Render에 연결하고 New → Blueprint를 고르면 `render.yaml`대로 웹 서비스와 영구 디스크를 만들고 `https://planning-studio-xxxx.onrender.com` 주소를 줍니다. 만든 뒤 `PUBLIC_URL`을 그 주소로 넣으세요.
- 그 밖에 Docker가 도는 곳(Fly.io, Railway, 사내 서버)이면 같은 이미지로 됩니다. 파일 저장소라 인스턴스는 하나만 띄웁니다.

## 시작하기 (CLI)
```bash
npm install
npm test                      # 테스트
npm run build                 # dist/ 빌드 → node dist/cli.js …
npm run planning -- --help    # 개발 중 실행 (tsx)
```

## 사용 예 — 대국민 정보공개
```bash
alias planning="npm run -s planning --"

planning init PUBINFO --name "정보공개 통합 서비스" --type NEW --preset public-civil --template PUBLIC
planning system add EXT --name "외부 연계" --no-screens

planning req add --title "대국민 정보공개" --source SRC-001:p.14
planning task add REQ-001 --system CVL --actor 민원인 --action "자료 등록 및 공개 신청"
planning task add REQ-001 --system ADM --actor 심사자 --action "검토 후 승인·반려" --after T01
planning task add REQ-001 --system PUB --actor 국민 --action "공개 목록·상세 조회" --after T02

planning kb add 제안요청서.pdf 회의록.txt   # 참조자료 → 프로젝트 지식
planning kb search 반려 사유
planning req add --title "정보공개 청구" --desc "민원인이 신청하면 심사자가 승인·반려하고 문자로 알린다" --auto-tasks
planning task suggest REQ-002          # 자동 생성 미리보기
planning design propose CVL            # 시스템별 디자인 컨셉 3종
planning design select CVL A           # 선택 → 디자인 시스템 생성
planning design component-add ADM review-timeline --name "심사 이력 타임라인" --category data --for SFR-003-T01

planning link add https://www.krds.go.kr --label "KRDS"   # 참조 URL (--kind SERVICE|FIGMA|REFERENCE)
planning prompt sb CVL_INF_REG_010 --for figma           # AI 요청 프롬프트 (sb|proto|ia|ds)
planning gen prompt ia ADM                                # AI 생성 프롬프트 (ia|sb|flow|ds) → Claude에서 JSON 받기
planning req spec SFR-002                                # 기능 명세 보기 (저장본, 없으면 참조자료에서 요구사항 ID로 불러온 초안)
planning req spec SFR-002 --file spec.md                 # 기능 명세 저장 → 화면설계서·플로우 생성 프롬프트에 함께 실림
planning gen prompt sb ADM_INF_REV_010 --refine v1.json --instruction "검색 조건에 신청인 추가"   # 미세조정
planning gen apply ds ADM patch.json --instruction "주 색을 더 진하게"   # 반영 (디자인 개정 r+1)
planning gen review                                       # 디자인 변경 뒤 다시 검토할 화면
planning gen prompt ds ADM --scope cmp:data-table --instruction "머리글을 진하게"   # 섹션·컴포넌트 범위 조정

planning rtm --view matrix     # 요구사항 × 시스템
planning rtm --write           # rtm/ 에 rtm.md, rtm.json, rtm-*.csv 저장
planning check                 # 무결성·누락·근거 없는 산출물
planning snapshot --note "착수 기준선"
planning diff 0.1              # v0.1 대비 현재 변경 사항
planning view [--url <공유 주소>] # outputs/viewer.html — 브라우저로 여는 프로젝트 뷰어(읽기 전용)
planning serve --port 8080     # 웹 서비스 (로그인·공동 작업·편집·AI 생성)
```

기존 서비스는 `--type EXISTING --scope NEW_MENU|MODIFY|RENEWAL`로 만듭니다. `MODIFY`이면 정보구조도 단계는 패스하고 영향 화면 ID만 등록합니다.

| 옵션 | 설명 |
|---|---|
| `--root <dir>` | 프로젝트 루트 (기본 `projects/`, 환경변수 `PLANNING_ROOT`) |
| `-p <code>` | 프로젝트 코드 (루트에 하나뿐이면 생략) |
| `--id-mode ORIGINAL` | RFP 원본 ID(SFR-001 등)를 요구사항 ID로 사용 |

## 샘플 프로젝트
```bash
npx tsx scripts/build-examples.ts          # examples/projects 다시 생성
planning --root examples/projects -p PUBINFO status
planning --root examples/projects view --all   # examples/projects/viewer.html
```

`examples/projects/viewer.html`을 브라우저로 열면 두 샘플 프로젝트의 대시보드, 요구사항·Task, 요구사항 추적표, 정보구조도, 프로세스 플로우, 버전 이력을 볼 수 있습니다.
- `PUBINFO`: 신규 구축, 공공 민원형 + 외부 연계, 정보공개 요구사항의 시스템별 Task, 누락·근거 없음 사례 포함 — [추적표 보기](examples/projects/PUBINFO/rtm/rtm.md)
- `SHOPMY`: 기존 서비스 기존 메뉴 수정, v0.1 스냅샷 후 변경 요청(CR-001) 반영 — `planning --root examples/projects -p SHOPMY diff 0.1`

## 폴더 구조
```
src/model/     스키마, ID 규칙, 화면 ID 생성, 무결성 검사
src/project/   프로젝트 저장소, 시스템 프리셋, 변경 연산
src/trace/     추적성·RTM 계산
src/version/   스냅샷, Diff
src/render/    RTM Markdown·CSV 출력, viewer/ 프로젝트 뷰어·웹 화면(HTML)
src/service/   서비스 코어 — 편집 명령 실행·화면 데이터 계산 (파일 시스템 없음)
src/server/    웹 서비스 — 계정·세션·멤버·초대·AI 설정·API (planning serve)
src/cli.ts     CLI
schemas/       JSON Schema (npm run gen:schema)
examples/      샘플 프로젝트
tests/         테스트
```
