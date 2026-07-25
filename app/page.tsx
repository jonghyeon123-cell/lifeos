"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const NAV_LINKS = [
  { href: "/Assignment", label: "Assignment" },
  { href: "/Budget", label: "Budget" },
  { href: "/Diary", label: "Diary" },
  { href: "/Goal", label: "Goal" },
];

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const handleLogOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <>
      <header className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-5">
          <Image src="/face.svg" alt="LifeOS logo" width={40} height={40} />
          <span className="text-2xl font-bold">LifeOS</span>
        </div>

        {!loading && user ? (
          <nav className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-700 transition-colors hover:text-[#171717]"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleLogOut}
              className="rounded-full border border-[#171717] bg-transparent px-6 py-3 text-sm font-semibold text-[#171717] transition-colors hover:bg-[#171717]/10"
            >
              Log out
            </button>
          </nav>
        ) : (
          !loading && (
            <Link
              href="/auth"
              className="rounded-full border border-[#171717] bg-transparent px-6 py-3 text-sm font-semibold text-[#171717] transition-colors hover:bg-[#171717]/10"
            >
              Get Started
            </Link>
          )
        )}
      </header>

      <hr className="mx-8 mt-[46px] border-t border-[#9da19a]" />

      <main className="relative flex-1 overflow-hidden">
        <div className="absolute right-8 top-1/2 -translate-y-1/2 sm:right-16">
          <Image
            src="/lifeos_charcter.png"
            alt="LifeOS character"
            width={714}
            height={714}
            priority
          />
        </div>
      </main>
    </>
  );
}
