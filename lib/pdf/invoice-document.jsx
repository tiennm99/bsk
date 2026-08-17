import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";

/** Server-rendered invoice PDF (Be Vietnam Pro registered via registerPdfFonts). */

export type InvoiceLine = { name: string; quantity: number; unitPrice: number; lineTotal: number };

export type InvoiceData = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  patientName: string;
  date: string;
  queueNumber: number | null;
  medicines: InvoiceLine[];
  services: InvoiceLine[];
  total: number;
  paid: boolean;
  labels: {
    invoice: string;
    patient: string;
    date: string;
    queue: string;
    medicines: string;
    services: string;
    item: string;
    qty: string;
    unitPrice: string;
    lineTotal: string;
    total: string;
    paid: string;
    unpaid: string;
  };
};

const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

const s = StyleSheet.create({
  page: { fontFamily: "Be Vietnam Pro", fontSize: 10, padding: 36, color: "#111" },
  clinic: { fontSize: 14, fontWeight: "bold" },
  muted: { color: "#555", fontSize: 9 },
  h1: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8, textAlign: "center" },
  meta: { marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginTop: 14, marginBottom: 4 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 3,
  },
  head: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingVertical: 3,
    fontWeight: "bold",
  },
  cName: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cPrice: { flex: 2, textAlign: "right" },
  cTotal: { flex: 2, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalLabel: { fontWeight: "bold", fontSize: 12, marginRight: 12 },
  totalValue: { fontWeight: "bold", fontSize: 12 },
  status: { marginTop: 10, textAlign: "right", fontSize: 10 },
});

function Table({
  title,
  rows,
  L,
}: {
  title: string;
  rows: InvoiceLine[];
  L: InvoiceData["labels"];
}) {
  if (rows.length === 0) return null;
  return (
    <View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.head}>
        <Text style={s.cName}>{L.item}</Text>
        <Text style={s.cQty}>{L.qty}</Text>
        <Text style={s.cPrice}>{L.unitPrice}</Text>
        <Text style={s.cTotal}>{L.lineTotal}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row}>
          <Text style={s.cName}>{r.name}</Text>
          <Text style={s.cQty}>{r.quantity}</Text>
          <Text style={s.cPrice}>{vnd(r.unitPrice)}</Text>
          <Text style={s.cTotal}>{vnd(r.lineTotal)}</Text>
        </View>
      ))}
    </View>
  );
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const L = data.labels;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.clinic}>{data.clinicName || "—"}</Text>
        {!!data.clinicAddress && <Text style={s.muted}>{data.clinicAddress}</Text>}
        {!!data.clinicPhone && <Text style={s.muted}>{data.clinicPhone}</Text>}

        <Text style={s.h1}>{L.invoice}</Text>

        <Text style={s.meta}>
          {L.patient}: {data.patientName}
        </Text>
        <Text style={s.meta}>
          {L.date}: {data.date}
          {data.queueNumber != null ? `    ${L.queue}: ${data.queueNumber}` : ""}
        </Text>

        <Table title={L.medicines} rows={data.medicines} L={L} />
        <Table title={L.services} rows={data.services} L={L} />

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{L.total}:</Text>
          <Text style={s.totalValue}>{vnd(data.total)}</Text>
        </View>
        <Text style={s.status}>{data.paid ? L.paid : L.unpaid}</Text>
      </Page>
    </Document>
  );
}

/** Render the invoice to a PDF Buffer (Node runtime). Registers fonts first. */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<InvoiceDocument data={data} />);
}
