import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";

/**
 * Server-rendered prescription PDF (Be Vietnam Pro registered via
 * registerPdfFonts). Unlike the invoice, prices are never shown here — the
 * dosage column is the whole point of a prescription.
 */

/**
 * @typedef {object} PrescriptionMedicineLine
 * @property {string} name
 * @property {string | null} unit
 * @property {number} quantity
 * @property {string} dosage
 */

/**
 * @typedef {object} PrescriptionData
 * @property {string} clinicName
 * @property {string} clinicAddress
 * @property {string} clinicPhone
 * @property {string} patientName
 * @property {string | null} patientDob
 * @property {number | null} patientAge
 * @property {string | null} patientGender
 * @property {string | null} patientAddress
 * @property {string} date
 * @property {string | null} diagnosis
 * @property {string | null} doctorName
 * @property {PrescriptionMedicineLine[]} medicines
 * @property {{
 *   prescription: string;
 *   patient: string;
 *   date: string;
 *   dob: string;
 *   age: string;
 *   gender: string;
 *   address: string;
 *   diagnosis: string;
 *   item: string;
 *   qty: string;
 *   dosage: string;
 *   doctor: string;
 *   signature: string;
 * }} labels
 */

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
  cIndex: { flex: 0.5 },
  cName: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cDosage: { flex: 3 },
  signatureWrap: { marginTop: 32, flexDirection: "row", justifyContent: "flex-end" },
  signatureBlock: { width: 200, textAlign: "center" },
  signatureDate: { fontSize: 9, marginBottom: 2 },
  signatureRole: { fontWeight: "bold", marginBottom: 40 },
  signatureHint: { fontSize: 8, color: "#555" },
  signatureName: { fontWeight: "bold", marginTop: 4 },
});

/**
 * @param {{ rows: PrescriptionMedicineLine[]; L: PrescriptionData["labels"] }} props
 */
function MedicineTable({ rows, L }) {
  if (rows.length === 0) return null;
  return (
    <View>
      <View style={s.head}>
        <Text style={s.cIndex}>#</Text>
        <Text style={s.cName}>{L.item}</Text>
        <Text style={s.cQty}>{L.qty}</Text>
        <Text style={s.cDosage}>{L.dosage}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row}>
          <Text style={s.cIndex}>{i + 1}</Text>
          <Text style={s.cName}>{r.unit ? `${r.name} (${r.unit})` : r.name}</Text>
          <Text style={s.cQty}>{r.quantity}</Text>
          <Text style={s.cDosage}>{r.dosage || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

/** @param {{ data: PrescriptionData }} props */
export function PrescriptionDocument({ data }) {
  const L = data.labels;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.clinic}>{data.clinicName || "—"}</Text>
        {!!data.clinicAddress && <Text style={s.muted}>{data.clinicAddress}</Text>}
        {!!data.clinicPhone && <Text style={s.muted}>{data.clinicPhone}</Text>}

        <Text style={s.h1}>{L.prescription}</Text>

        <Text style={s.meta}>
          {L.patient}: {data.patientName}
        </Text>
        <Text style={s.meta}>
          {L.date}: {data.date}
        </Text>
        {(data.patientDob != null || data.patientAge != null) && (
          <Text style={s.meta}>
            {L.dob}: {data.patientDob ?? "—"}
            {data.patientAge != null ? `    ${L.age}: ${data.patientAge}` : ""}
          </Text>
        )}
        {!!data.patientGender && (
          <Text style={s.meta}>
            {L.gender}: {data.patientGender}
          </Text>
        )}
        {!!data.patientAddress && (
          <Text style={s.meta}>
            {L.address}: {data.patientAddress}
          </Text>
        )}
        {!!data.diagnosis && (
          <Text style={s.meta}>
            {L.diagnosis}: {data.diagnosis}
          </Text>
        )}

        <Text style={s.sectionTitle}>{L.item}</Text>
        <MedicineTable rows={data.medicines} L={L} />

        <View style={s.signatureWrap}>
          <View style={s.signatureBlock}>
            <Text style={s.signatureDate}>{data.date}</Text>
            <Text style={s.signatureRole}>{L.doctor}</Text>
            <Text style={s.signatureHint}>{L.signature}</Text>
            <Text style={s.signatureName}>{data.doctorName ?? "—"}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Render the prescription to a PDF Buffer (Node runtime). Registers fonts first.
 * @param {PrescriptionData} data
 * @returns {Promise<Buffer>}
 */
export async function renderPrescriptionPdf(data) {
  registerPdfFonts();
  return renderToBuffer(<PrescriptionDocument data={data} />);
}
