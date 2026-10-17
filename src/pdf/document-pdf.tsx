import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Block } from "./html";
import { fontBold, fontRegular } from "./fonts";

/** Invoice / credit note / estimate PDF. Black on white, thin grey rules, three header layouts (spec §7.2–7.4). */

export type PdfLine = { name: string; description: string | null; quantity: string; price: string; discount: string | null; tax: string | null; amount: string; extra: string[] };
export type PdfDoc = {
  variant: "1" | "2" | "3";
  title: string;
  logo: Buffer | null;
  companyName: string;
  companyBlock: Block[];
  billBlock: Block[];
  shipBlock: Block[];
  details: { label: string; value: string }[];
  banner: string[] | null;
  extraColumns: string[];
  showDiscount: boolean;
  showTax: boolean;
  lines: PdfLine[];
  totals: { label: string; value: string; strong?: boolean; boxed?: boolean }[];
  notes: Block[];
  /** Customer portal pointer on invoices: login URL and the customer's sign-in email (never a password). */
  portal: { url: string; email: string } | null;
  footer: string;
};

const GREY = "#94a3b8";
const LIGHT = "#e2e8f0";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, ...fontRegular, color: "#0f172a", lineHeight: 1.35 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  rule: { borderBottomWidth: 0.75, borderBottomColor: GREY, marginVertical: 10 },
  heavyRule: { borderBottomWidth: 1.5, borderBottomColor: "#334155", marginVertical: 10 },
  h: { ...fontBold },
  muted: { color: "#475569" },
  small: { fontSize: 8, color: "#64748b" },
  th: { ...fontBold, fontSize: 8, color: "#334155", paddingVertical: 5 },
  td: { paddingVertical: 5 },
  tableHead: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: GREY },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LIGHT },
  totals: { marginTop: 10, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  boxed: { borderWidth: 0.75, borderColor: "#334155", paddingHorizontal: 6, paddingVertical: 4, marginVertical: 3 },
  banner: { borderWidth: 0.75, borderColor: GREY, padding: 6, marginBottom: 10 },
});

function Blocks({ blocks, align = "left" }: { blocks: Block[]; align?: "left" | "right" }) {
  return (
    <View>
      {blocks.map((b, i) => (
        <Text key={i} style={[b.bold ? s.h : {}, b.heading ? { fontSize: 10, marginBottom: 1 } : {}, { textAlign: align }]}>
          {b.text}
        </Text>
      ))}
    </View>
  );
}

