import Image from "next/image";

/** Navbar mark — same artwork as favicon, transparent background (`public/logo.png`). */
export function TygodnikLogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={921}
      height={921}
      className={className}
      priority
    />
  );
}
