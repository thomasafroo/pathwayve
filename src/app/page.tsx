import { Planner } from "@/components/Planner";
import { dataMode } from "@/lib/server/env";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Planner mode={dataMode()} />;
}
