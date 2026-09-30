import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recurrenceInstanceId, sha256Hex } from "./recurrenceInstanceId";

const nodeSha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("vectores FIPS 180-4", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("bordes de padding (55, 56, 63, 64, 65 bytes) y mensajes multi-bloque", () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const s = "a".repeat(n);
      expect(sha256Hex(s)).toBe(nodeSha(s));
    }
  });

  it("UTF-8 multibyte coincide con node:crypto", () => {
    for (const s of ["ñandú", "Miércoles 📅", "日本語", "plan:recurrence-instance:ü:2026-01-01"]) {
      expect(sha256Hex(s)).toBe(nodeSha(s));
    }
  });
});

describe("recurrenceInstanceId", () => {
  const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("es un UUID canónico v8 con variante RFC", () => {
    expect(recurrenceInstanceId("root-1", "2026-09-29")).toMatch(UUID_V8);
    expect(recurrenceInstanceId("", "")).toMatch(UUID_V8);
  });

  it("determinista: mismo (raíz, día) => mismo id (contrato entre dispositivos)", () => {
    expect(recurrenceInstanceId("abc", "2026-09-29")).toBe(recurrenceInstanceId("abc", "2026-09-29"));
  });

  it("deriva de SHA-256 del namespace documentado (bits de hash intactos)", () => {
    const hex = nodeSha("plan:recurrence-instance:abc:2026-09-29").slice(0, 32);
    const id = recurrenceInstanceId("abc", "2026-09-29").replace(/-/g, "");
    // todo igual salvo el nibble de versión (12) y el de variante (16)
    for (let i = 0; i < 32; i++) {
      if (i === 12) expect(id[i]).toBe("8");
      else if (i === 16) expect(parseInt(id[i], 16)).toBe((parseInt(hex[i], 16) & 0x3) | 0x8);
      else expect(id[i]).toBe(hex[i]);
    }
  });

  it("cambia con la raíz o con el día", () => {
    const base = recurrenceInstanceId("abc", "2026-09-29");
    expect(recurrenceInstanceId("abd", "2026-09-29")).not.toBe(base);
    expect(recurrenceInstanceId("abc", "2026-09-30")).not.toBe(base);
  });

  it("sin colisiones en 20.000 pares (raíz, día)", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 200; r++) {
      for (let d = 0; d < 100; d++) {
        seen.add(recurrenceInstanceId(`root-${r}`, `2026-01-${String(d).padStart(3, "0")}`));
      }
    }
    expect(seen.size).toBe(20_000);
  });
});
