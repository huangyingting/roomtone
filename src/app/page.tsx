import { readFileSync } from "node:fs";
import { join } from "node:path";
import OriginalRoomtone from "@/components/OriginalRoomtone";

export default function Page() {
  const markup = readFileSync(join(process.cwd(), "src/original/markup.html"), "utf8");
  return <OriginalRoomtone markup={markup} />;
}
