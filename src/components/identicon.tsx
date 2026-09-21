// A small mirrored 5×5 pattern drawn from the address itself, so every wallet
// gets its own face without anyone uploading a picture.
export function Identicon({ address, className = "size-9" }: { address: string; className?: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const mirrored = column < 3 ? column : 4 - column;
      cells.push(parseInt(hex[row * 3 + mirrored], 16) % 2 === 0);
    }
  }
  // The last byte picks how strong the tint is, which keeps neighbours apart.
  const strength = 0.55 + (parseInt(hex.slice(-2), 16) / 255) * 0.45;

  return (
    <svg viewBox="0 0 5 5" aria-hidden className={`${className} shrink-0 rounded-lg border border-line bg-raised p-1.5`} shapeRendering="crispEdges">
      {cells.map((on, index) =>
        on ? (
          <rect key={index} x={index % 5} y={Math.floor(index / 5)} width="1" height="1" fill="var(--color-accent)" opacity={strength} />
        ) : null,
      )}
    </svg>
  );
}