function Details({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={{ width: 200 }}>
      {rows.map((r) => (
        <View key={r.label} style={s.between}>
          <Text style={s.muted}>{r.label}</Text>
          <Text style={{ textAlign: "right" }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Logo({ d, align }: { d: PdfDoc; align: "left" | "center" }) {
  if (d.logo) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <Image src={d.logo} style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain", alignSelf: align === "center" ? "center" : "flex-start" }} />;
  }
  return <Text style={[s.h, { fontSize: 16, textAlign: align }]}>{d.companyName}</Text>;
}

function Parties({ d }: { d: PdfDoc }) {
  return (
    <View style={[s.row, { gap: 24 }]}>
      {d.billBlock.length ? (
        <View style={{ flex: 1 }}>
          <Text style={[s.small, { marginBottom: 2 }]}>BILL TO</Text>
          <Blocks blocks={d.billBlock} />
        </View>
      ) : null}
      {d.shipBlock.length ? (
        <View style={{ flex: 1 }}>
          <Text style={[s.small, { marginBottom: 2 }]}>SHIP TO</Text>
          <Blocks blocks={d.shipBlock} />
        </View>
      ) : null}
    </View>
  );
}

function Header({ d }: { d: PdfDoc }) {
  if (d.variant === "2") {
    return (
      <View>
        <View style={s.between}>
          <Logo d={d} align="left" />
          <View>
            <Text style={[s.h, { fontSize: 20, textAlign: "right" }]}>{d.title}</Text>
            {d.details.slice(0, 2).map((r) => (
              <Text key={r.label} style={[s.muted, { textAlign: "right" }]}>
                {r.label}: {r.value}
              </Text>
            ))}
          </View>
        </View>
        <View style={s.heavyRule} />
        <View style={[s.between, { gap: 24 }]}>
          <View style={{ flex: 1 }}>
            <Blocks blocks={d.companyBlock} />
            {d.details.slice(2).length ? <View style={{ marginTop: 6 }}><Details rows={d.details.slice(2)} /></View> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Parties d={d} />
          </View>
        </View>
      </View>
    );
  }
  if (d.variant === "3") {
    return (
      <View>
        <View style={s.between}>
          <Logo d={d} align="left" />
          <Blocks blocks={d.companyBlock} align="right" />
        </View>
        <View style={s.rule} />
        <Text style={[s.h, { fontSize: 14, marginBottom: 6 }]}>{d.title}</Text>
        <View style={[s.between, { gap: 24 }]}>
          <View style={{ flex: 1 }}>
            <Parties d={d} />
          </View>
          <Details rows={d.details} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <Logo d={d} align="center" />
      <View style={s.rule} />
      <View style={[s.between, { gap: 24 }]}>
        <Blocks blocks={d.companyBlock} />
        <View>
          <Text style={[s.h, { fontSize: 14, textAlign: "right", marginBottom: 4 }]}>{d.title}</Text>
          <Details rows={d.details} />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <Parties d={d} />
      </View>
    </View>
  );
}

export function DocumentPdf({ d }: { d: PdfDoc }) {
  const cols = [
    { key: "name", label: "Items", flex: 4, align: "left" as const },
    ...d.extraColumns.map((c, i) => ({ key: `x${i}`, label: c, flex: 1.5, align: "left" as const })),
    { key: "qty", label: "Quantity", flex: 1.3, align: "right" as const },
    { key: "price", label: "Price", flex: 1.6, align: "right" as const },
    ...(d.showDiscount ? [{ key: "disc", label: "Discount", flex: 1.3, align: "right" as const }] : []),
    ...(d.showTax ? [{ key: "tax", label: "Tax", flex: 1.3, align: "right" as const }] : []),
    { key: "amount", label: "Amount", flex: 1.7, align: "right" as const },
  ];
  const cell = (l: PdfLine, key: string) => {
    if (key === "qty") return l.quantity;
    if (key === "price") return l.price;
    if (key === "disc") return l.discount ?? "";
    if (key === "tax") return l.tax ?? "";
    if (key === "amount") return l.amount;
    if (key.startsWith("x")) return l.extra[Number(key.slice(1))] ?? "";
    return "";
  };
  return (
    <Document title={d.title} creator="Kydi" producer="Kydi">
      <Page size="A4" style={s.page}>
        <Header d={d} />
        {d.banner ? (
          <View style={[s.banner, { marginTop: 12 }]}>
            {d.banner.map((b, i) => (
              <Text key={i} style={i === 0 ? s.h : {}}>
                {b}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <View style={s.tableHead}>
            <Text style={[s.th, { width: 18 }]}>#</Text>
            {cols.map((c) => (
              <Text key={c.key} style={[s.th, { flex: c.flex, textAlign: c.align }]}>
                {c.label}
              </Text>
            ))}
          </View>
          {d.lines.map((l, i) => (
            <View key={i} style={s.tableRow} wrap={false}>
              <Text style={[s.td, { width: 18, color: "#64748b" }]}>{i + 1}</Text>
              {cols.map((c) =>
                c.key === "name" ? (
                  <View key={c.key} style={[s.td, { flex: c.flex, paddingRight: 6 }]}>
                    <Text>{l.name}</Text>
                    {l.description ? <Text style={s.small}>{l.description}</Text> : null}
                  </View>
                ) : (
                  <Text key={c.key} style={[s.td, { flex: c.flex, textAlign: c.align }]}>
                    {cell(l, c.key)}
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>
        <View style={s.totals} wrap={false}>
          {d.totals.map((t) => (
            <View key={t.label} style={[s.totalRow, t.boxed ? s.boxed : {}]}>
              <Text style={t.strong ? s.h : s.muted}>{t.label}</Text>
              <Text style={t.strong ? s.h : {}}>{t.value}</Text>
            </View>
          ))}
        </View>
        {d.notes.length ? (
          <View style={{ marginTop: 20 }} wrap={false}>
            <Text style={[s.h, { marginBottom: 3 }]}>Notes</Text>
            <Blocks blocks={d.notes} />
          </View>
        ) : null}
        {d.portal ? (
          <View style={{ marginTop: 20, padding: 10, borderWidth: 1, borderColor: LIGHT, borderRadius: 4 }} wrap={false}>
            <Text style={[s.h, { marginBottom: 3 }]}>View and pay online</Text>
            <Text style={s.muted}>
              Customer portal:{" "}
              <Link src={d.portal.url} style={{ color: "#1d4ed8" }}>
                {d.portal.url}
              </Link>
            </Text>
            <Text style={s.muted}>Sign in with: {d.portal.email}</Text>
            <Text style={s.small}>First visit? Use the setup email you received, or “Forgot password?” on the sign-in page.</Text>
          </View>
        ) : null}
        <Text style={[s.small, { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center" }]} render={({ pageNumber, totalPages }) => `${d.footer} · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
