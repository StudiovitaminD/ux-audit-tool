import type { SharedSectionProps } from "./shared";

export function ThankYouPageSection({ vm }: SharedSectionProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[color:var(--report-orange)] text-[color:var(--report-white)] print-color-adjust">
      <img
        src="/first-page-vector.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-0 select-none"
        style={{
          width: "966.458px",
          height: "780.979px",
          left: "0.875px",
          bottom: "104.021px",
          opacity: 0.5,
        }}
        draggable={false}
      />

      <div className="relative z-10 flex h-full w-full flex-col">
        <div className="flex flex-1 items-center justify-center px-[42px]">
          <h1
            className="max-w-full text-center text-[68px] font-bold text-[color:var(--report-white)]"
            style={{
              fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif',
              letterSpacing: "-1.5px",
            }}
          >
            Thank you
          </h1>
        </div>

        <div className="flex h-[44px] shrink-0 items-center justify-between self-stretch border-t border-t-[rgba(255,255,255,0.20)] px-[42px] py-0 text-sm text-[color:var(--report-white)]/90">
          <div className="max-w-[320px] text-[14px] leading-5">
            {vm.productUrl || "Product URL not provided"}
          </div>
          <div className="text-[14px] leading-5">{vm.generatedAt ? new Date(vm.generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : ""}</div>
        </div>
      </div>
    </div>
  );
}
