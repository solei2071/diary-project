/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  // 출처 제약을 강화하기 위해 정적 호스팅에서도 최소한의 보안 헤더를 일괄 적용한다.
  // 앱의 정적 자산이더라도 브라우저에서 내려받는 순간 CSP/COOP/프레임 제어가 동일하게 적용된다.
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // MIME sniffing을 막아 브라우저가 콘텐츠 타입을 임의 해석하는 것을 방지한다.
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            // 클릭재킹을 막기 위해 iframe 내 임베드 차단.
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            // 리퍼러 노출 범위를 제한해 URL 쿼리/토큰 노출 위험을 낮춘다.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            // 브라우저 API 권한을 기본 비허용으로 두고 기능 필요시만 허용되는 형태로 전환한다.
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
          },
          {
            // 새 창/탭 간 창 분리 동작을 제어.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin"
          },
          {
            // HTTPS 강제 및 장기 캐시 정책(서브도메인 포함) 적용.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains"
          },
          {
            // 스크립트/이미지/연결 출처를 최소권한으로 제한.
            // 필요시 향후 서비스 통합 대상(Supabase API, iOS 딥링크 도메인 등)만 추가해 준다.
            key: "Content-Security-Policy",
            value: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
