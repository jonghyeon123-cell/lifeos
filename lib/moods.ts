// 일기 기분 목록. 작성 폼(/Diary)과 대시보드 위젯이 같은 표를 본다.

export const MOODS = [
  { key: "happy", src: "/emotion-happy.png", label: "활짝" },
  { key: "smile", src: "/emotion-smile.png", label: "좋음" },
  { key: "neutral", src: "/emotion-neutral.png", label: "보통" },
  { key: "sad", src: "/emotion-sad.png", label: "시무룩" },
  { key: "cry", src: "/emotion-cry.png", label: "울음" },
];

export const MOOD_SRC: Record<string, string> = Object.fromEntries(
  MOODS.map((m) => [m.key, m.src])
);
