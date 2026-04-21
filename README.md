# Doosan Bears Semi-Automatic Naver Blog System

두산베어스 경기 결과를 바탕으로 네이버 블로그용 초안을 자동 생성하고, 사용자가 직접 검토 후 복붙 발행하는 반자동 포스팅 시스템입니다.

이 저장소는 `Supabase 백엔드 + 별도 웹 UI` 기준의 MVP 골격을 담고 있습니다.

## 왜 Supabase 구조로 바꿨는가

초기 요구사항은 `Python + FastAPI + SQLite`였지만, Supabase에 그대로 올리기에는 맞지 않습니다.

- Supabase Edge Functions는 현재 TypeScript/Deno 런타임 기반입니다.
- 스케줄링은 `pg_cron` 또는 Edge Function 호출 방식이 자연스럽습니다.
- SQLite 대신 Supabase Postgres를 쓰는 편이 운영과 확장에 유리합니다.
- 이미지 후보, 생성 결과, 로그를 Storage/DB에 붙이기 쉽습니다.

따라서 MVP는 아래 구조를 권장합니다.

- Supabase Postgres: 경기, 포스트, 이미지 후보, 설정 저장
- Supabase Edge Functions: 경기 수집, 글 생성, 이미지 후보 수집, 배치 처리
- Supabase Cron: 경기 종료 후 폴링 및 후처리
- 웹 UI: 로컬 또는 별도 프론트엔드에서 Supabase 데이터 조회 및 복사 기능 제공

## 현재 포함된 것

- 인수인계 문서
- 초기 DB 스키마 마이그레이션
- Edge Function 골격 4종
- Supabase 설정 파일
- 간단한 웹 UI 프로토타입

## 포함되지 않은 것

- 실제 KBO 데이터 소스 연동 키
- OpenAI API 키
- 실제 Supabase 프로젝트 연결 및 배포
- 네이버 블로그 자동 발행

## 권장 배포 구조

1. Supabase에 DB, Edge Functions, Cron을 올립니다.
2. 웹 UI는 두 가지 중 하나로 운영합니다.

- 로컬 전용: 브라우저에서 여는 정적 페이지 또는 간단한 로컬 서버
- 외부 배포: Next.js/Vercel 같은 별도 프론트

중요한 점은 `Supabase가 웹앱 프론트까지 전부 호스팅하는 플랫폼은 아니라는 점`입니다. 백엔드와 데이터 계층은 Supabase가 잘 맡고, UI는 분리하는 편이 안정적입니다.

## 폴더 구조

```text
docs/
  HANDOVER.md
supabase/
  config.toml
  migrations/
    20260421_init.sql
  functions/
    fetch-kbo-games/
    generate-post/
    fetch-image-candidates/
    process-completed-games/
src/
  app/
  lib/
```

## 빠른 다음 단계

1. Supabase 프로젝트 생성
2. `supabase login`
3. `supabase link --project-ref <your-project-ref>`
4. 마이그레이션 적용
5. Edge Function 시크릿 등록
6. 함수 배포
7. Cron 등록
8. Vercel에 프론트 배포
9. 웹 UI에서 연결 테스트

## 배포 명령 예시

```bash
supabase db push
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set KBO_SOURCE_BASE_URL=your_source
supabase functions deploy fetch-kbo-games
supabase functions deploy generate-post
supabase functions deploy fetch-image-candidates
supabase functions deploy process-completed-games
```

실제 프로젝트 ref와 인증 정보가 있으면 이어서 배포까지 진행할 수 있습니다.

## Vercel 프론트 배포

프론트는 Next.js로 구성되어 있어 Vercel에 올리기 좋습니다.

필수 환경변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

로컬 실행:

```bash
npm install
npm run dev
```

배포:

1. Git 저장소에 푸시
2. Vercel에서 저장소 import
3. 환경변수 등록
4. Deploy
