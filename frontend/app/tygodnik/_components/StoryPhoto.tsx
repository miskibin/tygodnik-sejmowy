"use client";

import Image from "next/image";
import { useState } from "react";
import type { StoryImage } from "@/lib/weekly-stories";
import styles from "./weekly.module.css";

export function StoryPhoto({ image }: { image: StoryImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const generated = image.provider === "generated";
  return <figure className={styles.storyPhoto}>
    <Image src={image.url} alt={image.alt} width={image.width} height={image.height}
      sizes="(max-width: 760px) 160px, 240px" loading="lazy"
      onError={() => setFailed(true)} />
    <figcaption>
      <details>
        <summary>{generated ? "O ilustracji" : "Źródło zdjęcia"}</summary>
        <p>{image.caption}</p>
        {generated
          ? <p>Ilustracja AI: FLUX.2 [klein] 4B · materiał redakcyjny</p>
          : <p>Fot. {image.author} · <a href={image.source_url}>Wikimedia Commons</a> · <a href={image.license_url}>{image.license}</a></p>}
      </details>
    </figcaption>
  </figure>;
}
