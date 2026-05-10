"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PersonaId } from "@/lib/personas";
import type { TopicId } from "@/lib/topics";

type Profile = {
  postcode: string;
  personas: PersonaId[];
  topics: TopicId[];
  showPersonas: boolean;
  district: { num: number; name: string } | null;
  setPostcode: (v: string) => void;
  setPersonas: (v: PersonaId[]) => void;
  setTopics: (v: TopicId[]) => void;
  setShowPersonas: (v: boolean) => void;
  setDistrict: (v: Profile["district"]) => void;
  hydrated: boolean;
};

const Ctx = createContext<Profile | null>(null);

const KEY_POSTCODE = "tsejm.postcode";
const KEY_PERSONAS = "tsejm.personas";
const KEY_TOPICS = "tsejm.topics";
const KEY_SHOW_PERSONAS = "tsejm.showPersonas";
const KEY_DISTRICT = "tsejm.district";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [postcode, setPostcodeState] = useState("");
  const [personas, setPersonasState] = useState<PersonaId[]>([]);
  const [topics, setTopicsState] = useState<TopicId[]>([]);
  const [showPersonas, setShowPersonasState] = useState(false);
  const [district, setDistrictState] = useState<Profile["district"]>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const p = localStorage.getItem(KEY_POSTCODE);
      const pp = localStorage.getItem(KEY_PERSONAS);
      const tt = localStorage.getItem(KEY_TOPICS);
      const sp = localStorage.getItem(KEY_SHOW_PERSONAS);
      const d = localStorage.getItem(KEY_DISTRICT);
      if (p) setPostcodeState(p);
      if (pp) setPersonasState(JSON.parse(pp) as PersonaId[]);
      if (tt) setTopicsState(JSON.parse(tt) as TopicId[]);
      if (sp) setShowPersonasState(sp === "1");
      if (d) setDistrictState(JSON.parse(d));
    } catch {
      // localStorage may be unavailable; ignore
    }
    setHydrated(true);
  }, []);

  const setPostcode = (v: string) => {
    setPostcodeState(v);
    try { localStorage.setItem(KEY_POSTCODE, v); } catch {}
  };
  const setPersonas = (v: PersonaId[]) => {
    setPersonasState(v);
    try { localStorage.setItem(KEY_PERSONAS, JSON.stringify(v)); } catch {}
  };
  const setTopics = (v: TopicId[]) => {
    setTopicsState(v);
    try { localStorage.setItem(KEY_TOPICS, JSON.stringify(v)); } catch {}
  };
  const setShowPersonas = (v: boolean) => {
    setShowPersonasState(v);
    try { localStorage.setItem(KEY_SHOW_PERSONAS, v ? "1" : "0"); } catch {}
  };
  const setDistrict = (v: Profile["district"]) => {
    setDistrictState(v);
    try {
      if (v) localStorage.setItem(KEY_DISTRICT, JSON.stringify(v));
      else localStorage.removeItem(KEY_DISTRICT);
    } catch {}
  };

  return (
    <Ctx.Provider
      value={{
        postcode,
        personas,
        topics,
        showPersonas,
        district,
        setPostcode,
        setPersonas,
        setTopics,
        setShowPersonas,
        setDistrict,
        hydrated,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useProfile(): Profile {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile must be used within ProfileProvider");
  return v;
}
