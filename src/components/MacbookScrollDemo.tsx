import React from "react";
import { MacbookScroll } from "@/components/ui/macbook-scroll";

export default function MacbookScrollDemo() {
  return (
    <div className="w-full bg-transparent">
      <MacbookScroll
        src="/assets/hero-image.png"
        showGradient={false}
      />
    </div>
  );
}
