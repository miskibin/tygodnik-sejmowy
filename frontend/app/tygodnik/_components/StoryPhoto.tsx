"use client";

import Image from "next/image";
import { useState } from "react";
import type { StoryImage } from "@/lib/weekly-stories";
import styles from "./weekly.module.css";

export function StoryPhoto({ image }: { image: StoryImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <figure className={styles.storyPhoto}>
    <Image src={image.url} alt={image.alt} width={image.width} height={image.height}
      sizes="(max-width: 460px) calc(100vw - 40px), 420px" loading="lazy"
      onError={() => setFailed(true)} />
    <figcaption className="mt-2 text-xs leading-relaxed text-muted-foreground">
      {image.caption && <span>{image.caption} </span>}
      {image.provider === "generated" ? <span>Ilustracja AI · {image.author}</span> : <>
        <span>Fot.: {image.author} · </span>
        {image.license_url ? <a href={image.license_url} target="_blank" rel="noopener noreferrer" className="underline">{image.license}</a> : image.license}
        {image.source_url && <> · <a href={image.source_url} target="_blank" rel="noopener noreferrer" className="underline">Źródło zdjęcia</a></>}
      </>}
    </figcaption>
  </figure>;
}
