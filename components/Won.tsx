// 원화 표기. ₩ 기호만 작고 흐리게 두어 숫자가 먼저 읽히게 한다.

export default function Won({ value }: { value: number }) {
  return (
    <>
      <span className="mr-0.5 align-[0.05em] text-[0.7em] font-normal opacity-70">
        ₩
      </span>
      {new Intl.NumberFormat("ko-KR").format(value)}
    </>
  );
}
