/** Shown when a link filled the form in. The link chose the numbers; only the wallet owner signs. */
export function PresetNote() {
  return (
    <p className="mt-4 border-l-2 border-accent pl-3 text-[15px] text-body">
      This form was filled in from a link, for example one your AI agent made. Check the amounts and every step below
      before you sign. Nothing moves until you sign in your wallet.
    </p>
  )
}
