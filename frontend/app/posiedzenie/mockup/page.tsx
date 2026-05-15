// Design control for /posiedzenie/[number]. Feeds the shared
// SittingViewClient with a hardcoded MOCK so the section components can be
// iterated on without infra in the way.

import { SittingViewClient } from "../_components/SittingViewClient";
import { MOCK } from "./data";

export default function ProceedingMockupPage() {
  return <SittingViewClient data={MOCK} />;
}
