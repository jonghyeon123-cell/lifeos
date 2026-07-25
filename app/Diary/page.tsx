import Image from "next/image";
import Link from "next/link";

export default function DiaryPage() {
  return (
    <main className="flex-1 px-8 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Image src="/face.svg" alt="LifeOS logo" width={36} height={36} />
          <h1 className="text-2xl font-bold">Diary</h1>
        </div>
        <Link
          href="/"
          className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Home
        </Link>
      </div>
      <hr className="mt-[50px] border-t border-[#9da19a]" />
    </main>
  );
}
