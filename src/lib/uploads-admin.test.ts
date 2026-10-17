import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/storage";
import { presetName } from "@/lib/role-presets";
import { membershipsFromForm } from "@/server/admin";

describe("sniffImage (avatar uploads)", () => {
  it("recognises PNG, JPEG, GIF and WebP signatures", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("jpg");
    expect(sniffImage(Buffer.from("GIF89a....", "latin1"))).toBe("gif");
    expect(sniffImage(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1"))).toBe("webp");
  });

  it("rejects SVG, HTML and truncated files renamed as images", () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("<html><body>hi</body></html>"))).toBeNull();
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("administration helpers", () => {
  it("derives preset keys from titles", () => {
    expect(presetName("Accounts Payable Clerk")).toBe("accounts-payable-clerk");
    expect(presetName("  Read only ")).toBe("read-only");
  });

  it("collects membership_<companyId> fields only", () => {
    expect(membershipsFromForm({ name: "A", membership_3: "12", membership_7: "", membership_x: "1", other_4: "2" })).toEqual({ "3": "12", "7": "" });
  });
});
