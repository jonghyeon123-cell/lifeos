"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function AuthPage() {
  const { signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      setIsSigningIn(false);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-5">
          <Image src="/face.svg" alt="LifeOS logo" width={40} height={40} />
          <span className="text-2xl font-bold">LifeOS</span>
        </div>

        <Link
          href="/"
          className="rounded-full px-4 py-2 text-[28px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Home
        </Link>
      </header>

      <hr className="mx-8 mt-[46px] border-t border-[#9da19a]" />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-8 py-12 sm:justify-start sm:pl-16">
        <div className="w-full max-w-sm translate-x-[70px] rounded-3xl border border-[#9da19a]/30 bg-white/70 p-10 backdrop-blur">
          <h1 className="text-center text-2xl font-bold">시작하기</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            LifeOS와 함께 하루를 정리해보세요
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            {isSigningIn ? "이동 중..." : "Google로 계속하기"}
          </button>

          <p className="mt-6 text-center text-xs text-gray-500">
            계속 진행하면 LifeOS의 이용약관 및 개인정보처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>

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
