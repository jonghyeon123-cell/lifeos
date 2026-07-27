// 하위 페이지(과제·예산·일기·목표·목표 상세·달성) 공용 헤더.
// 좌측은 마스코트 + 페이지 로고, 우측은 이동 링크 묶음이다.
//
// 랜딩(/)은 헤더 구성이 달라 여기에 포함하지 않는다. 로그인(/auth)은 자체 헤더지만
// 로고와 Home 링크는 같은 모양이라 Mark와 HomeLink를 함께 쓴다.
//
// 구분선(<hr>)은 페이지마다 감싸는 방식이 달라(일기는 배경 그림을 겹친다) 넣지 않았다.

import Image from "next/image";
import Link from "next/link";

/**
 * 헤더의 모든 그림은 여백을 잘라낸 mark-* 판을 쓴다.
 *
 * 원본 로고(home.png, Goal.png, face.svg …)는 그림 주위 투명 여백의 비율이 제각각이라
 * — 글자의 세로 중심이 home 40.7%, Goal 43.5%, achievement 47.5% — 높이를 똑같이 줘도
 * 정작 눈에 보이는 그림은 크기도 위치도 어긋났다. 여백을 잘라내면 "이미지 박스 = 그림"이
 * 되어, 높이 하나로 크기가 정해지고 items-center만으로 정렬이 맞는다.
 *
 * 그래서 마스코트·페이지 로고·이동 링크가 모두 이 상수 하나를 공유한다.
 * 이미지를 교체하면 scripts/crop-marks.js를 다시 돌려야 한다.
 */
const MARK = "h-5 w-auto sm:h-6 lg:h-10";

/** 이동 링크 껍데기. 배경을 두지 않아 페이지 배경이 그대로 비친다. */
const NAV_LINK =
  "flex items-center rounded-full px-2 py-2 transition-opacity hover:opacity-70 sm:px-3";

/** 헤더용 그림. 크기는 넘기지 않는다 — 전부 같은 높이로 맞추는 게 이 헤더의 규칙이다. */
export function Mark({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={0}
      height={0}
      sizes="100vw"
      className={MARK}
    />
  );
}

export function MascotMark() {
  return <Mark src="/mark-face.svg" alt="LifeOS logo" />;
}

export function HomeLink() {
  return (
    <Link href="/" className={NAV_LINK}>
      <Mark src="/mark-home.png" alt="Home" />
    </Link>
  );
}

export function GoalLink() {
  return (
    <Link href="/Goal" className={NAV_LINK}>
      <Mark src="/mark-goal.png" alt="Goal" />
    </Link>
  );
}

export function AchievementLink() {
  return (
    <Link href="/Achievement" className={NAV_LINK}>
      <Mark src="/mark-achievement.png" alt="Achievement" />
    </Link>
  );
}

export default function PageHeader({
  title,
  alt,
  children,
}: {
  /** 페이지 로고 이미지 경로. mark-* 판을 넘긴다. */
  title: string;
  alt: string;
  /** Home 앞에 들어갈 추가 링크. 없으면 Home만 놓인다. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <MascotMark />
        <Mark src={title} alt={alt} />
      </div>
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
        {children}
        <HomeLink />
      </div>
    </div>
  );
}
