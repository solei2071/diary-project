/**
 * Next.js App Router 루트 레이아웃 (layout.tsx)
 *
 * - App Router: Next.js 13+의 파일 기반 라우팅 (app/ 폴더)
 * - layout.tsx: 해당 경로와 하위 모든 페이지를 감싸는 공통 레이아웃
 * - RootLayout: 전체 앱의 최상위 레이아웃 (html, body 포함)
 */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaManager from "@/components/PwaManager";

// 메타데이터: SEO, Open Graph, PWA 등에 사용 (서버에서 head에 주입됨)
export const metadata: Metadata = {
  title: "Daily Flow Diary",
  description: "Date-based to-do and activity diary",
  manifest: "/manifest.webmanifest", // PWA 매니페스트
  icons: {
    icon: [
    { url: "/icon.svg", sizes: "192x192", type: "image/svg+xml" },
    { url: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }
    ],
    apple: "/icon.svg",
    shortcut: "/icon.svg"
  },
  applicationName: "Daily Flow Diary",
  appleWebApp: {
    capable: true, // iOS 웹앱으로 홈 화면에 추가 가능
    statusBarStyle: "black-translucent",
    title: "Daily Flow Diary"
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Daily Diary",
    "format-detection": "telephone=no"
  }
};

// 뷰포트 설정: 모바일 반응형, safe area 대응
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover", // 노치/섬 유형 기기에서 전체 화면 사용
  themeColor: "#2383e2"
};

/** 루트 레이아웃 — children에 page.tsx 등 하위 페이지가 렌더됨 */
export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased ios-safe-root">
        {/* notion-shell: globals.css에 정의된 Notion-style 최대 너비/패딩 래퍼 (최대 1100px) */}
        <div className="notion-shell">
          <PwaManager />
          {children}
        </div>
      </body>
    </html>
  );
}
