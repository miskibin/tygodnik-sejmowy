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
      sizes="(max-width: 760px) calc(100vw - 40px), 720px" loading="lazy"
      onError={() => setFailed(true)} />
    <figcaption>
      <details>
        <summary>Źródło zdjęcia</summary>
        <p>{image.caption}</p>
        <p>Fot. {image.author} · <a href={image.source_url}>Wikimedia Commons</a> · <a href={image.license_url}>{image.license}</a></p>
      </details>
    </figcaption>
  </figure>;
}
