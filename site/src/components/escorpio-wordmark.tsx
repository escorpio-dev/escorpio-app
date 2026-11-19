// Logo mark next to the name in the condensed bold cut.
export function EscorpioWordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/mark.png" alt="" width={size} height={size} className="shrink-0" />
      <span className="font-sans text-[1.3rem] font-bold sm:text-[1.6rem] uppercase leading-none text-ink [font-stretch:72%]">Escorpio</span>
    </span>
  )
}
