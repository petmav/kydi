import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Block } from "./html";

/** Generic PDF for receipts, reports and statements: header + sections of tables + summary rows. */

export type PdfTable = { columns: { label: string; align?: "left" | "right"; flex?: number }[]; rows: string[][]; footer?: string[] };
export type PdfSection = { heading?: string; table?: PdfTable; summary?: { label: string; value: string; strong?: boolean; boxed?: boolean }[]; blocks?: Block[]; note?: string };
export type SimplePdfData = {
  logo: Buffer | null;
  companyName: string;
  companyBlock: Block[];
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  party?: { heading: string; blocks: Block[] };
  highlight?: { label: string; value: string };
  sections: PdfSection[];
  footer: string;
};

const GREY = "#94a3b8";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a", lineHeight: 1.35 },
  between: { flexDirection: "row", justifyContent: "space-between" },
  h: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#475569" },
  small: { fontSize: 8, color: "#64748b" },
  rule: { borderBottomWidth: 0.75, borderBottomColor: GREY, marginVertical: 10 },
  head: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: GREY },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 4, paddingHorizontal: 2 },
  td: { paddingVertical: 4, paddingHorizontal: 2 },
  box: { borderWidth: 0.75, borderColor: "#334155", padding: 8, marginTop: 10, width: 220 },
});

function Blocks({ blocks, align = "left" }: { blocks: Block[]; align?: "left" | "right" }) {
  return (
    <View>
      {blocks.map((b, i) => (
        <Text key={i} style={[b.bold ? s.h : {}, { textAlign: align }]}>
          {b.text}
        </Text>
      ))}
    </View>
  );
}

export function SimplePdf({ d }: { d: SimplePdfData }) {
  return (
    <Document title={d.title} creator="Halyard" producer="Halyard">
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          {d.logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={d.logo} style={{ maxHeight: 44, maxWidth: 150, objectFit: "contain" }} />
          ) : (
            <Text style={[s.h, { fontSize: 15 }]}>{d.companyName}</Text>
          )}
          <Blocks blocks={d.companyBlock} align="right" />
        </View>
        <View style={s.rule} />
        <View style={s.between}>
          <View>
            <Text style={[s.h, { fontSize: 14 }]}>{d.title}</Text>
            {d.subtitle ? <Text style={s.muted}>{d.subtitle}</Text> : null}
          </View>
          {d.meta ? (
            <View style={{ width: 210 }}>
              {d.meta.map((m) => (
                <View key={m.label} style={s.between}>
                  <Text style={s.muted}>{m.label}</Text>
                  <Text>{m.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {d.party ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[s.small, { marginBottom: 2 }]}>{d.party.heading}</Text>
            <Blocks blocks={d.party.blocks} />
          </View>
        ) : null}
        {d.highlight ? (
          <View style={s.box}>
            <Text style={s.muted}>{d.highlight.label}</Text>
            <Text style={[s.h, { fontSize: 14 }]}>{d.highlight.value}</Text>
          </View>
        ) : null}
        {d.sections.map((sec, i) => (
          <View key={i} style={{ marginTop: 14 }}>
            {sec.heading ? <Text style={[s.h, { fontSize: 10, marginBottom: 4 }]}>{sec.heading}</Text> : null}
            {sec.table ? (
              <View>
                <View style={s.head}>
                  {sec.table.columns.map((c, j) => (
                    <Text key={j} style={[s.th, { flex: c.flex ?? 1, textAlign: c.align ?? "left" }]}>
                      {c.label}
                    </Text>
                  ))}
                </View>
                {sec.table.rows.map((r, k) => (
                  <View key={k} style={s.row} wrap={false}>
                    {r.map((v, j) => (
                      <Text key={j} style={[s.td, { flex: sec.table!.columns[j]?.flex ?? 1, textAlign: sec.table!.columns[j]?.align ?? "left" }]}>
                        {v}
                      </Text>
                    ))}
                  </View>
                ))}
                {sec.table.footer ? (
                  <View style={[s.row, { borderBottomColor: GREY }]}>
                    {sec.table.footer.map((v, j) => (
                      <Text key={j} style={[s.td, s.h, { flex: sec.table!.columns[j]?.flex ?? 1, textAlign: sec.table!.columns[j]?.align ?? "left" }]}>
                        {v}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {sec.summary ? (
              <View style={{ marginLeft: "auto", width: 240, marginTop: 6 }}>
                {sec.summary.map((r) => (
                  <View key={r.label} style={[s.between, { paddingVertical: 2 }, r.boxed ? { borderWidth: 0.75, borderColor: "#334155", padding: 4 } : {}]}>
                    <Text style={r.strong ? s.h : s.muted}>{r.label}</Text>
                    <Text style={r.strong ? s.h : {}}>{r.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {sec.blocks ? <Blocks blocks={sec.blocks} /> : null}
            {sec.note ? <Text style={[s.small, { marginTop: 4 }]}>{sec.note}</Text> : null}
          </View>
        ))}
        <Text style={[s.small, { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center" }]} render={({ pageNumber, totalPages }) => `${d.footer} · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
