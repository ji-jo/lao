import { describe, expect, test } from "bun:test";
import { prettyJsx, svgToJsx } from "@/export/code/svgToJsx";

describe("svgToJsx", () => {
  test("camelCases stroke attrs and keeps animate children", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs>
        <mask id="m1">
          <path d="M0 0h10" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0">
            <animate attributeName="stroke-dashoffset" values="100;0" begin="0s" dur="0.4s" fill="freeze"/>
          </path>
        </mask>
      </defs>
      <path d="M1 1 L9 9" fill="#111" mask="url(#m1)"/>
    </svg>`;
    const jsx = svgToJsx(svg);
    expect(jsx).toContain("strokeWidth");
    expect(jsx).toContain("strokeLinecap");
    expect(jsx).toContain("strokeDasharray");
    expect(jsx).toContain("strokeDashoffset");
    expect(jsx).toContain("<animate");
    expect(jsx).toContain("attributeName");
    expect(jsx).not.toContain("stroke-width");
    expect(jsx).not.toContain("fetch(");
  });

  test("drops public font @import urls", () => {
    const svg = `<svg viewBox="0 0 1 1"><style>@import url('https://fonts.googleapis.com/css2?family=Foo');text{font-family:Foo}</style></svg>`;
    const jsx = svgToJsx(svg);
    expect(jsx).not.toContain("fonts.googleapis.com");
    expect(jsx).toContain("font-family:Foo");
  });

  test("prettyJsx indents nested tags", () => {
    const pretty = prettyJsx("<g><path d={\"M0\"} /></g>");
    expect(pretty).toContain("<g>");
    expect(pretty).toContain("  <path");
  });
});
