import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "두산 블로그 드래프트 보드",
  description: "두산 경기 리뷰 초안을 확인하고 복사하는 반자동 포스팅 보드",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
