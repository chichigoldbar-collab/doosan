"use client";

import { useState, useTransition } from "react";

type ImageCandidate = {
  id: string;
  source_name: string;
  source_url: string | null;
  image_url: string;
  thumbnail_url: string | null;
  credit_note: string | null;
  is_official: boolean;
};

type Props = {
  postId: string;
  initialTitle: string;
  initialBody: string;
  initialTags: string;
  images: ImageCandidate[];
  initialStatus: string;
};

export function PostEditor({
  postId,
  initialTitle,
  initialBody,
  initialTags,
  images,
  initialStatus,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [tags, setTags] = useState(initialTags);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("복사했습니다.");
  }

  async function save(nextStatus?: string) {
    const response = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editable_title: title,
        editable_body: body,
        editable_tags: tags,
        status: nextStatus ?? status,
      }),
    });

    if (!response.ok) {
      setMessage("저장 중 문제가 생겼습니다.");
      return;
    }

    const payload = await response.json();
    setStatus(payload.status);
    setMessage(nextStatus === "published" ? "발행 완료로 저장했습니다." : "수정 내용을 저장했습니다.");
  }

  return (
    <>
      <label className="sectionLabel" htmlFor="title">
        제목
      </label>
      <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />

      <label className="sectionLabel" htmlFor="body">
        본문
      </label>
      <textarea id="body" value={body} onChange={(event) => setBody(event.target.value)} />

      <label className="sectionLabel" htmlFor="tags">
        태그
      </label>
      <input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} />

      <div className="actions">
        <button className="button" onClick={() => copyText(title)}>
          제목 복사
        </button>
        <button className="button" onClick={() => copyText(body)}>
          본문 복사
        </button>
        <button className="button" onClick={() => copyText(tags)}>
          태그 복사
        </button>
        <button
          className="button secondary"
          onClick={() => copyText([title, "", body, "", tags].join("\n"))}
        >
          전체 복사
        </button>
      </div>

      <div className="actions">
        <button
          className="button ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void save();
            })
          }
        >
          수정 저장
        </button>
        <button
          className="button"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void save("published");
            })
          }
        >
          발행 완료 체크
        </button>
      </div>

      <p className="notice">
        현재 상태: <strong>{status}</strong> {isPending ? "· 저장 중..." : ""} {message ? `· ${message}` : ""}
      </p>

      <div style={{ marginTop: 26 }}>
        <h3 style={{ marginBottom: 10 }}>사진 후보</h3>
        <div className="imageList">
          {images.length === 0 ? (
            <div className="imageCard">
              <strong>이미지 후보가 아직 없습니다.</strong>
              <p className="small">공식 채널 기준 링크를 추가하면 여기서 바로 확인할 수 있습니다.</p>
            </div>
          ) : (
            images.map((image) => (
              <div className="imageCard" key={image.id}>
                <strong>
                  {image.source_name} {image.is_official ? "· 공식" : ""}
                </strong>
                <p className="small">{image.credit_note ?? "출처 메모 없음"}</p>
                <div className="actions" style={{ marginTop: 8 }}>
                  {image.source_url ? (
                    <a className="button ghost" href={image.source_url} target="_blank" rel="noreferrer">
                      출처 열기
                    </a>
                  ) : null}
                  <button className="button secondary" onClick={() => copyText(image.image_url)}>
                    링크 복사
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
