import Image from "next/image";
import { CARD } from "@/lib/ui";

/** 목록이 비었을 때의 안내 카드. 목록 안에 놓이므로 li로 렌더한다. */
export default function EmptyCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <li
      className={`${CARD} flex flex-col items-center gap-3 px-6 py-12 text-center`}
    >
      <Image
        src="/face.svg"
        alt=""
        width={56}
        height={56}
        className="opacity-80"
      />
      <p className="text-sm text-gray-500">{children}</p>
    </li>
  );
}
