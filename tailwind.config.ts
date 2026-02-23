/**
 * Tailwind CSS 설정 (tailwind.config.ts)
 *
 * - content: 어떤 파일에서 클래스명을 스캔할지 지정 (여기 없는 클래스는 purge됨)
 * - theme.extend: 기본 테마 확장 (색상, 폰트, 애니메이션 등)
 */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#151826",
        primary: "#4e56ff",
        "primary-strong": "#373fda",
        accent: "#ff8a42",
        soft: "#f7f8ff",
        warning: "#ff8a42",
        success: "#10b981"
      },
      borderRadius: {
        card: "1rem"
      },
      boxShadow: {
        card: "0 14px 40px rgba(16, 24, 32, 0.12)",
        soft: "0 12px 30px rgba(33, 43, 81, 0.08)"
      },
      fontFamily: {
        sans: ["Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"]
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" }
        }
      },
      animation: {
        fadeUp: "fadeUp 420ms ease-out",
        pulseSoft: "pulseSoft 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
