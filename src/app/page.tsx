import Processor from "./interface/Processor";
import { Analytics } from "@vercel/analytics/next";

export default function InterfacePage() {
  return (
    <>
      <Processor />
      <Analytics />
    </>
  );
}